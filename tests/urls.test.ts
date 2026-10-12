import { describe, expect, it } from 'vitest';
import { assetBase, assetUrl, pageUrl } from '../src/urls';

describe('pageUrl', () => {
	it('uses + for spaces, encodes the rest, keeps folders', () => {
		expect(pageUrl('https://x.test/s/', 'Sub dir/My Note.md')).toBe('https://x.test/s/Sub+dir/My+Note');
		expect(pageUrl('https://x.test', 'a+b&c.md')).toBe('https://x.test/a%2Bb%26c');
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
