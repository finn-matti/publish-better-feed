import { buildEntries } from './entries';
import { buildAtom } from './feed';
import type { FeedFile, GithubTarget, PushResult } from './github';
import type { MetaResolver } from './notes';
import {
	parsePublishList,
	resolveSiteUrl,
	type PublishFile,
	type PublishInstance,
} from './publish';
import { parseFeedState } from './state';
import { feedUrl, type FeedSettings } from './settings-model';

export interface FeedDeps {
	getSettings: () => FeedSettings;
	getInstance: () => PublishInstance | null;
	getToken: (secretName: string) => string | null;
	/** Published notes that have a permalink; empty if it can't be read. */
	fetchPermalinks: (inst: PublishInstance) => Promise<Map<string, string>>;
	createMetaResolver: (
		inst: PublishInstance,
		ctx: {
			siteUrl: string;
			files: PublishFile[];
			permalinks: Map<string, string>;
			full: boolean;
		},
	) => MetaResolver;
	readFeed: (target: GithubTarget) => Promise<FeedFile>;
	push: (
		target: GithubTarget,
		content: string,
		message: string,
		current: FeedFile,
	) => Promise<PushResult>;
	notify: (message: string) => void;
	logError: (error: unknown) => void;
}

/** Reads what is live on Publish, builds the feed and pushes it. One run at a time. */
export class FeedService {
	private running = false;
	private rerun = false;

	constructor(private deps: FeedDeps) {}

	/**
	 * Manual runs report their outcome. Automatic runs only report failures.
	 * A call during a run is queued and runs once more afterwards.
	 */
	async rebuild(manual: boolean): Promise<void> {
		if (this.running) {
			this.rerun = true;
			return;
		}
		this.running = true;
		try {
			const result = await this.buildAndPush(manual);
			if (manual) this.deps.notify(`Publish feed: ${result}`);
		} catch (e) {
			this.deps.logError(e);
			this.deps.notify(
				`Publish feed failed: ${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			this.running = false;
			if (this.rerun) {
				this.rerun = false;
				void this.rebuild(false);
			}
		}
	}

	private async buildAndPush(manual: boolean): Promise<string> {
		const s = this.deps.getSettings();
		const inst = this.deps.getInstance();
		if (!inst) throw new Error('Publish is not enabled or not configured');
		const token = s.tokenSecretName
			? this.deps.getToken(s.tokenSecretName)
			: null;
		if (!token) throw new Error('No GitHub token configured');
		if (!s.githubOwner || !s.githubRepo) {
			throw new Error('GitHub owner and repository are required');
		}

		const target: GithubTarget = {
			token,
			owner: s.githubOwner,
			repo: s.githubRepo,
			branch: s.githubBranch,
			path: s.feedPath,
		};
		// The previous feed tells us when each note last surfaced (see `surfaceTime`).
		const current = await this.deps.readFeed(target);

		const siteUrl = await resolveSiteUrl(inst);
		const files = parsePublishList(await inst.apiList());
		const permalinks = await this.deps.fetchPermalinks(inst);
		const entries = await buildEntries(files, {
			siteUrl,
			maxEntries: s.maxEntries,
			permalinks,
			previous: parseFeedState(current.text),
			cooldownMs: Math.max(0, s.cooldownHours) * 3_600_000,
			resolve: this.deps.createMetaResolver(inst, {
				siteUrl,
				files,
				permalinks,
				full: s.contentMode === 'full',
			}),
		});
		// An empty list may be a bad response; don't let an automatic run wipe a good feed.
		if (entries.length === 0 && !manual) {
			return 'skipped, no published notes (use Rebuild feed to push anyway)';
		}
		const xml = buildAtom(
			{
				title: s.feedTitle,
				siteUrl,
				feedUrl: feedUrl(s),
				author: s.feedAuthor || s.feedTitle,
			},
			entries,
		);
		const outcome = await this.deps.push(target, xml, 'Update feed', current);
		return `${outcome} (${entries.length} entries)`;
	}
}
