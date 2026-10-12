import { requestUrl } from 'obsidian';
import type { PublishInstance } from './publish';

/** Path to permalink, for every published note whose frontmatter sets one. */
export function parsePermalinks(cache: unknown): Map<string, string> {
	const out = new Map<string, string>();
	if (typeof cache !== 'object' || cache === null) return out;
	for (const [path, meta] of Object.entries(cache)) {
		if (!/\.md$/i.test(path) || typeof meta !== 'object' || meta === null) continue;
		const fm = (meta as { frontmatter?: unknown }).frontmatter;
		const raw = typeof fm === 'object' && fm !== null ? (fm as { permalink?: unknown }).permalink : null;
		if (typeof raw !== 'string') continue;
		const permalink = raw.trim().replace(/^\/+/, '');
		const segments = permalink.split('/');
		if (!permalink || segments.some((s) => s === '.' || s === '..')) continue;
		out.set(path, permalink);
	}
	return out;
}

/**
 * Publish's own pages read permalinks from `cache/<uid>`, a public JSON of every published
 * file's metadata. Without it, links simply use paths.
 */
export async function fetchPermalinks(inst: PublishInstance): Promise<Map<string, string>> {
	try {
		const res = await requestUrl({
			url: `https://${inst.host}/cache/${encodeURIComponent(inst.siteId)}`,
			headers: { 'Cache-Control': 'no-cache' },
			throw: false,
		});
		return res.status === 200 ? parsePermalinks(res.json) : new Map();
	} catch {
		return new Map();
	}
}
