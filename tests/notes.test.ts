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

describe('vaultMetaResolver', () => {
	it('uses the basename and no summary for a note missing locally', async () => {
		const resolve = vaultMetaResolver(fakeApp({}));
		expect(await resolve('Folder/Gone.md')).toEqual({ title: 'Gone', summary: '' });
	});

	it('prefers frontmatter title and description', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({
				'a.md': {
					frontmatter: { title: 'Nice title', description: 'Short.' },
					content: 'Body text that is ignored.',
				},
			}),
		);
		expect(await resolve('a.md')).toEqual({ title: 'Nice title', summary: 'Short.' });
	});

	it('falls back to the basename and the first paragraph', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({ 'Sub/Note.md': { content: '# Heading\n\nFirst **paragraph** here.\n\nSecond.' } }),
		);
		expect(await resolve('Sub/Note.md')).toEqual({
			title: 'Note',
			summary: 'First paragraph here.',
		});
	});

	it('ignores blank frontmatter values and survives a failed read', async () => {
		const resolve = vaultMetaResolver(
			fakeApp({ 'b.md': { frontmatter: { title: '  ', description: 42 }, readFails: true } }),
		);
		expect(await resolve('b.md')).toEqual({ title: 'b', summary: '' });
	});
});
