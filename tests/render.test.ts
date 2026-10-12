import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/render';

const SITE = 'https://publish.obsidian.md/testvault';
const ASSETS = 'https://publish-01.obsidian.md/access/SITEID';
const FILES = [
	'Publish handling test.md',
	'Embedded note.md',
	'test-image.png',
	'Sub folder/Nested note.md',
	'Sub folder/pic.png',
	'Plus+sign.md',
	'doc.pdf',
];
// "Secret draft" is deliberately not published.

const render = createRenderer({ siteUrl: SITE, assetBase: ASSETS, files: FILES });
const html = (md: string, path = 'Publish handling test.md') => render(md, path);

describe('wikilinks', () => {
	it('links published notes, with alias, heading and block fragments', () => {
		const out = html('[[Embedded note]] [[Embedded note|the alias]] [[Embedded note#Head]] [[Embedded note#^abc]]');
		expect(out).toContain(`<a href="${SITE}/Embedded+note">Embedded note</a>`);
		expect(out).toContain(`<a href="${SITE}/Embedded+note">the alias</a>`);
		expect(out).toContain(`<a href="${SITE}/Embedded+note#Head">Embedded note > Head</a>`);
		expect(out).toContain(`<a href="${SITE}/Embedded+note#%5Eabc">Embedded note > ^abc</a>`);
	});

	it('renders unpublished and missing targets as plain text, never as links', () => {
		const out = html('[[Secret draft]] and [[Does not exist]]');
		expect(out).not.toContain('<a');
		expect(out).toContain('Secret draft');
		expect(out).toContain('Does not exist');
	});

	it('shows only the alias for an unpublished target', () => {
		const out = html('[[Secret draft|hidden alias]]');
		expect(out).toContain('hidden alias');
		expect(out).not.toContain('Secret');
		expect(out).not.toContain('<a');
	});

	it('resolves by name across folders, case-insensitively, and by path', () => {
		expect(html('[[nested note]]')).toContain(`href="${SITE}/Sub+folder/Nested+note"`);
		expect(html('[[Sub folder/Nested note]]')).toContain(`href="${SITE}/Sub+folder/Nested+note"`);
		expect(html('[[Plus+sign]]')).toContain(`href="${SITE}/Plus%2Bsign"`);
	});

	it('prefers a note in the same folder when names collide', () => {
		const r = createRenderer({
			siteUrl: SITE,
			assetBase: ASSETS,
			files: ['a/Note.md', 'b/Note.md', 'b/Other.md'],
		});
		expect(r('[[Note]]', 'b/Other.md')).toContain(`href="${SITE}/b/Note"`);
	});

	it('links a heading of the same note', () => {
		expect(html('[[#Intro]]')).toContain(`<a href="${SITE}/Publish+handling+test#Intro">Intro</a>`);
	});
});

describe('embeds', () => {
	it('embeds published images with the real asset URL', () => {
		expect(html('![[test-image.png]]')).toContain(
			`<img src="${ASSETS}/test-image.png" alt="test-image.png">`,
		);
		expect(html('![[Sub folder/pic.png]]')).toContain(`src="${ASSETS}/Sub%20folder/pic.png"`);
	});

	it('applies size and alt text from the alias', () => {
		expect(html('![[test-image.png|100]]')).toContain('width="100"');
		expect(html('![[test-image.png|my alt]]')).toContain('alt="my alt"');
		const both = html('![[test-image.png|my alt|100x50]]');
		expect(both).toContain('alt="my alt"');
		expect(both).toContain('width="100"');
		expect(both).toContain('height="50"');
	});

	it('links a published note embed instead of inlining it', () => {
		const out = html('![[Embedded note]]');
		expect(out).toContain(`<a href="${SITE}/Embedded+note">Embedded note</a>`);
	});

	it('drops embeds of anything unpublished without a trace', () => {
		const out = html('before ![[Secret draft]] after ![[secret.png]]');
		expect(out).not.toContain('Secret');
		expect(out).not.toContain('secret');
		expect(out).toContain('before');
	});

	it('links other published files to their asset URL', () => {
		expect(html('![[doc.pdf]]')).toContain(`<a href="${ASSETS}/doc.pdf">doc.pdf</a>`);
	});
});

describe('Markdown links and images', () => {
	it('resolves relative images to published assets and drops unpublished ones', () => {
		expect(html('![md alt](test-image.png)')).toContain(`<img src="${ASSETS}/test-image.png" alt="md alt">`);
		expect(html('![x](Sub%20folder/pic.png)')).toContain(`src="${ASSETS}/Sub%20folder/pic.png"`);
		expect(html('![x](missing.png)')).not.toContain('<img');
	});

	it('keeps http(s) and mailto, and unwraps everything else to plain text', () => {
		expect(html('[a](https://example.com)')).toContain('<a href="https://example.com">a</a>');
		expect(html('[m](mailto:me@example.com)')).toContain('href="mailto:me@example.com"');
		for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test/x', 'file:///etc/passwd']) {
			const out = html(`[click](${bad})`);
			expect(out).not.toContain('<a');
			expect(out).toContain('click');
		}
		expect(html('![i](data:image/png;base64,AAAA)')).not.toContain('<img');
	});

	it('resolves relative note links and unwraps unpublished ones', () => {
		expect(html('[n](Embedded%20note.md)')).toContain(`href="${SITE}/Embedded+note"`);
		expect(html('[n](Secret%20draft.md)')).not.toContain('<a');
	});

	it('still handles an image inside an unwrapped link', () => {
		const out = html('[![i](test-image.png)](javascript:x)');
		expect(out).not.toContain('<a');
		expect(out).toContain(`src="${ASSETS}/test-image.png"`);
	});
});

describe('Obsidian syntax', () => {
	it('renders highlights as mark and tags as plain text', () => {
		const out = html('==Highlighted== and #sometag');
		expect(out).toContain('<mark>Highlighted</mark>');
		expect(out).toContain('#sometag');
		expect(out).not.toContain('<a');
	});

	it('removes inline and multi-line comments completely', () => {
		const out = html('keep %%hidden inline%% this\n\n%%\nmulti\nline\n%%\n\nend');
		expect(out).not.toMatch(/hidden|multi|line|%%/);
		expect(out).toContain('keep');
		expect(out).toContain('end');
	});

	it('leaves comment markers and wikilinks inside code alone', () => {
		const out = html('```\n%%kept%% [[Embedded note]]\n```\n\n`%%also%% [[Embedded note]]`');
		expect(out).toContain('%%kept%% [[Embedded note]]');
		expect(out).toContain('%%also%% [[Embedded note]]');
		expect(out).not.toContain('<a');
	});

	it('turns callouts into blockquotes with a bold title, always expanded', () => {
		const out = html('> [!note] Callout title\n> Callout body.\n\n> [!warning]- Foldable\n> Folded body.');
		expect(out).toContain('<blockquote>\n<p><strong>Callout title</strong></p>\n<p>Callout body.</p>');
		expect(out).toContain('<strong>Foldable</strong>');
		expect(out).toContain('Folded body.');
		expect(out).not.toContain('[!');
	});

	it('uses the callout type as the title when none is given, and keeps inline formatting', () => {
		const out = html('> [!warning]\n> Careful.\n\n> [!tip] A *nice* tip');
		expect(out).toContain('<strong>Warning</strong>');
		expect(out).toContain('<strong>A <em>nice</em> tip</strong>');
	});

	it('renders math as code, plus standard Markdown', () => {
		const out = html('$x^2$\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\nNote[^1]\n\n[^1]: Foot.');
		expect(out).toContain('math-inline');
		expect(out).toContain('<table>');
		expect(out).toContain('type="checkbox"');
		expect(out).toContain('Foot.');
	});
});

describe('what never reaches the output', () => {
	it('strips frontmatter, with BOM and CRLF', () => {
		expect(html('---\ndescription: SECRET-FM\n---\nBody')).not.toContain('SECRET-FM');
		expect(html('﻿---\r\ntitle: SECRET-FM\r\n---\r\nBody')).not.toContain('SECRET-FM');
	});

	it('drops raw HTML', () => {
		const out = html('<script>alert(1)</script>\n\n<div onclick="x()">raw</div>\n\ntext <b onmouseover="y()">b</b>');
		expect(out).not.toMatch(/script|onclick|onmouseover|<div|<b/i);
		expect(out).toContain('text');
	});
});

describe('reference-style links and images obey the same URL policy', () => {
	it('links a reference to an allowed URL and unwraps a disallowed one', () => {
		expect(html('[x][1]\n\n[1]: https://example.com "Title"')).toContain(
			'<a href="https://example.com" title="Title">x</a>',
		);
		for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test']) {
			const out = html(`[click][1]\n\n[1]: ${bad}`);
			expect(out).not.toContain('<a');
			expect(out).toContain('click');
		}
	});

	it('shows only the text for a reference with no definition', () => {
		const out = html('[lost][nope]');
		expect(out).not.toContain('<a');
		expect(out).toContain('lost');
	});

	it('resolves image references to published assets only', () => {
		expect(html('![a][i]\n\n[i]: test-image.png')).toContain(`src="${ASSETS}/test-image.png"`);
		expect(html('![a][i]\n\n[i]: missing.png')).not.toContain('<img');
		expect(html('![a][i]\n\n[i]: javascript:x')).not.toContain('<img');
		expect(html('![a][none]')).not.toContain('<img');
	});

	it('never outputs definitions themselves', () => {
		expect(html('[1]: https://example.com')).toBe('');
	});
});

describe('escaping', () => {
	it('escapes text, inline code and fenced code', () => {
		const out = html('a < b & c <script>x</script>\n\n`<b>`\n\n```\n<i>&amp;</i>\n```');
		expect(out).toContain('a &lt; b &amp; c');
		expect(out).toContain('<code>&lt;b></code>');
		expect(out).toContain('&lt;i>&amp;amp;&lt;/i>');
		expect(out).not.toMatch(/<script|<b>|<i>/);
	});

	it('escapes attributes', () => {
		const out = html('[a](https://example.com/?q="x"&y=1 "he said \\"hi\\"")\n\n![say "hi"](test-image.png)');
		expect(out).toContain('&quot;');
		expect(out).not.toMatch(/="[^"]*"[^ >]*"[^>]*>/);
		expect(out).toContain('alt="say &quot;hi&quot;"');
	});

	it('refuses a code fence language that could break out of the attribute', () => {
		const out = html('```js" onclick="x\ncode\n```');
		expect(out).not.toContain('onclick');
		expect(out).toContain('<pre><code>');
		expect(html('```ts\ncode\n```')).toContain('class="language-ts"');
	});
});

describe('Markdown structure', () => {
	it('renders headings, emphasis, strikethrough, breaks, rules and autolinks', () => {
		const out = html('### H3\n\n*em* **b** ~~gone~~ line\\\nbreak\n\n---\n\nsee www.example.com');
		expect(out).toContain('<h3>H3</h3>');
		expect(out).toContain('<em>em</em> <strong>b</strong> <del>gone</del>');
		expect(out).toContain('<br>');
		expect(out).toContain('<hr>');
		expect(out).toContain('<a href="http://www.example.com">www.example.com</a>');
	});

	it('renders tight and loose lists, numbering and nesting', () => {
		expect(html('- a\n- b')).toBe('<ul>\n<li>a</li>\n<li>b</li>\n</ul>');
		expect(html('3. a\n4. b')).toContain('<ol start="3">');
		expect(html('1. a')).toContain('<ol>');
		expect(html('- a\n\n- b')).toContain('<li><p>a</p>\n</li>');
		const nested = html('- a\n  - b');
		expect(nested).toContain('<li>a\n<ul>\n<li>b</li>\n</ul></li>');
	});

	it('renders task items and table alignment', () => {
		expect(html('- [ ] t\n- [x] d')).toContain('<li><input type="checkbox" disabled> t</li>');
		expect(html('- [x] d')).toContain('<input type="checkbox" checked disabled> d');
		const t = html('| l | c | r |\n|:--|:-:|--:|\n| 1 | 2 | 3 |');
		expect(t).toContain('<th align="left">l</th><th align="center">c</th><th align="right">r</th>');
		expect(t).toContain('<td align="right">3</td>');
		expect(html('| only |\n|---|')).not.toContain('<tbody>');
	});

	it('renders nested blockquotes and drops raw HTML inside structures', () => {
		const out = html('> outer\n>\n> > inner\n\n- item <b onclick="x()">bold</b>\n\n> <div>raw</div>');
		expect(out).toContain('<blockquote>\n<p>outer</p>\n<blockquote>\n<p>inner</p>\n</blockquote>\n</blockquote>');
		expect(out).not.toMatch(/onclick|<b[ >]|<div/);
	});

	it('returns nothing for empty input or frontmatter alone', () => {
		expect(html('')).toBe('');
		expect(html('---\ntitle: x\n---\n')).toBe('');
	});
});

describe('math and footnotes', () => {
	it('keeps formulas intact instead of parsing them as Markdown', () => {
		const out = html('$a_1 * b_2$ and\n\n$$\nx_i * y_i\n$$');
		expect(out).toContain('<code class="language-math math-inline">a_1 * b_2</code>');
		expect(out).toContain('<pre><code class="language-math math-display">x_i * y_i\n</code></pre>');
		expect(out).not.toContain('<em>');
	});

	it('numbers footnotes in order of first reference, without anchors or ids', () => {
		const out = html('B[^b] then A[^a] and B again[^b].\n\n[^a]: Note A.\n[^b]: Note B.\n[^c]: Unused.');
		expect(out).toContain('B<sup>1</sup> then A<sup>2</sup> and B again<sup>1</sup>.');
		expect(out.indexOf('Note B.')).toBeLessThan(out.indexOf('Note A.'));
		expect(out).not.toContain('Unused');
		expect(out).not.toMatch(/id=|href="#/);
		expect(html('Lost[^zzz]')).not.toContain('<sup>');
	});
});

describe('duplicate title', () => {
	it('leaves out a leading heading that repeats the entry title', () => {
		const md = '# My Note\n\nBody.\n\n# Other';
		expect(render(md, 'a.md', 'My Note')).toBe('<p>Body.</p>\n<h1>Other</h1>');
		expect(render('# my *note*\n\nBody.', 'a.md', 'My Note')).toBe('<p>Body.</p>');
	});

	it('keeps a heading that differs, is not first, is not level 1, or when no title is given', () => {
		expect(render('# Different\n\nBody.', 'a.md', 'My Note')).toContain('<h1>Different</h1>');
		expect(render('Intro\n\n# My Note', 'a.md', 'My Note')).toContain('<h1>My Note</h1>');
		expect(render('## My Note', 'a.md', 'My Note')).toContain('<h2>My Note</h2>');
		expect(render('# My Note', 'a.md')).toContain('<h1>My Note</h1>');
	});

	it('still drops it when the heading holds a link', () => {
		expect(render('# [[Embedded note]]\n\nBody.', 'a.md', 'Embedded note')).toBe('<p>Body.</p>');
	});
});

describe('permalinks', () => {
	const r = createRenderer({
		siteUrl: SITE,
		assetBase: ASSETS,
		files: FILES,
		permalinks: new Map([
			['Embedded note.md', '/custom-link/for-probe'],
			['Plus+sign.md', 'with space'],
		]),
	});
	const url = `${SITE}/custom-link/for-probe`;

	it('links to the permalink URL instead of the path, keeping fragments', () => {
		const out = r('[[Embedded note]] [[Embedded note|alias]] [[Embedded note#Head]]', 'Publish handling test.md');
		expect(out).toContain(`<a href="${url}">Embedded note</a>`);
		expect(out).toContain(`<a href="${url}">alias</a>`);
		expect(out).toContain(`<a href="${url}#Head">Embedded note > Head</a>`);
		expect(out).not.toContain('Embedded+note');
	});

	it('applies to note embeds, relative Markdown links and the note itself', () => {
		expect(r('![[Embedded note]]', 'a.md')).toContain(`href="${url}"`);
		expect(r('[n](Embedded%20note.md)', 'a.md')).toContain(`href="${url}"`);
		expect(r('[x](#Intro)', 'Embedded note.md')).toContain(`href="${url}#Intro"`);
	});

	it('leaves other notes on their path URLs', () => {
		expect(r('[[Nested note]]', 'a.md')).toContain(`href="${SITE}/Sub+folder/Nested+note"`);
	});

	it('uses the path URL when the permalink could not be loaded directly', () => {
		expect(r('[[Plus+sign]]', 'a.md')).toContain(`href="${SITE}/Plus%2Bsign"`);
	});
});
