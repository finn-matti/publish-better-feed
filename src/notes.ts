import type { PublishFile } from './publish';

export interface NoteMeta {
	title: string;
	summary: string;
	/** Full text as HTML; only set when a renderer is given. */
	content?: string;
}

export type MetaResolver = (file: PublishFile) => Promise<NoteMeta>;

/** Verified published text of a note, or null if unavailable. */
export type LiveText = (file: PublishFile) => Promise<string | null>;

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

function frontmatter(
	text: string,
	parseYaml: (yaml: string) => unknown,
): Record<string, unknown> {
	const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	if (!m) return {};
	try {
		const fm = parseYaml(m[1] ?? '');
		return typeof fm === 'object' && fm !== null ? (fm as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** Title and summary from published text; without text, the file name and no summary. */
export function metaResolver(
	getLiveText: LiveText,
	parseYaml: (yaml: string) => unknown,
	render?: (text: string, path: string, title: string) => string,
): MetaResolver {
	return async (live) => {
		const basename = live.path.replace(/^.*\//, '').replace(/\.md$/i, '');
		const text = await getLiveText(live);
		if (text === null) return { title: basename, summary: '' };
		const fm = frontmatter(text, parseYaml);
		const title = str(fm.title) ?? basename;
		return {
			title,
			summary: str(fm.description) ?? firstParagraph(text),
			content: render ? safeRender(render, text, live.path, title) : undefined,
		};
	};
}

/** A note that can't be rendered still gets its summary. */
function safeRender(
	render: (text: string, path: string, title: string) => string,
	text: string,
	path: string,
	title: string,
): string | undefined {
	try {
		return render(text, path, title);
	} catch {
		return undefined;
	}
}
