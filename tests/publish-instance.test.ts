import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { getPublishInstance } from '../src/publish';
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
