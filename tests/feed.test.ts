import { describe, expect, it, vi } from 'vitest';
import { buildEntries, noteUrl } from '../src/entries';
import { buildAtom } from '../src/feed';
import { gitBlobSha } from '../src/hash';
import { firstParagraph } from '../src/notes';
import { hookPublish, parsePublishList } from '../src/publish';
import { mockPublish } from './mock-publish';

const file = (path: string, mtime: number, ctime = mtime) => ({
	path,
	hash: 'h',
	ctime,
	mtime,
	size: 1,
});

describe('noteUrl', () => {
	it('uses + for spaces and keeps folders', () => {
		expect(noteUrl('https://x.test/s/', 'Sub dir/My Note.md')).toBe(
			'https://x.test/s/Sub+dir/My+Note',
		);
	});
	it('honors permalink', () => {
		expect(noteUrl('https://x.test', 'a.md', '/custom')).toBe('https://x.test/custom');
	});
});

describe('buildEntries', () => {
	it('sorts newest first, skips non-notes and feed: skip', async () => {
		const entries = await buildEntries(
			[
				file('old.md', 1_700_000_000_000),
				file('img.png', 1_900_000_000_000),
				file('hidden.md', 1_800_000_000_000),
				file('new.md', 1_750_000_000_000),
			],
			{
				siteUrl: 'https://x.test',
				maxEntries: 10,
				resolve: (p) =>
					Promise.resolve({ title: p, summary: '', skip: p === 'hidden.md' }),
			},
		);
		expect(entries.map((e) => e.title)).toEqual(['new.md', 'old.md']);
	});
});

describe('buildAtom', () => {
	it('escapes and is deterministic', async () => {
		const entries = await buildEntries([file('a.md', 1_700_000_000_000)], {
			siteUrl: 'https://x.test',
			maxEntries: 5,
			resolve: () =>
				Promise.resolve({ title: 'A & <B>', summary: 'say "hi"', skip: false }),
		});
		const meta = { title: 'T', siteUrl: 'https://x.test', feedUrl: 'https://x.test/f.xml' };
		const xml = buildAtom(meta, entries);
		expect(xml).toContain('<title>A &amp; &lt;B&gt;</title>');
		expect(xml).toContain('say &quot;hi&quot;');
		expect(buildAtom(meta, entries)).toBe(xml);
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
