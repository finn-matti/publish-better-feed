import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrl = vi.fn<(p: unknown) => Promise<unknown>>();
vi.mock('obsidian', () => ({ requestUrl: (p: unknown) => requestUrl(p) }));

import { pushFile, readFeed } from '../src/github';
import { gitBlobSha } from '../src/hash';

const target = { token: 't', owner: 'o', repo: 'r', branch: 'main', path: 'feed.atom' };
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

describe('readFeed', () => {
	const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

	it('returns the sha and decoded text, including non-ASCII', async () => {
		requestUrl.mockResolvedValueOnce(
			res(200, { sha: 's1', encoding: 'base64', content: b64('Ünï & more\n') }),
		);
		expect(await readFeed(target)).toEqual({ sha: 's1', text: 'Ünï & more\n' });
	});

	it('reports a missing file as null', async () => {
		requestUrl.mockResolvedValueOnce(res(404));
		expect(await readFeed(target)).toEqual({ sha: null, text: null });
	});

	it('fetches the raw text when the file is too large for the JSON response', async () => {
		requestUrl
			.mockResolvedValueOnce(res(200, { sha: 's2', encoding: 'none', content: '' }))
			.mockResolvedValueOnce({ status: 200, json: null, text: 'big file text' });
		expect(await readFeed(target)).toEqual({ sha: 's2', text: 'big file text' });
		expect(req(1).headers.Accept).toBe('application/vnd.github.raw+json');
	});

	it('throws on a failed GET and bypasses the cache', async () => {
		requestUrl.mockResolvedValueOnce(res(500));
		await expect(readFeed(target)).rejects.toThrow('500');
		expect(req(0).headers['Cache-Control']).toBe('no-cache');
	});
});

describe('pushFile with a snapshot', () => {
	it('does not read the file again', async () => {
		requestUrl.mockResolvedValueOnce(res(200));
		expect(await pushFile(target, 'x', 'msg', { sha: 'old', text: 'o' })).toBe('updated');
		expect(requestUrl).toHaveBeenCalledTimes(1);
		expect(putBody(0).sha).toBe('old');
	});

	it('creates the file when the snapshot says it does not exist', async () => {
		requestUrl.mockResolvedValueOnce(res(201));
		expect(await pushFile(target, 'x', 'msg', { sha: null, text: null })).toBe('created');
		expect(putBody(0).sha).toBeUndefined();
	});

	it('skips the commit when the snapshot already has this content', async () => {
		const sha = await gitBlobSha(new TextEncoder().encode('same'));
		expect(await pushFile(target, 'same', 'msg', { sha, text: 'same' })).toBe('unchanged');
		expect(requestUrl).not.toHaveBeenCalled();
	});

	it('refetches the sha when the snapshot has gone stale', async () => {
		requestUrl
			.mockResolvedValueOnce(res(409))
			.mockResolvedValueOnce(res(200, { sha: 'fresh' }))
			.mockResolvedValueOnce(res(200));
		expect(await pushFile(target, 'x', 'msg', { sha: 'stale', text: null })).toBe('updated');
		expect(putBody(2).sha).toBe('fresh');
	});
});
