import { describe, expect, it } from 'vitest';
import { assetBase, assetUrl, pageUrl } from '../src/urls';

describe('pageUrl', () => {
	it('uses + for spaces, encodes the rest, keeps folders', () => {
		expect(pageUrl('https://x.test/s/', 'Sub dir/My Note.md')).toBe('https://x.test/s/Sub+dir/My+Note');
		expect(pageUrl('https://x.test', 'a+b&c.md')).toBe('https://x.test/a%2Bb%26c');
	});
});

describe('pageUrl with a permalink', () => {
	it('uses the permalink when it can be loaded directly, without a leading slash', () => {
		expect(pageUrl('https://x.test/s', 'Any/Path.md', '/custom-link/for-probe')).toBe(
			'https://x.test/s/custom-link/for-probe',
		);
		expect(pageUrl('https://x.test/s/', 'a.md', 'x_1.html')).toBe('https://x.test/s/x_1.html');
	});
	it('falls back to the path URL when the permalink would be percent-encoded', () => {
		for (const permalink of ['custom/for probe', 'über', 'a+b', 'q?x', 'a#b']) {
			expect(pageUrl('https://x.test', 'My Note.md', permalink)).toBe('https://x.test/My+Note');
		}
	});
	it('falls back to the path when the permalink is empty', () => {
		expect(pageUrl('https://x.test', 'My Note.md', '')).toBe('https://x.test/My+Note');
		expect(pageUrl('https://x.test', 'My Note.md', '/')).toBe('https://x.test/My+Note');
		expect(pageUrl('https://x.test', 'My Note.md', undefined)).toBe('https://x.test/My+Note');
	});
});

describe('assets', () => {
	it('builds the access URL from host and site id', () => {
		expect(assetBase('publish-01.obsidian.md', 'abc')).toBe('https://publish-01.obsidian.md/access/abc');
	});
	it('encodes each path segment, with %20 for spaces', () => {
		expect(assetUrl('https://h/access/id', 'Sub folder/a b+c.png')).toBe(
			'https://h/access/id/Sub%20folder/a%20b%2Bc.png',
		);
	});
});
