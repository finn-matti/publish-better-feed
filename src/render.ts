import remarkObsidian from '@quartz-community/remark-obsidian';
import type { Element, ElementContent } from 'hast';
import type { Blockquote, Paragraph, PhrasingContent, Root, Text } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { noteUrl } from './entries';

export interface RenderContext {
	/** Public base URL of the site, as in page URLs. */
	siteUrl: string;
	/** `https://<host>/access/<siteId>`: where Publish serves uploaded files. */
	assetBase: string;
	/** Paths of everything that is published. Only these can be linked or embedded. */
	files: string[];
}

export type Renderer = (markdown: string, notePath: string) => string;

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const NOTE = /\.md$/i;
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const SIZE = /^\d+(x\d+)?$/;

/** Published text becomes HTML. Links and embeds only ever point at published files. */
export function createRenderer(ctx: RenderContext): Renderer {
	const idx = buildIndex(ctx.files);
	const asset = (path: string) =>
		`${ctx.assetBase}/${path.split('/').map(encodeURIComponent).join('/')}`;

	return (markdown, notePath) => {
		const body = markdown.replace(FRONTMATTER, '');
		const processor = unified()
			.use(remarkParse)
			.use(remarkGfm)
			.use(remarkObsidian)
			.use(() => (tree: Root) => transform(tree, notePath))
			.use(remarkRehype, { handlers: { highlight: markHandler } })
			.use(rehypeStringify);
		return String(processor.processSync(body));
	};

	function transform(tree: Root, notePath: string): void {
		visit(tree, (node, index, parent) => {
			if (node.type === 'blockquote') {
				callout(node);
				return;
			}
			if (!parent || index === undefined) return;
			const out = replace(node as PhrasingContent, notePath);
			if (!out) return;
			parent.children.splice(index, 1, ...(out.nodes as never[]));
			// Revisit unwrapped children (they may hold images); skip nodes we just built.
			return [SKIP, out.revisit ? index : index + out.nodes.length];
		});
	}

	/** undefined: keep the node. Otherwise the nodes that take its place. */
	function replace(
		node: PhrasingContent,
		notePath: string,
	): { nodes: PhrasingContent[]; revisit?: boolean } | undefined {
		switch (node.type) {
			case 'wikilink':
				return { nodes: wikilink(node, notePath) };
			case 'tag':
				return { nodes: [text(`#${node.value}`)] };
			case 'image': {
				const url = resolveUrl(node.url, notePath, true);
				return { nodes: url ? [{ ...node, url }] : [] };
			}
			case 'link': {
				const url = resolveUrl(node.url, notePath, false);
				return url ? { nodes: [{ ...node, url }] } : { nodes: node.children, revisit: true };
			}
			default:
				return undefined;
		}
	}

	function wikilink(
		n: { path: string; heading: string; alias: string; embedded: boolean },
		notePath: string,
	): PhrasingContent[] {
		const target = n.path ? idx.resolve(n.path, notePath) : notePath;
		const fragment = n.heading ? `#${encodeURI(n.heading)}` : '';
		if (n.embedded) {
			if (!target) return [];
			const parts = n.alias.split('|');
			const last = parts[parts.length - 1] ?? '';
			const size = SIZE.test(last) ? parts.pop() : undefined;
			const alt = parts.join('|') || n.path;
			if (IMAGE.test(target)) {
				const [w, h] = (size ?? '').split('x');
				const props: Record<string, string> = {};
				if (w) props.width = w;
				if (h) props.height = h;
				return [{ type: 'image', url: asset(target), alt, data: { hProperties: props } }];
			}
			const url = NOTE.test(target) ? noteUrl(ctx.siteUrl, target) : asset(target);
			return [{ type: 'link', url, children: [text(alt)] }];
		}
		const label =
			n.alias || (n.path ? (n.heading ? `${n.path} > ${n.heading}` : n.path) : n.heading);
		if (!target) return [text(label)];
		const url = NOTE.test(target) ? noteUrl(ctx.siteUrl, target) + fragment : asset(target);
		return [{ type: 'link', url, children: [text(label)] }];
	}

	/** http(s) and mailto pass through; relative paths must be published; anything else is dropped. */
	function resolveUrl(raw: string, notePath: string, isImage: boolean): string | null {
		const url = raw.trim();
		if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
		if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
		const [pathPart = '', frag] = url.split('#') as [string, string?];
		if (!pathPart) return isImage ? null : noteUrl(ctx.siteUrl, notePath) + (frag ? `#${frag}` : '');
		let decoded = pathPart;
		try {
			decoded = decodeURIComponent(pathPart);
		} catch {
			// keep it as written
		}
		const target = idx.exact(decoded, notePath);
		if (!target) return null;
		if (NOTE.test(target)) return isImage ? null : noteUrl(ctx.siteUrl, target) + (frag ? `#${frag}` : '');
		return asset(target);
	}
}

const text = (value: string): Text => ({ type: 'text', value });

/** `> [!type]+ Title` becomes a blockquote with a bold title; the body is always shown. */
function callout(node: Blockquote): void {
	const first = node.children[0];
	if (first?.type !== 'paragraph') return;
	const head = first.children[0];
	const m = head?.type === 'text' ? /^\[!([\w-]+)\][+-]?[ \t]*/.exec(head.value) : null;
	if (!m || head?.type !== 'text') return;

	const rest: PhrasingContent[] = [{ ...head, value: head.value.slice(m[0].length) }, ...first.children.slice(1)];
	const title: PhrasingContent[] = [];
	const body: PhrasingContent[] = [];
	let inBody = false;
	for (const child of rest) {
		if (inBody) {
			body.push(child);
		} else if (child.type === 'text' && child.value.includes('\n')) {
			const at = child.value.indexOf('\n');
			title.push(text(child.value.slice(0, at)));
			body.push(text(child.value.slice(at + 1)));
			inBody = true;
		} else {
			title.push(child);
		}
	}
	const name = (m[1] ?? 'note').replace(/^./, (c) => c.toUpperCase());
	const heading: Paragraph = {
		type: 'paragraph',
		children: [
			{
				type: 'strong',
				children: title.some((t) => t.type !== 'text' || t.value.trim()) ? title : [text(name)],
			},
		],
	};
	const children: Blockquote['children'] = [heading];
	if (body.some((b) => b.type !== 'text' || b.value.trim())) {
		children.push({ type: 'paragraph', children: body });
	}
	node.children = [...children, ...node.children.slice(1)];
}

/** `==text==` is rendered as `<mark>`. */
function markHandler(state: { all: (n: never) => ElementContent[] }, node: unknown): Element {
	return { type: 'element', tagName: 'mark', properties: {}, children: state.all(node as never) };
}

interface PathIndex {
	/** Resolves a wikilink target: by path or by name, as Obsidian does. */
	resolve: (target: string, fromPath: string) => string | null;
	/** Resolves a Markdown link target by path relative to the note or the vault root. */
	exact: (target: string, fromPath: string) => string | null;
}

function buildIndex(files: string[]): PathIndex {
	const key = (p: string) => p.replace(NOTE, '').toLowerCase();
	const byPath = new Map<string, string>();
	const byName = new Map<string, string[]>();
	for (const f of files) {
		byPath.set(key(f), f);
		const name = key(f.replace(/^.*\//, ''));
		byName.set(name, [...(byName.get(name) ?? []), f]);
	}
	const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
	const normalize = (p: string) => {
		const out: string[] = [];
		for (const seg of p.split('/')) {
			if (seg === '..') out.pop();
			else if (seg && seg !== '.') out.push(seg);
		}
		return out.join('/');
	};
	const exact = (target: string, fromPath: string) => {
		const t = target.replace(/^\//, '');
		const dir = dirOf(fromPath);
		return (
			byPath.get(key(normalize(dir ? `${dir}/${t}` : t))) ?? byPath.get(key(normalize(t))) ?? null
		);
	};
	return {
		exact,
		resolve(target, fromPath) {
			const t = target.trim().replace(/^\//, '');
			if (t.includes('/')) return exact(t, fromPath);
			const candidates = byName.get(key(t));
			if (!candidates?.length) return null;
			const dir = dirOf(fromPath);
			return (
				[...candidates].sort(
					(a, b) =>
						Number(dirOf(b) === dir) - Number(dirOf(a) === dir) ||
						a.length - b.length ||
						a.localeCompare(b),
				)[0] ?? null
			);
		},
	};
}
