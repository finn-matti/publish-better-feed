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
	cooldownHours: number;
	maxEntries: number;
	autoPush: boolean;
	/** Internal: a publish was seen and no update has succeeded since. */
	pendingUpdate: boolean;
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
	cooldownHours: 24,
	maxEntries: 50,
	autoPush: true,
	pendingUpdate: false,
};

/** Public URL of the feed on GitHub Pages. */
export function feedUrl(s: FeedSettings): string {
	const root = s.githubRepo.toLowerCase() === `${s.githubOwner}.github.io`.toLowerCase();
	const base = `https://${s.githubOwner}.github.io${root ? '' : `/${s.githubRepo}`}`;
	return `${base}/${s.feedPath}`;
}

/** Replaces out-of-range numbers (e.g. a hand-edited data.json) with defaults. */
export function normalizeSettings(s: Partial<FeedSettings>): Partial<FeedSettings> {
	const out = { ...s };
	if (out.cooldownHours !== undefined) {
		if (
			typeof out.cooldownHours !== 'number' ||
			out.cooldownHours < 0 ||
			!Number.isFinite(out.cooldownHours)
		) {
			out.cooldownHours = DEFAULT_SETTINGS.cooldownHours;
		}
	}
	if (out.maxEntries !== undefined) {
		if (
			typeof out.maxEntries !== 'number' ||
			out.maxEntries < 1 ||
			!Number.isInteger(out.maxEntries)
		) {
			out.maxEntries = DEFAULT_SETTINGS.maxEntries;
		}
	}
	return out;
}
