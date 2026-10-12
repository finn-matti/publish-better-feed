import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrl = vi.fn<(p: unknown) => Promise<unknown>>();
vi.mock('obsidian', () => ({ requestUrl: (p: unknown) => requestUrl(p) }));

import { pushFile } from '../src/github';
import { gitBlobSha } from '../src/hash';

const target = { token: 't', owner: 'o', repo: 'r', branch: 'main', path: 'feed.xml' };
const res = (status: number, json: unknown = {}) => ({ status, json, text: JSON.stringify(json) });
interface Req { method?: string; url: string; headers: Record<string, string>; body?: string }
interface PutBody { sha?: string; branch: string; content: string }
const req = (i: number) => requestUrl.mock.calls[i]![0] as Req;
const putBody = (i: number) => JSON.parse(req(i).body!) as PutBody;

beforeEach(() => requestUrl.mockReset());

describe('pushFile', () => {
	it('creates the file when it does not exist', async () => {
		requestUrl.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(201));
		expect(await pushFile(target, 'x', 'msg')).toBe('created');
		const body = putBody(1);
		expect(body.sha).toBeUndefined();
		expect(body.branch).toBe('main');
		expect(atob(body.content)).toBe('x');
	});

	it('updates with the current sha', async () => {
		requestUrl.mockResolvedValueOnce(res(200, { sha: 'old' })).mockResolvedValueOnce(res(200));
		expect(await pushFile(target, 'x', 'msg')).toBe('updated');
		expect(putBody(1).sha).toBe('old');
	});

	it('skips the PUT when content is unchanged', async () => {
		const sha = await gitBlobSha(new TextEncoder().encode('same'));
		requestUrl.mockResolvedValueOnce(res(200, { sha }));
		expect(await pushFile(target, 'same', 'msg')).toBe('unchanged');
		expect(requestUrl).toHaveBeenCalledTimes(1);
	});

	it('refetches the sha and retries once on 409', async () => {
		requestUrl
			.mockResolvedValueOnce(res(200, { sha: 'stale' }))
			.mockResolvedValueOnce(res(409))
			.mockResolvedValueOnce(res(200, { sha: 'fresh' }))
			.mockResolvedValueOnce(res(200));
		expect(await pushFile(target, 'x', 'msg')).toBe('updated');
		expect(putBody(3).sha).toBe('fresh');
	});

	it('throws when the retry also conflicts', async () => {
		requestUrl
			.mockResolvedValueOnce(res(200, { sha: 'a' }))
			.mockResolvedValueOnce(res(409))
			.mockResolvedValueOnce(res(200, { sha: 'b' }))
			.mockResolvedValueOnce(res(409));
		await expect(pushFile(target, 'x', 'msg')).rejects.toThrow('PUT failed (409)');
		expect(requestUrl).toHaveBeenCalledTimes(4);
	});

	it('throws on a failed GET', async () => {
		requestUrl.mockResolvedValueOnce(res(401));
		await expect(pushFile(target, 'x', 'msg')).rejects.toThrow('401');
	});

	it('bypasses the HTTP cache when reading the sha', async () => {
		requestUrl.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(201));
		await pushFile(target, 'x', 'msg');
		const get = req(0);
		expect(get.headers['Cache-Control']).toBe('no-cache');
		expect(get.url).toMatch(/[?&]_=\d+/);
	});
});
