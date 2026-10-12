import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { vaultMetaResolver } from '../src/notes';

interface Note {
	frontmatter?: Record<string, unknown>;
	content?: string;
	readFails?: boolean;
}

function fakeApp(notes: Record<string, Note>): App {
	return {
		vault: {
			getFileByPath: (p: string) => (p in notes ? { path: p } : null),
			cachedRead: (f: { path: string }) => {
				const n = notes[f.path]!;
				return n.readFails ? Promise.reject(new Error('read')) : Promise.resolve(n.content ?? '');
			},
		},
		metadataCache: {
			getFileCache: (f: { path: string }) => ({ frontmatter: notes[f.path]!.frontmatter }),
		},
	} as unknown as App;
}

const live = (path: string, hash = 'live') => ({ path, hash, ctime: 1, mtime: 1, size: 1 });
const always = () => Promise.resolve(true);

describe('vaultMetaResolver', () => {
	it('uses the basename and no summary for a note missing locally', async () => {
		const resolve = vaultMetaResolver(fakeApp({}), always);
		expect(await resolve(live('Folder/Gone.md'))).toEqual({ title: 'Gone', summary: '' });
	});

	it('prefers frontmatter title and description', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({
				'a.md': {
					frontmatter: { title: 'Nice title', description: 'Short.' },
					content: 'Body text that is ignored.',
				},
			}),
			always,
		);
		expect(await resolve(live('a.md'))).toEqual({ title: 'Nice title', summary: 'Short.' });
	});

	it('falls back to the basename and the first paragraph', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({ 'Sub/Note.md': { content: '# Heading\n\nFirst **paragraph** here.\n\nSecond.' } }),
			always,
		);
		expect(await resolve(live('Sub/Note.md'))).toEqual({
			title: 'Note',
			summary: 'First paragraph here.',
		});
	});

	it('ignores blank frontmatter values and survives a failed read', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({ 'b.md': { frontmatter: { title: '  ', description: 42 }, readFails: true } }),
			always,
		);
		expect(await resolve(live('b.md'))).toEqual({ title: 'b', summary: '' });
	});

	it('never uses local text when the file differs from what is live', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({
				'draft.md': {
					frontmatter: { title: 'Unpublished title', description: 'Unpublished text.' },
					content: 'Embarrassing unpublished paragraph.',
				},
			}),
			() => Promise.resolve(false),
		);
		expect(await resolve(live('draft.md'))).toEqual({ title: 'draft', summary: '' });
	});

	it('asks with the local file and the live hash', async () => {
		const asked: Array<[unknown, string]> = [];
		const resolve = vaultMetaResolver(fakeApp({ 'a.md': { content: 'x' } }), (file, hash) => {
			asked.push([file, hash]);
			return Promise.resolve(true);
		});
		await resolve(live('a.md', 'abc'));
		expect(asked).toEqual([[{ path: 'a.md' }, 'abc']]);
	});
});
