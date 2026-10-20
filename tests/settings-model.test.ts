import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, feedUrl, normalizeSettings } from '../src/settings-model';

const s = (githubOwner: string, githubRepo: string, feedPath = 'feed.atom') => ({
	...DEFAULT_SETTINGS,
	githubOwner,
	githubRepo,
	feedPath,
});

describe('feedUrl', () => {
	it('uses the repo as a path for project pages', () => {
		expect(feedUrl(s('me', 'site'))).toBe('https://me.github.io/site/feed.atom');
	});
	it('serves from the root for the user pages repo', () => {
		expect(feedUrl(s('me', 'me.github.io'))).toBe('https://me.github.io/feed.atom');
		expect(feedUrl(s('Me', 'me.GitHub.io'))).toBe('https://Me.github.io/feed.atom');
	});
	it('honors a custom feed path', () => {
		expect(feedUrl(s('me', 'site', 'feeds/changes.atom'))).toBe(
			'https://me.github.io/site/feeds/changes.atom',
		);
	});
});

describe('normalizeSettings', () => {
	it('returns empty object unchanged', () => {
		expect(normalizeSettings({})).toEqual({});
	});
	it('returns other keys unchanged', () => {
		expect(normalizeSettings({ githubOwner: 'me' })).toEqual({ githubOwner: 'me' });
	});
	it('repairs negative cooldownHours', () => {
		expect(normalizeSettings({ cooldownHours: -5 })).toEqual({
			cooldownHours: DEFAULT_SETTINGS.cooldownHours,
		});
	});
	it('repairs NaN cooldownHours', () => {
		expect(normalizeSettings({ cooldownHours: NaN })).toEqual({
			cooldownHours: DEFAULT_SETTINGS.cooldownHours,
		});
	});
	it('repairs string cooldownHours', () => {
		expect(
			normalizeSettings({ cooldownHours: '24' as unknown as number }),
		).toEqual({
			cooldownHours: DEFAULT_SETTINGS.cooldownHours,
		});
	});
	it('repairs zero maxEntries', () => {
		expect(normalizeSettings({ maxEntries: 0 })).toEqual({
			maxEntries: DEFAULT_SETTINGS.maxEntries,
		});
	});
	it('repairs negative maxEntries', () => {
		expect(normalizeSettings({ maxEntries: -1 })).toEqual({
			maxEntries: DEFAULT_SETTINGS.maxEntries,
		});
	});
	it('repairs NaN maxEntries', () => {
		expect(normalizeSettings({ maxEntries: NaN })).toEqual({
			maxEntries: DEFAULT_SETTINGS.maxEntries,
		});
	});
	it('repairs float maxEntries', () => {
		expect(normalizeSettings({ maxEntries: 10.5 })).toEqual({
			maxEntries: DEFAULT_SETTINGS.maxEntries,
		});
	});
	it('repairs string maxEntries', () => {
		expect(
			normalizeSettings({ maxEntries: '50' as unknown as number }),
		).toEqual({
			maxEntries: DEFAULT_SETTINGS.maxEntries,
		});
	});
	it('preserves valid cooldownHours', () => {
		expect(normalizeSettings({ cooldownHours: 24 })).toEqual({ cooldownHours: 24 });
	});
	it('preserves valid maxEntries', () => {
		expect(normalizeSettings({ maxEntries: 50 })).toEqual({ maxEntries: 50 });
	});
});
