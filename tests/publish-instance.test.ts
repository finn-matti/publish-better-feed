import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { getPublishInstance, matchesLive } from '../src/publish';
import { mockPublish } from './mock-publish';

const appWith = (internalPlugins: unknown) => ({ internalPlugins }) as unknown as App;
const withInstance = (inst: unknown) =>
	appWith({ getEnabledPluginById: (id: string) => (id === 'publish' ? inst : null) });

describe('getPublishInstance', () => {
	it('returns the instance when it has the expected shape', () => {
		const inst = mockPublish();
		expect(getPublishInstance(withInstance(inst))).toBe(inst);
	});

	it.each([
		['internalPlugins is missing', appWith(undefined)],
		['getEnabledPluginById is missing', appWith({})],
		['Publish is disabled', withInstance(null)],
		['no site is configured', withInstance({ ...mockPublish(), siteId: null })],
		['the host is missing', withInstance({ ...mockPublish(), host: undefined })],
		['apiList is missing', withInstance({ ...mockPublish(), apiList: undefined })],
		['apiUploadFile is not a function', withInstance({ ...mockPublish(), apiUploadFile: 1 })],
		['apiRemoveFile is missing', withInstance({ ...mockPublish(), apiRemoveFile: undefined })],
		[
			'looking it up throws',
			appWith({
				getEnabledPluginById: () => {
					throw new Error('boom');
				},
			}),
		],
	])('returns null when %s', (_name, app) => {
		expect(getPublishInstance(app)).toBeNull();
	});
});

describe('matchesLive', () => {
	const file = { path: 'a.md' };
	it('is true only when Publish\'s hash of the local file equals the live hash', async () => {
		const inst = mockPublish();
		expect(await matchesLive(inst, file, 'hash-of-a.md')).toBe(true);
		expect(await matchesLive(inst, file, 'other')).toBe(false);
	});
	it('is false when the live hash is empty, getHash is missing or it throws', async () => {
		const inst = mockPublish();
		expect(await matchesLive(inst, file, '')).toBe(false);
		expect(await matchesLive({ ...inst, getHash: undefined }, file, 'x')).toBe(false);
		const failing = { ...inst, getHash: () => Promise.reject(new Error('nope')) };
		expect(await matchesLive(failing, file, 'x')).toBe(false);
	});
});
