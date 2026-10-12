import { requestUrl } from 'obsidian';
import { gitBlobSha, toBase64 } from './hash';

export interface GithubTarget {
	token: string;
	owner: string;
	repo: string;
	branch: string;
	path: string;
}

export type PushResult = 'created' | 'updated' | 'unchanged';

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
		url: `${api(t)}?ref=${encodeURIComponent(t.branch)}`,
		headers: headers(t),
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

/** Creates or updates one file. Skips the commit if the content is identical. */
export async function pushFile(
	t: GithubTarget,
	content: string,
	message: string,
): Promise<PushResult> {
	const bytes = new TextEncoder().encode(content);
	const localSha = await gitBlobSha(bytes);

	for (let attempt = 0; attempt < 2; attempt++) {
		const sha = await currentSha(t);
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
