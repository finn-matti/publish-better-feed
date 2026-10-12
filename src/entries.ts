import type { PublishFile } from './publish';
import type { MetaResolver } from './notes';

export interface FeedEntry {
	id: string;
	title: string;
	url: string;
	published: Date;
	updated: Date;
	summary: string;
}

/** Publish timestamps are assumed to be epoch ms; tolerate seconds. */
const toDate = (ts: number): Date => new Date(ts < 1e11 ? ts * 1000 : ts);

/** Same page URL Publish builds: `+` for spaces, each segment URI-encoded. */
export function noteUrl(siteUrl: string, path: string): string {
	const slug = path
		.replace(/\.md$/i, '')
		.split('/')
		.map((seg) => encodeURIComponent(seg).replace(/%20/g, '+'))
		.join('/');
	return `${siteUrl.replace(/\/+$/, '')}/${slug}`;
}

/** One entry per published note; `updated` follows the live mtime. */
export async function buildEntries(
	files: PublishFile[],
	opts: { siteUrl: string; maxEntries: number; resolve: MetaResolver },
): Promise<FeedEntry[]> {
	const notes = files
		.filter((f) => /\.md$/i.test(f.path))
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, opts.maxEntries * 2);

	const entries: FeedEntry[] = [];
	for (const f of notes) {
		const meta = await opts.resolve(f);
		const url = noteUrl(opts.siteUrl, f.path);
		entries.push({
			id: url,
			title: meta.title,
			url,
			published: toDate(f.ctime || f.mtime),
			updated: toDate(f.mtime || f.ctime),
			summary: meta.summary || meta.title,
		});
		if (entries.length >= opts.maxEntries) break;
	}
	return entries;
}
