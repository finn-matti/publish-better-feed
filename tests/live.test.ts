import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../src/hash';
import { liveText } from '../src/live';
import type { PublishInstance } from '../src/publish';
import { mockPublish } from './mock-publish';

const enc = (s: string) => new TextEncoder().encode(s).buffer;
const entry = async (text: string, path = 'a.md') => ({
	path,
	hash: await sha256Hex(enc(text)),
	ctime: 1,
	mtime: 1,
	size: 1,
});

/** A text becomes a buffer, an Error rejects, anything else is returned as is. */
const respond = (v: unknown) =>
	v instanceof Error ? Promise.reject(v) : Promise.resolve(typeof v === 'string' ? enc(v) : v);

function setup(opts: { local?: string | Error | null; download?: unknown } = {}) {
	const inst: PublishInstance = mockPublish();
	const download = vi.fn(() => respond(opts.download));
	inst.apiDownloadFile = download;
	const readLocal = vi.fn(() => respond(opts.local ?? null) as Promise<ArrayBuffer | null>);
	return { inst, download, readLocal };
}

describe('liveText', () => {
	it('uses the local file when it matches the live hash, without downloading', async () => {
		const { inst, download, readLocal } = setup({ local: 'published text' });
		const live = await entry('published text');
		expect(await liveText(inst, readLocal, live)).toBe('published text');
		expect(download).not.toHaveBeenCalled();
	});

	it('downloads the live copy when the local file differs', async () => {
		const { inst, download, readLocal } = setup({
			local: 'EMBARRASSING unpublished edit',
			download: 'published text',
		});
		const live = await entry('published text');
		expect(await liveText(inst, readLocal, live)).toBe('published text');
		expect(download).toHaveBeenCalledWith('a.md');
	});

	it('downloads when there is no local file or reading it fails', async () => {
		const live = await entry('published text');
		for (const local of [null, new Error('read')]) {
			const { inst, readLocal } = setup({ local, download: 'published text' });
			expect(await liveText(inst, readLocal, live)).toBe('published text');
		}
	});

	it('rejects a download that does not match the live hash, such as an error body', async () => {
		const { inst, readLocal } = setup({ local: 'other', download: 'Something broke!' });
		expect(await liveText(inst, readLocal, await entry('published text'))).toBeNull();
	});

	it.each([
		['the download fails', new Error('offline')],
		['the download is not a buffer', { byteLength: 3 }],
		['the download is empty', undefined],
	])('returns null when %s', async (_name, download) => {
		const { inst, readLocal } = setup({ download });
		expect(await liveText(inst, readLocal, await entry('published text'))).toBeNull();
	});

	it('returns null when Publish has no download method', async () => {
		const { inst, readLocal } = setup();
		inst.apiDownloadFile = undefined;
		expect(await liveText(inst, readLocal, await entry('published text'))).toBeNull();
	});

	it('returns null without a live hash to verify against', async () => {
		const { inst, readLocal } = setup({ local: 'x', download: 'x' });
		expect(await liveText(inst, readLocal, { ...(await entry('x')), hash: '' })).toBeNull();
	});
});
