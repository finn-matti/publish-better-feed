import type { App, TFile } from 'obsidian';
import type { PublishFile } from './publish';

export interface NoteMeta {
	title: string;
	summary: string;
}

export type MetaResolver = (file: PublishFile) => Promise<NoteMeta>;

/** Does the local file equal what is live? Local text must never reach the feed otherwise. */
export type IsLive = (file: TFile, liveHash: string) => Promise<boolean>;

const SUMMARY_MAX = 300;

/** First non-heading paragraph of a note body, with light markup removed. */
export function firstParagraph(markdown: string): string {
	const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	for (const block of body.split(/\r?\n\s*\r?\n/)) {
		const text = block.trim();
		if (!text || /^(#|>|```|~~~|---|\*\*\*|!\[\[|\|)/.test(text)) continue;
		const plain = text
			.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
			.replace(/\[\[([^\]]*)\]\]/g, '$1')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/[*_`~]/g, '')
			.replace(/\s+/g, ' ');
		return plain.length > SUMMARY_MAX
			? plain.slice(0, SUMMARY_MAX - 1).trimEnd() + '…'
			: plain;
	}
	return '';
}

const str = (v: unknown): string | undefined =>
	typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function vaultMetaResolver(app: App, isLive: IsLive): MetaResolver {
	return async (live) => {
		const basename = live.path.replace(/^.*\//, '').replace(/\.md$/i, '');
		const file = app.vault.getFileByPath(live.path);
		if (!file || !(await isLive(file, live.hash))) {
			return { title: basename, summary: '' };
		}
		const fm = (app.metadataCache.getFileCache(file)?.frontmatter ??
			{}) as Record<string, unknown>;
		const summary =
			str(fm.description) ?? firstParagraph(await readNote(app, file));
		return { title: str(fm.title) ?? basename, summary };
	};
}

async function readNote(app: App, file: TFile): Promise<string> {
	try {
		return await app.vault.cachedRead(file);
	} catch {
		return '';
	}
}
