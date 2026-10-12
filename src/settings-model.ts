export interface FeedSettings {
	githubOwner: string;
	githubRepo: string;
	githubBranch: string;
	feedPath: string;
	/** Name of the secret in Obsidian's secret storage, not the token itself. */
	tokenSecretName: string;
	feedTitle: string;
	feedAuthor: string;
	contentMode: 'summary' | 'full';
	maxEntries: number;
	autoPush: boolean;
	debounceSeconds: number;
}

export const DEFAULT_SETTINGS: FeedSettings = {
	githubOwner: '',
	githubRepo: '',
	githubBranch: 'main',
	feedPath: 'feed.atom',
	tokenSecretName: '',
	feedTitle: 'Recent changes',
	feedAuthor: '',
	contentMode: 'full',
	maxEntries: 50,
	autoPush: true,
	debounceSeconds: 10,
};

/** Public URL of the feed on GitHub Pages. */
export function feedUrl(s: FeedSettings): string {
	const root = s.githubRepo.toLowerCase() === `${s.githubOwner}.github.io`.toLowerCase();
	const base = `https://${s.githubOwner}.github.io${root ? '' : `/${s.githubRepo}`}`;
	return `${base}/${s.feedPath}`;
}
