import type { PublishFile } from './publish';
import type { MetaResolver } from './notes';
import { surfaceTime } from './state';
import { pageUrl } from './urls';

export interface FeedEntry {
	id: string;
	title: string;
	url: string;
	published: Date;
	updated: Date;
	summary: string;
	/** Full text as HTML, when enabled. */
	content?: string;
}

/** Publish timestamps are assumed to be epoch ms; tolerate seconds. */
const toDate = (ts: number): Date => new Date(ts < 1e11 ? ts * 1000 : ts);

/** Same page URL Publish builds: `+` for spaces, each segment URI-encoded. */

/**
 * One entry per published note. `updated` is when it last surfaced: the latest publish time,
 * unless it surfaced less than `cooldownMs` before (see `surfaceTime`). Newest first.
 */
export async function buildEntries(
	files: PublishFile[],
	opts: {
		siteUrl: string;
		maxEntries: number;
		resolve: MetaResolver;
		previous?: Map<string, Date>;
		/** Notes whose page lives at a permalink. The entry id stays path-based. */
		permalinks?: Map<string, string>;
		cooldownMs?: number;
	},
): Promise<FeedEntry[]> {
	const notes = files
		.filter((f) => /\.md$/i.test(f.path))
		.map((f) => {
			// The id never changes, so it ignores permalinks; only the link follows them.
			const id = pageUrl(opts.siteUrl, f.path);
			const url = pageUrl(opts.siteUrl, f.path, opts.permalinks?.get(f.path));
			const publishedAt = toDate(f.mtime || f.ctime);
			const updated = surfaceTime(publishedAt, opts.previous?.get(id), opts.cooldownMs ?? 0);
			return { f, id, url, updated, publishedAt };
		})
		.sort(
			(a, b) =>
				b.updated.getTime() - a.updated.getTime() ||
				b.publishedAt.getTime() - a.publishedAt.getTime() ||
				a.f.path.localeCompare(b.f.path),
		)
		.slice(0, opts.maxEntries);

	const entries: FeedEntry[] = [];
	for (const { f, id, url, updated } of notes) {
		const meta = await opts.resolve(f);
		entries.push({
			id,
			title: meta.title,
			url,
			published: toDate(f.ctime || f.mtime),
			updated,
			summary: meta.summary || meta.title,
			content: meta.content,
		});
	}
	return entries;
}
