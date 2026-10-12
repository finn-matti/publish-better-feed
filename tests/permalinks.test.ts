import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrl = vi.fn<(p: unknown) => Promise<unknown>>();
vi.mock('obsidian', () => ({ requestUrl: (p: unknown) => requestUrl(p) }));

import { fetchPermalinks, parsePermalinks } from '../src/permalinks';
import { mockPublish } from './mock-publish';

beforeEach(() => requestUrl.mockReset());

describe('parsePermalinks', () => {
	it('collects string permalinks of notes and strips leading slashes', () => {
		const m = parsePermalinks({
			'a.md': { frontmatter: { permalink: '/custom/a' } },
			'Sub/b.md': { frontmatter: { permalink: ' b-link ' } },
			'c.md': { frontmatter: { description: 'no permalink' } },
			'd.md': {},
			'e.md': { frontmatter: { permalink: 42 } },
			'img.png': { frontmatter: { permalink: 'ignored' } },
		});
		expect([...m]).toEqual([
			['a.md', 'custom/a'],
			['Sub/b.md', 'b-link'],
		]);
	});

	it('skips empty or path-traversing permalinks', () => {
		const m = parsePermalinks({
			'a.md': { frontmatter: { permalink: '  ' } },
			'b.md': { frontmatter: { permalink: '/' } },
			'c.md': { frontmatter: { permalink: '../x' } },
			'd.md': { frontmatter: { permalink: 'ok/./x' } },
		});
		expect(m.size).toBe(0);
	});

	it('returns nothing for unexpected input', () => {
		for (const bad of [null, undefined, 'x', 5, [], { 'a.md': null }]) {
			expect(parsePermalinks(bad).size).toBe(0);
		}
	});
});

describe('fetchPermalinks', () => {
	it('reads the public cache of the site', async () => {
		requestUrl.mockResolvedValueOnce({ status: 200, json: { 'a.md': { frontmatter: { permalink: 'x' } } } });
		const m = await fetchPermalinks(mockPublish());
		expect(m.get('a.md')).toBe('x');
		const req = requestUrl.mock.calls[0]![0] as { url: string; headers: Record<string, string> };
		expect(req.url).toBe('https://publish.obsidian.md/cache/abc123');
		expect(req.headers['Cache-Control']).toBe('no-cache');
	});

	it('is empty when the cache is unavailable or the request fails', async () => {
		requestUrl.mockResolvedValueOnce({ status: 404, json: {} });
		expect((await fetchPermalinks(mockPublish())).size).toBe(0);
		requestUrl.mockRejectedValueOnce(new Error('offline'));
		expect((await fetchPermalinks(mockPublish())).size).toBe(0);
	});
});
