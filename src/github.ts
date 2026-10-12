import { requestUrl } from 'obsidian';
import { fromBase64, gitBlobSha, toBase64 } from './hash';

export interface GithubTarget {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	path: string;
}

export type PushResult = 'created' | 'updated' | 'unchanged';

/** What is in the repository now: the blob sha to update, and the text (null if absent). */
export interface FeedFile {
	sha: string | null;
	text: string | null;
}

const api = (t: GithubTarget) =>
	`https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${t.path
		.split('/')
		.map(encodeURIComponent)
		.join('/')}`;

const headers = (t: GithubTarget) => ({
	Authorization: `Bearer ${t.token}`,
	Accept: 'application/vnd.github+json',
	'X-GitHub-Api-Version': '2022-11-28',
});

async function currentSha(t: GithubTarget): Promise<string | null> {
	const res = await requestUrl({
		// GitHub allows caching GETs for a minute; a stale sha makes the PUT fail with 409.
		url: `${api(t)}?ref=${encodeURIComponent(t.branch)}&_=${Date.now()}`,
		headers: { ...headers(t), 'Cache-Control': 'no-cache' },
		throw: false,
	});
	if (res.status === 404) return null;
	if (res.status !== 200) {
		throw new Error(`GitHub GET failed (${res.status}): ${res.text}`);
	}
	const sha = (res.json as { sha?: unknown }).sha;
	if (typeof sha !== 'string') throw new Error('GitHub GET: no sha in response');
	return sha;
}

const noCache = (t: GithubTarget, accept?: string) => ({
	...headers(t),
	...(accept ? { Accept: accept } : {}),
	'Cache-Control': 'no-cache',
});

/** The current file with its text. Over 1 MB the JSON has no content, so the raw text is fetched. */
export async function readFeed(t: GithubTarget): Promise<FeedFile> {
	const url = `${api(t)}?ref=${encodeURIComponent(t.branch)}&_=${Date.now()}`;
	const res = await requestUrl({ url, headers: noCache(t), throw: false });
	if (res.status === 404) return { sha: null, text: null };
	if (res.status !== 200) throw new Error(`GitHub GET failed (${res.status}): ${res.text}`);
	const json = res.json as { sha?: unknown; content?: unknown; encoding?: unknown };
	if (typeof json.sha !== 'string') throw new Error('GitHub GET: no sha in response');
	if (json.encoding === 'base64' && typeof json.content === 'string') {
		return { sha: json.sha, text: fromBase64(json.content) };
	}
	const raw = await requestUrl({
		url,
		headers: noCache(t, 'application/vnd.github.raw+json'),
		throw: false,
	});
	return { sha: json.sha, text: raw.status === 200 ? raw.text : null };
}

/**
 * Creates or updates one file. Skips the commit if the content is identical.
 * `current` is the caller's snapshot from `readFeed`; a retry always refetches the sha.
 */
export async function pushFile(
	t: GithubTarget,
	content: string,
	message: string,
	current?: FeedFile,
): Promise<PushResult> {
	const bytes = new TextEncoder().encode(content);
	const localSha = await gitBlobSha(bytes);
	let known = current;

	for (let attempt = 0; attempt < 2; attempt++) {
		const sha = known ? known.sha : await currentSha(t);
		known = undefined;
		if (sha === localSha) return 'unchanged';
		const res = await requestUrl({
			url: api(t),
			method: 'PUT',
			headers: { ...headers(t), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message,
				content: toBase64(bytes),
				branch: t.branch,
				...(sha ? { sha } : {}),
			}),
			throw: false,
		});
		if (res.status === 200 || res.status === 201) {
			return sha ? 'updated' : 'created';
		}
		// 409/422: our sha was stale; refetch and retry once.
		if (attempt === 0 && (res.status === 409 || res.status === 422)) continue;
		throw new Error(`GitHub PUT failed (${res.status}): ${res.text}`);
	}
	throw new Error('GitHub PUT failed after retry');
}
