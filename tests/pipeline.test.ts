import { describe, expect, it, vi } from 'vitest';
import type { FeedFile, GithubTarget, PushResult } from '../src/github';
import { updateFeed, type FeedDeps } from '../src/pipeline';
import { DEFAULT_SETTINGS } from '../src/settings-model';
import { mockPublish } from './mock-publish';

const file = (path: string, mtime: number) => ({ path, hash: 'h', ctime: mtime, mtime, size: 1 });
const FILES = [file('a.md', 1_700_000_000_000), file('b.md', 1_700_000_100_000)];

function setup(overrides: Partial<FeedDeps> = {}, files = FILES) {
	const push = vi.fn<(t: GithubTarget, c: string, m: string, cur: FeedFile) => Promise<PushResult>>(
		() => Promise.resolve('updated'),
	);
	const readFeed = vi.fn<(t: GithubTarget) => Promise<FeedFile>>(() =>
		Promise.resolve({ sha: null, text: null }),
	);
	const deps: FeedDeps = {
		getSettings: () => ({
			...DEFAULT_SETTINGS,
			githubOwner: 'o',
			githubRepo: 'r',
			tokenSecretName: 'tok',
			feedTitle: 'My feed',
		}),
		getInstance: () => mockPublish(files),
		getToken: () => 'secret',
		createMetaResolver: () => (f) => Promise.resolve({ title: f.path, summary: '' }),
		fetchPermalinks: () => Promise.resolve(new Map()),
		readFeed,
		push,
		...overrides,
	};
	return { service: { update: (manual: boolean) => updateFeed(deps, manual) }, push, readFeed };
}

describe('updateFeed', () => {
	it('builds the feed, pushes it and says what happened', async () => {
		const { service, push } = setup();
		expect(await service.update(true)).toBe('updated (2 entries)');
		const [target, xml, message] = push.mock.calls[0]!;
		expect(target).toEqual({
			token: 'secret',
			owner: 'o',
			repo: 'r',
			branch: 'main',
			path: 'feed.atom',
		});
		expect(message).toBe('Update feed');
		expect(xml).toContain('<title>b.md</title>');
		expect(xml).toContain('https://publish.obsidian.md/my-slug/a');
	});

	it('uses the author setting, falling back to the feed title', async () => {
		const { service, push } = setup();
		await service.update(false);
		expect(push.mock.calls[0]![1]).toContain('<author><name>My feed</name></author>');
		const custom = setup({
			getSettings: () => ({
				...DEFAULT_SETTINGS,
				githubOwner: 'o',
				githubRepo: 'r',
				tokenSecretName: 'tok',
				feedAuthor: 'Me',
			}),
		});
		await custom.service.update(false);
		expect(custom.push.mock.calls[0]![1]).toContain('<author><name>Me</name></author>');
	});

	it.each([
		['Publish is unavailable', { getInstance: () => null }, 'Publish is not enabled'],
		['no token is set', { getToken: () => null }, 'No GitHub token'],
		[
			'owner and repo are missing',
			{ getSettings: () => ({ ...DEFAULT_SETTINGS, tokenSecretName: 'tok' }) },
			'owner and repository',
		],
	])('throws a readable error when %s, before touching GitHub', async (_name, override, text) => {
		const { service, push, readFeed } = setup(override);
		await expect(service.update(false)).rejects.toThrow(text);
		expect(readFeed).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it('lets a failed push through, and the next update works', async () => {
		const { service, push } = setup();
		push.mockRejectedValueOnce(new Error('boom'));
		await expect(service.update(false)).rejects.toThrow('boom');
		expect(await service.update(true)).toBe('updated (2 entries)');
	});

	it('does not push an empty feed automatically, but does when run manually', async () => {
		const { service, push } = setup({}, []);
		expect(await service.update(false)).toMatch(/^skipped/);
		expect(push).not.toHaveBeenCalled();
		expect(await service.update(true)).toBe('updated (0 entries)');
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('asks for full text unless the content mode is summary', async () => {
		const seen: boolean[] = [];
		const make = (contentMode: 'full' | 'summary') =>
			setup({
				getSettings: () => ({
					...DEFAULT_SETTINGS,
					githubOwner: 'o',
					githubRepo: 'r',
					tokenSecretName: 'tok',
					contentMode,
				}),
				createMetaResolver: (_inst, ctx) => {
					seen.push(ctx.full);
					expect(ctx.files.map((f) => f.path)).toEqual(['a.md', 'b.md']);
					expect(ctx.siteUrl).toBe('https://publish.obsidian.md/my-slug');
					return (f) => Promise.resolve({ title: f.path, summary: '' });
				},
			});
		await make('full').service.update(false);
		await make('summary').service.update(false);
		expect(seen).toEqual([true, false]);
	});

	it('hands the snapshot it read to the push', async () => {
		const snapshot = { sha: 'abc', text: null };
		const { service, push, readFeed } = setup();
		readFeed.mockResolvedValueOnce(snapshot);
		await service.update(false);
		expect(push.mock.calls[0]![3]).toBe(snapshot);
	});

	describe('cooldown', () => {
		const iso = (ms: number) => new Date(ms).toISOString();
		// b.md was last published an hour after a.md. Its previous feed entry surfaced 30 min earlier.
		const previous = (id: string, ms: number) =>
			`<feed><entry><id>${id}</id><updated>${iso(ms)}</updated></entry></feed>`;
		const B = 1_700_000_100_000;
		const B_ID = 'https://publish.obsidian.md/my-slug/b';
		const updatedOf = (xml: string, id: string) =>
			new RegExp(`<id>${id}</id>[\\s\\S]*?<updated>([^<]*)</updated>`).exec(xml)?.[1];
		const run = async (cooldownHours: number, prevMs: number) => {
			const s = setup({
				getSettings: () => ({
					...DEFAULT_SETTINGS,
					githubOwner: 'o',
					githubRepo: 'r',
					tokenSecretName: 'tok',
					cooldownHours,
				}),
			});
			s.readFeed.mockResolvedValueOnce({ sha: 's', text: previous(B_ID, prevMs) });
			await s.service.update(false);
			return s.push.mock.calls[0]![1];
		};

		it('keeps an entry in place when it was published again within the cooldown', async () => {
			const xml = await run(24, B - 30 * 60_000);
			expect(updatedOf(xml, B_ID)).toBe(iso(B - 30 * 60_000));
			expect(xml.indexOf('<title>a.md</title>')).toBeLessThan(xml.indexOf('<title>b.md</title>'));
		});

		it('moves it to the top once the cooldown has passed', async () => {
			const xml = await run(24, B - 25 * 3_600_000);
			expect(updatedOf(xml, B_ID)).toBe(iso(B));
			expect(xml.indexOf('<title>b.md</title>')).toBeLessThan(xml.indexOf('<title>a.md</title>'));
		});

		it('shows every publish when the cooldown is 0', async () => {
			expect(updatedOf(await run(0, B - 30 * 60_000), B_ID)).toBe(iso(B));
		});
	});

	it('uses permalinks for links and keeps entry ids path-based', async () => {
		let seen: Map<string, string> | undefined;
		const { service, push } = setup({
			fetchPermalinks: () => Promise.resolve(new Map([['a.md', 'custom/a']])),
			createMetaResolver: (_inst, ctx) => {
				seen = ctx.permalinks;
				return (f) => Promise.resolve({ title: f.path, summary: '' });
			},
		});
		await service.update(false);
		const xml = push.mock.calls[0]![1];
		expect(seen?.get('a.md')).toBe('custom/a');
		expect(xml).toContain('<id>https://publish.obsidian.md/my-slug/a</id>');
		expect(xml).toContain('<link rel="alternate" type="text/html" href="https://publish.obsidian.md/my-slug/custom/a"/>');
		expect(xml).toContain('<link rel="alternate" type="text/html" href="https://publish.obsidian.md/my-slug/b"/>');
	});
});
