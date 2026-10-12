import { describe, expect, it, vi } from 'vitest';
import { metaResolver } from '../src/notes';

const live = (path: string) => ({ path, hash: 'h', ctime: 1, mtime: 1, size: 1 });
const text = (t: string | null) => () => Promise.resolve(t);

// Just enough YAML for `key: value` lines; the real parser is Obsidian's parseYaml.
const parseYaml = (yaml: string) =>
	Object.fromEntries(
		yaml.split('\n').map((l) => {
			const i = l.indexOf(':');
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
		}),
	);

describe('metaResolver', () => {
	it('uses the file name and no summary when there is no published text', async () => {
		const resolve = metaResolver(text(null), parseYaml);
		expect(await resolve(live('Folder/Gone.md'))).toEqual({ title: 'Gone', summary: '' });
	});

	it('prefers frontmatter title and description', async () => {
		const resolve = metaResolver(
			text('---\ntitle: Nice title\ndescription: Short.\n---\nBody that is ignored.'),
			parseYaml,
		);
		expect(await resolve(live('a.md'))).toEqual({ title: 'Nice title', summary: 'Short.' });
	});

	it('falls back to the file name and the first paragraph', async () => {
		const resolve = metaResolver(
			text('# Heading\n\nFirst **paragraph** here.\n\nSecond.'),
			parseYaml,
		);
		expect(await resolve(live('Sub/Note.md'))).toEqual({
			title: 'Note',
			summary: 'First paragraph here.',
		});
	});

	it('handles a BOM and CRLF line endings', async () => {
		const resolve = metaResolver(
			text('\uFEFF---\r\ndescription: From CRLF.\r\n---\r\nBody.'),
			parseYaml,
		);
		expect((await resolve(live('a.md'))).summary).toBe('From CRLF.');
	});

	it('ignores blank and non-string values', async () => {
		const resolve = metaResolver(text('---\nx\n---\nBody text.'), () => ({
			title: '  ',
			description: 42,
		}));
		expect(await resolve(live('b.md'))).toEqual({ title: 'b', summary: 'Body text.' });
	});

	it('survives invalid frontmatter', async () => {
		const resolve = metaResolver(text('---\n: : :\n---\nBody text.'), () => {
			throw new Error('bad yaml');
		});
		expect(await resolve(live('c.md'))).toEqual({ title: 'c', summary: 'Body text.' });
	});

	it('asks for the text of the file it resolves', async () => {
		const getText = vi.fn(() => Promise.resolve('x'));
		const file = live('a.md');
		await metaResolver(getText, parseYaml)(file);
		expect(getText).toHaveBeenCalledWith(file);
	});

	it('adds rendered content when a renderer is given, and survives a failing renderer', async () => {
		const withRender = metaResolver(text('# T\n\nBody.'), parseYaml, (t, p, title) => `<x>${p}:${t.length}:${title}</x>`);
		expect((await withRender(live('a.md'))).content).toBe('<x>a.md:10:a</x>');
		const failing = metaResolver(text('Body.'), parseYaml, () => {
			throw new Error('boom');
		});
		expect(await failing(live('a.md'))).toEqual({ title: 'a', summary: 'Body.', content: undefined });
		const none = metaResolver(text('Body.'), parseYaml);
		expect((await none(live('a.md'))).content).toBeUndefined();
	});
});
