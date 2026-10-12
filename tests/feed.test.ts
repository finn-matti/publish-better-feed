import { describe, expect, it, vi } from 'vitest';
import { buildEntries, noteUrl } from '../src/entries';
import { buildAtom } from '../src/feed';
import { gitBlobSha, sha256Hex } from '../src/hash';
import { firstParagraph } from '../src/notes';
import { hookPublish, parsePublishList, resolveSiteUrl } from '../src/publish';
import { mockPublish } from './mock-publish';

const file = (path: string, mtime: number, ctime = mtime) => ({
	path,
	hash: 'h',
	ctime,
	mtime,
	size: 1,
});

describe('noteUrl', () => {
	it('uses + for spaces, encodes the rest, keeps folders', () => {
		expect(noteUrl('https://x.test/s/', 'Sub dir/My Note.md')).toBe(
			'https://x.test/s/Sub+dir/My+Note',
		);
		expect(noteUrl('https://x.test', 'a+b&c.md')).toBe('https://x.test/a%2Bb%26c');
	});
});

describe('resolveSiteUrl', () => {
	it('uses the slug on publish.obsidian.md', async () => {
		expect(await resolveSiteUrl(mockPublish())).toBe('https://publish.obsidian.md/my-slug');
	});
	it('prefers a custom domain and adds a scheme', async () => {
		const inst = mockPublish();
		inst.apiCustomUrl = () => Promise.resolve({ url: 'notes.example.com/' });
		expect(await resolveSiteUrl(inst)).toBe('https://notes.example.com');
	});
	it('falls back to siteId when lookups fail', async () => {
		const inst = mockPublish();
		inst.apiCustomUrl = () => Promise.reject(new Error('offline'));
		inst.getCurrentSlug = () => Promise.reject(new Error('offline'));
		expect(await resolveSiteUrl(inst)).toBe('https://publish.obsidian.md/abc123');
	});
});

describe('buildEntries', () => {
	it('sorts newest first and skips non-notes', async () => {
		const entries = await buildEntries(
			[
				file('old.md', 1_700_000_000_000),
				file('img.png', 1_900_000_000_000),
				file('new.md', 1_750_000_000_000),
			],
			{
				siteUrl: 'https://x.test',
				maxEntries: 10,
				resolve: (f) => Promise.resolve({ title: f.path, summary: '' }),
			},
		);
		expect(entries.map((e) => e.title)).toEqual(['new.md', 'old.md']);
	});
});

describe('buildEntries summary', () => {
	it('falls back to the title when a note has no summary', async () => {
		const [entry] = await buildEntries([file('empty.md', 1_700_000_000_000)], {
			siteUrl: 'https://x.test',
			maxEntries: 5,
			resolve: () => Promise.resolve({ title: 'Empty', summary: '' }),
		});
		expect(entry?.summary).toBe('Empty');
	});
});

describe('buildAtom', () => {
	it('escapes and is deterministic', async () => {
		const entries = await buildEntries([file('a.md', 1_700_000_000_000)], {
			siteUrl: 'https://x.test',
			maxEntries: 5,
			resolve: () =>
				Promise.resolve({ title: 'A & <B>', summary: 'say "hi"' }),
		});
		const meta = { title: 'T', siteUrl: 'https://x.test', feedUrl: 'https://x.test/f.xml', author: 'Me' };
		const xml = buildAtom(meta, entries);
		expect(xml).toContain('<author><name>Me</name></author>');
		expect(xml).toContain('<title>A &amp; &lt;B&gt;</title>');
		expect(xml).toContain('say &quot;hi&quot;');
		expect(buildAtom(meta, entries)).toBe(xml);
	});
});

describe('buildAtom content', () => {
	it('emits escaped HTML content when present', async () => {
		const entries = await buildEntries([file('a.md', 1_700_000_000_000)], {
			siteUrl: 'https://x.test',
			maxEntries: 5,
			resolve: () => Promise.resolve({ title: 'A', summary: 's', content: '<p>Hi &amp; <b>there</b></p>' }),
		});
		const xml = buildAtom({ title: 'T', siteUrl: 'https://x.test', feedUrl: 'https://x.test/f.atom', author: 'Me' }, entries);
		expect(xml).toContain('<content type="html">&lt;p&gt;Hi &amp;amp; &lt;b&gt;there&lt;/b&gt;&lt;/p&gt;</content>');
		expect(xml).toContain('<summary type="text">s</summary>');
	});
	it('omits content when there is none', async () => {
		const entries = await buildEntries([file('a.md', 1_700_000_000_000)], {
			siteUrl: 'https://x.test',
			maxEntries: 5,
			resolve: () => Promise.resolve({ title: 'A', summary: 's' }),
		});
		expect(buildAtom({ title: 'T', siteUrl: 'https://x.test', feedUrl: 'f', author: 'Me' }, entries)).not.toContain('<content');
	});
});

describe('firstParagraph', () => {
	it('skips frontmatter and headings, flattens links', () => {
		const md = '---\nfoo: 1\n---\n# Title\n\nSee [[Other|this]] and **bold**.\n\nSecond.';
		expect(firstParagraph(md)).toBe('See this and bold.');
	});
});

describe('gitBlobSha', () => {
	it('matches git hash-object', async () => {
		expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(
			'ce013625030ba8dba906f756967f9e9ca394464a',
		);
	});
});

describe('sha256Hex', () => {
	it('returns lowercase hex like Publish', async () => {
		expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		);
	});
});

describe('parsePublishList', () => {
	it('tolerates garbage', () => {
		expect(parsePublishList(null)).toEqual([]);
		expect(parsePublishList({ files: [1, { path: 'a.md' }] })).toHaveLength(1);
	});
});

describe('hookPublish', () => {
	it('notifies after success, returns original result, uninstalls cleanly', async () => {
		const inst = mockPublish();
		const onChange = vi.fn();
		const off = hookPublish(inst, onChange);
		expect(await inst.apiUploadFile('a.md')).toBe('uploaded');
		await Promise.resolve();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(inst.calls).toEqual(['upload:a.md']);
		off();
		await inst.apiRemoveFile('a.md');
		await Promise.resolve();
		expect(onChange).toHaveBeenCalledTimes(1);
	});
	it('does not notify when the call rejects, and does not swallow the rejection', async () => {
		const inst = mockPublish();
		inst.apiUploadFile = () => Promise.reject(new Error('nope'));
		const onChange = vi.fn();
		hookPublish(inst, onChange);
		await expect(inst.apiUploadFile('a.md')).rejects.toThrow('nope');
		expect(onChange).not.toHaveBeenCalled();
	});
});
