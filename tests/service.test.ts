import { describe, expect, it, vi } from 'vitest';
import type { FeedFile, GithubTarget, PushResult } from '../src/github';
import { FeedService, type FeedDeps } from '../src/service';
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
	const notify = vi.fn();
	const logError = vi.fn();
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
		readFeed,
		push,
		notify,
		logError,
		...overrides,
	};
	return { service: new FeedService(deps), push, readFeed, notify, logError };
}

describe('FeedService.rebuild', () => {
	it('builds the feed, pushes it and reports a manual run', async () => {
		const { service, push, notify } = setup();
		await service.rebuild(true);
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
		expect(notify).toHaveBeenCalledWith('Publish feed: updated (2 entries)');
	});

	it('stays quiet on a successful automatic run', async () => {
		const { service, push, notify } = setup();
		await service.rebuild(false);
		expect(push).toHaveBeenCalledTimes(1);
		expect(notify).not.toHaveBeenCalled();
	});

	it('uses the author setting, falling back to the feed title', async () => {
		const { service, push } = setup();
		await service.rebuild(false);
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
		await custom.service.rebuild(false);
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
	])('reports a failure when %s', async (_name, override, text) => {
		const { service, push, notify, logError } = setup(override);
		await service.rebuild(false);
		expect(push).not.toHaveBeenCalled();
		expect(logError).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining(text));
	});

	it('reports a failed push and recovers on the next run', async () => {
		const { service, push, notify } = setup();
		push.mockRejectedValueOnce(new Error('boom'));
		await service.rebuild(false);
		expect(notify).toHaveBeenCalledWith('Publish feed failed: boom');
		await service.rebuild(true);
		expect(notify).toHaveBeenLastCalledWith('Publish feed: updated (2 entries)');
	});

	it('does not push an empty feed automatically, but does when run manually', async () => {
		const { service, push, notify } = setup({}, []);
		await service.rebuild(false);
		expect(push).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
		await service.rebuild(true);
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('runs one at a time and queues a single rerun', async () => {
		const { service, push } = setup();
		let release!: () => void;
		push.mockImplementationOnce(
			() => new Promise<PushResult>((resolve) => (release = () => resolve('updated'))),
		);
		const first = service.rebuild(false);
		await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
		void service.rebuild(false);
		void service.rebuild(false);
		await Promise.resolve();
		expect(push).toHaveBeenCalledTimes(1);
		release();
		await first;
		await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2));
		await new Promise((r) => globalThis.setTimeout(r, 10));
		expect(push).toHaveBeenCalledTimes(2);
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
		await make('full').service.rebuild(false);
		await make('summary').service.rebuild(false);
		expect(seen).toEqual([true, false]);
	});

	it('hands the snapshot it read to the push', async () => {
		const snapshot = { sha: 'abc', text: null };
		const { service, push, readFeed } = setup();
		readFeed.mockResolvedValueOnce(snapshot);
		await service.rebuild(false);
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
			await s.service.rebuild(false);
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
});
