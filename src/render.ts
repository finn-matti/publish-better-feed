import {
	commentFromMarkdown,
	commentSyntax,
	highlightFromMarkdown,
	highlightSyntax,
	tagFromMarkdown,
	tagSyntax,
	wikilinkFromMarkdown,
	wikilinkSyntax,
} from '@quartz-community/remark-obsidian';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import { callout } from './callout';
import { toHtml } from './html';
import { collectDefinitions, key, plainText, text, type Def, type N } from './mdast';
import { buildIndex, IMAGE, NOTE } from './paths';
import { assetUrl, pageUrl } from './urls';

export interface RenderContext {
	/** Public base URL of the site, as in page URLs. */
	siteUrl: string;
	/** `https://<host>/access/<siteId>`: where Publish serves uploaded files. */
	assetBase: string;
	/** Paths of everything that is published. Only these can be linked or embedded. */
	files: string[];
	/** Published notes that have a `permalink`: their page URL is the permalink. */
	permalinks?: Map<string, string>;
}

/** `title` is the entry's title: a leading heading that repeats it is left out. */
export type Renderer = (markdown: string, notePath: string, title?: string) => string;

const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const SIZE = /^\d+(x\d+)?$/;

/** Published text becomes HTML. Links and embeds only ever point at published files. */
export function createRenderer(ctx: RenderContext): Renderer {
	const idx = buildIndex(ctx.files);
	const asset = (path: string) => assetUrl(ctx.assetBase, path);
	const page = (path: string) => pageUrl(ctx.siteUrl, path, ctx.permalinks?.get(path));

	return (markdown, notePath, title) => {
		const tree = fromMarkdown(markdown.replace(FRONTMATTER, ''), {
			extensions: [
				gfm(),
				wikilinkSyntax(),
				commentSyntax(),
				tagSyntax(),
				highlightSyntax(),
				math(),
			],
			mdastExtensions: [
				gfmFromMarkdown(),
				wikilinkFromMarkdown(),
				commentFromMarkdown(),
				tagFromMarkdown(),
				highlightFromMarkdown(),
				mathFromMarkdown(),
			],
		}) as unknown as N;
		const defs = new Map<string, Def>();
		collectDefinitions(tree, defs);
		walk(tree, notePath, defs);
		const first = tree.children?.[0];
		if (
			title &&
			first?.type === 'heading' &&
			first.depth === 1 &&
			plainText(first).trim().toLowerCase() === title.trim().toLowerCase()
		) {
			tree.children?.shift();
		}
		return toHtml(tree);
	};

	function walk(parent: N, notePath: string, defs: Map<string, Def>): void {
		const kids = parent.children;
		if (!kids) return;
		for (let i = 0; i < kids.length; ) {
			const node = kids[i] as N;
			if (node.type === 'blockquote') callout(node);
			const out = replace(node, notePath, defs);
			if (!out) {
				walk(node, notePath, defs);
				i++;
				continue;
			}
			kids.splice(i, 1, ...out.nodes);
			// Unwrapped children are revisited; nodes we just built are not.
			if (!out.revisit) i += out.nodes.length;
		}
	}

	/** undefined: keep the node. Otherwise the nodes that take its place. */
	function replace(
		node: N,
		notePath: string,
		defs: Map<string, Def>,
	): { nodes: N[]; revisit?: boolean } | undefined {
		switch (node.type) {
			case 'wikilink':
				return { nodes: wikilink(node, notePath) };
			case 'tag':
				return { nodes: [text(`#${node.value ?? ''}`)] };
			case 'comment':
				return { nodes: [] };
			case 'image':
				return { nodes: image(node.url, node.alt, node.title, notePath) };
			case 'link':
				return link(node.url ?? '', node.title, node.children ?? [], notePath);
			case 'linkReference': {
				const def = defs.get(key(node.identifier));
				return def
					? link(def.url, def.title, node.children ?? [], notePath)
					: { nodes: node.children ?? [], revisit: true };
			}
			case 'imageReference': {
				const def = defs.get(key(node.identifier));
				return { nodes: def ? image(def.url, node.alt, def.title, notePath) : [] };
			}
			default:
				return undefined;
		}
	}

	function image(
		url: string | undefined,
		alt: string | null | undefined,
		title: string | null | undefined,
		notePath: string,
	): N[] {
		const resolved = resolveUrl(url ?? '', notePath, true);
		return resolved ? [{ type: 'image', url: resolved, alt: alt ?? '', title }] : [];
	}

	function link(
		url: string,
		title: string | null | undefined,
		children: N[],
		notePath: string,
	): { nodes: N[]; revisit?: boolean } {
		const resolved = resolveUrl(url, notePath, false);
		return resolved
			? { nodes: [{ type: 'link', url: resolved, title, children }] }
			: { nodes: children, revisit: true };
	}

	function wikilink(n: N, notePath: string): N[] {
		const path = n.path ?? '';
		const heading = n.heading ?? '';
		const alias = n.alias ?? '';
		const target = path ? idx.resolve(path, notePath) : notePath;
		const fragment = heading ? `#${encodeURI(heading)}` : '';
		if (n.embedded) {
			if (!target) return [];
			const parts = alias.split('|');
			const size = SIZE.test(parts[parts.length - 1] ?? '') ? parts.pop() : undefined;
			const alt = parts.join('|') || path;
			if (IMAGE.test(target)) {
				const [w, h] = (size ?? '').split('x');
				const props: Record<string, string> = {};
				if (w) props.width = w;
				if (h) props.height = h;
				return [{ type: 'image', url: asset(target), alt, data: { hProperties: props } }];
			}
			const url = NOTE.test(target) ? page(target) : asset(target);
			return [{ type: 'link', url, children: [text(alt)] }];
		}
		const label = alias || (path ? (heading ? `${path} > ${heading}` : path) : heading);
		if (!target) return [text(label)];
		const url = NOTE.test(target) ? page(target) + fragment : asset(target);
		return [{ type: 'link', url, children: [text(label)] }];
	}

	/** http(s) and mailto pass through; relative paths must be published; anything else is dropped. */
	function resolveUrl(raw: string, notePath: string, isImage: boolean): string | null {
		const url = raw.trim();
		if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
		if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
		const [pathPart = '', frag] = url.split('#') as [string, string?];
		const hash = frag ? `#${frag}` : '';
		if (!pathPart) return isImage ? null : page(notePath) + hash;
		let decoded = pathPart;
		try {
			decoded = decodeURIComponent(pathPart);
		} catch {
			// keep it as written
		}
		const target = idx.exact(decoded, notePath);
		if (!target) return null;
		if (NOTE.test(target)) return isImage ? null : page(target) + hash;
		return asset(target);
	}
}
