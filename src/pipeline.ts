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
import { feedUrl, type FeedSettings } from './settings-model';
import { parseFeedState } from './state';

/** Everything an update needs from outside, so it can be run with fakes. */
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
}

/**
 * One update, start to finish: read the old feed, ask Publish what is live, build the entries
 * and the XML, push it. Returns what happened; throws with a readable message if it can't.
 * `manual` runs push even an empty feed; automatic ones don't, in case Publish answered badly.
 */
export async function updateFeed(deps: FeedDeps, manual: boolean): Promise<string> {
	// 1. Is everything we need in place?
	const s = deps.getSettings();
	const inst = deps.getInstance();
	if (!inst) throw new Error('Publish is not enabled or not configured');
	const token = s.tokenSecretName ? deps.getToken(s.tokenSecretName) : null;
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

	// 2. The old feed: its entries tell us when each note last surfaced (see `surfaceTime`).
	const current = await deps.readFeed(target);

	// 3. Publish: what is live right now.
	const siteUrl = await resolveSiteUrl(inst);
	const files = parsePublishList(await inst.apiList());
	const permalinks = await deps.fetchPermalinks(inst);

	// 4. The entries: newest first, with the text of each published note.
	const entries = await buildEntries(files, {
		siteUrl,
		maxEntries: s.maxEntries,
		permalinks,
		previous: parseFeedState(current.text),
		cooldownMs: Math.max(0, s.cooldownHours) * 3_600_000,
		resolve: deps.createMetaResolver(inst, {
			siteUrl,
			files,
			permalinks,
			full: s.contentMode === 'full',
		}),
	});
	if (entries.length === 0 && !manual) {
		return 'skipped, no published notes (use Rebuild feed to push anyway)';
	}

	// 5. The Atom XML, 6. pushed to GitHub (unchanged content makes no commit).
	const xml = buildAtom(
		{
			title: s.feedTitle,
			siteUrl,
			feedUrl: feedUrl(s),
			author: s.feedAuthor || s.feedTitle,
		},
		entries,
	);
	const outcome = await deps.push(target, xml, 'Update feed', current);
	return `${outcome} (${entries.length} entries)`;
}
