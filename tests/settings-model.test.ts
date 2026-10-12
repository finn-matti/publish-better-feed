import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, feedUrl } from '../src/settings-model';

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
