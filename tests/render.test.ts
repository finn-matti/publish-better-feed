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
