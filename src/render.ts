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
import { assetUrl, pageUrl } from './urls';

export interface RenderContext {
	/** Public base URL of the site, as in page URLs. */
	siteUrl: string;
	/** `https://<host>/access/<siteId>`: where Publish serves uploaded files. */
	assetBase: string;
	/** Paths of everything that is published. Only these can be linked or embedded. */
	files: string[];
}

/** `title` is the entry's title: a leading heading that repeats it is left out. */
export type Renderer = (markdown: string, notePath: string, title?: string) => string;

/** The few mdast fields we read. Anything else in a node is ignored. */
interface N {
	type: string;
	children?: N[];
	value?: string;
	url?: string;
	title?: string | null;
	alt?: string | null;
	depth?: number;
	ordered?: boolean | null;
	start?: number | null;
	spread?: boolean | null;
	checked?: boolean | null;
	lang?: string | null;
	align?: (string | null)[] | null;
	identifier?: string;
	path?: string;
	heading?: string;
	alias?: string;
	embedded?: boolean;
	data?: { hProperties?: Record<string, string> };
}

interface Def {
	url: string;
	title?: string | null;
}

const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const NOTE = /\.md$/i;
const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const SIZE = /^\d+(x\d+)?$/;

/** Published text becomes HTML. Links and embeds only ever point at published files. */
export function createRenderer(ctx: RenderContext): Renderer {
	const idx = buildIndex(ctx.files);
	const asset = (path: string) => assetUrl(ctx.assetBase, path);

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
			const url = NOTE.test(target) ? pageUrl(ctx.siteUrl, target) : asset(target);
			return [{ type: 'link', url, children: [text(alt)] }];
		}
		const label = alias || (path ? (heading ? `${path} > ${heading}` : path) : heading);
		if (!target) return [text(label)];
		const url = NOTE.test(target) ? pageUrl(ctx.siteUrl, target) + fragment : asset(target);
		return [{ type: 'link', url, children: [text(label)] }];
	}

	/** http(s) and mailto pass through; relative paths must be published; anything else is dropped. */
	function resolveUrl(raw: string, notePath: string, isImage: boolean): string | null {
		const url = raw.trim();
		if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
		if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
		const [pathPart = '', frag] = url.split('#') as [string, string?];
		const hash = frag ? `#${frag}` : '';
		if (!pathPart) return isImage ? null : pageUrl(ctx.siteUrl, notePath) + hash;
		let decoded = pathPart;
		try {
			decoded = decodeURIComponent(pathPart);
		} catch {
			// keep it as written
		}
		const target = idx.exact(decoded, notePath);
		if (!target) return null;
		if (NOTE.test(target)) return isImage ? null : pageUrl(ctx.siteUrl, target) + hash;
		return asset(target);
	}
}

const text = (value: string): N => ({ type: 'text', value });
const plainText = (n: N): string =>
	n.children ? n.children.map(plainText).join('') : (n.value ?? '');
const key = (id: string | undefined) => (id ?? '').toLowerCase();

function collectDefinitions(node: N, defs: Map<string, Def>): void {
	for (const child of node.children ?? []) {
		if (child.type === 'definition' && child.url !== undefined) {
			const k = key(child.identifier);
			if (!defs.has(k)) defs.set(k, { url: child.url, title: child.title });
		}
		collectDefinitions(child, defs);
	}
}

/** `> [!type]+ Title` becomes a blockquote with a bold title; the body is always shown. */
function callout(node: N): void {
	const first = node.children?.[0];
	if (first?.type !== 'paragraph' || !first.children) return;
	const head = first.children[0];
	const m = head?.type === 'text' ? /^\[!([\w-]+)\][+-]?[ \t]*/.exec(head.value ?? '') : null;
	if (!m || !head) return;

	const rest: N[] = [text((head.value ?? '').slice(m[0].length)), ...first.children.slice(1)];
	const title: N[] = [];
	const body: N[] = [];
	let inBody = false;
	for (const child of rest) {
		if (inBody) {
			body.push(child);
		} else if (child.type === 'text' && (child.value ?? '').includes('\n')) {
			const value = child.value ?? '';
			const at = value.indexOf('\n');
			title.push(text(value.slice(0, at)));
			body.push(text(value.slice(at + 1)));
			inBody = true;
		} else {
			title.push(child);
		}
	}
	const blank = (nodes: N[]) => nodes.every((n) => n.type === 'text' && !(n.value ?? '').trim());
	const name = (m[1] ?? 'note').replace(/^./, (c) => c.toUpperCase());
	const heading: N = {
		type: 'paragraph',
		children: [{ type: 'strong', children: blank(title) ? [text(name)] : title }],
	};
	const children: N[] = [heading];
	if (!blank(body)) children.push({ type: 'paragraph', children: body });
	node.children = [...children, ...(node.children ?? []).slice(1)];
}

// --- HTML ---------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const attr = (s: string) => esc(s).replace(/"/g, '&quot;');

/** Our own small serializer: the few node types we support, no raw HTML, every attribute escaped. */
function toHtml(root: N): string {
	const footnoteDefs = new Map<string, N>();
	const cited: string[] = [];
	const collect = (node: N) => {
		for (const c of node.children ?? []) {
			if (c.type === 'footnoteDefinition') footnoteDefs.set(key(c.identifier), c);
			else collect(c);
		}
	};
	collect(root);

	const inline = (nodes: N[] | undefined): string => (nodes ?? []).map(inlineNode).join('');

	function inlineNode(n: N): string {
		switch (n.type) {
			case 'text':
				return esc(n.value ?? '');
			case 'emphasis':
				return `<em>${inline(n.children)}</em>`;
			case 'strong':
				return `<strong>${inline(n.children)}</strong>`;
			case 'delete':
				return `<del>${inline(n.children)}</del>`;
			case 'highlight':
				return `<mark>${inline(n.children)}</mark>`;
			case 'inlineCode':
				return `<code>${esc(n.value ?? '')}</code>`;
			case 'inlineMath':
				return `<code class="language-math math-inline">${esc(n.value ?? '')}</code>`;
			case 'break':
				return '<br>';
			case 'link':
				return `<a href="${attr(n.url ?? '')}"${n.title ? ` title="${attr(n.title)}"` : ''}>${inline(n.children)}</a>`;
			case 'image': {
				const extra = Object.entries(n.data?.hProperties ?? {})
					.filter(([k]) => k === 'width' || k === 'height')
					.map(([k, v]) => ` ${k}="${attr(v)}"`)
					.join('');
				return `<img src="${attr(n.url ?? '')}" alt="${attr(n.alt ?? '')}"${n.title ? ` title="${attr(n.title)}"` : ''}${extra}>`;
			}
			case 'footnoteReference': {
				const id = key(n.identifier);
				if (!footnoteDefs.has(id)) return '';
				if (!cited.includes(id)) cited.push(id);
				return `<sup>${cited.indexOf(id) + 1}</sup>`;
			}
			default:
				// Raw HTML and anything unknown never become markup.
				return n.type === 'html' || n.type === 'definition'
					? ''
					: n.children
						? inline(n.children)
						: esc(n.value ?? '');
		}
	}

	const blocks = (nodes: N[] | undefined): string =>
		(nodes ?? [])
			.map(block)
			.filter((s) => s !== '')
			.join('\n');

	function block(n: N): string {
		switch (n.type) {
			case 'paragraph':
				return `<p>${inline(n.children)}</p>`;
			case 'heading': {
				const d = Math.min(Math.max(n.depth ?? 1, 1), 6);
				return `<h${d}>${inline(n.children)}</h${d}>`;
			}
			case 'blockquote':
				return `<blockquote>\n${blocks(n.children)}\n</blockquote>`;
			case 'thematicBreak':
				return '<hr>';
			case 'code': {
				const lang = n.lang && /^[\w+#.-]+$/.test(n.lang) ? ` class="language-${n.lang}"` : '';
				return `<pre><code${lang}>${esc(n.value ?? '')}\n</code></pre>`;
			}
			case 'math':
				return `<pre><code class="language-math math-display">${esc(n.value ?? '')}\n</code></pre>`;
			case 'list': {
				const tag = n.ordered ? 'ol' : 'ul';
				const start = n.ordered && n.start != null && n.start !== 1 ? ` start="${n.start}"` : '';
				const items = (n.children ?? []).map((item) => listItem(item, !!n.spread)).join('\n');
				return `<${tag}${start}>\n${items}\n</${tag}>`;
			}
			case 'table':
				return table(n);
			case 'footnoteDefinition':
			case 'definition':
			case 'html':
				return '';
			default:
				return n.children ? blocks(n.children) : inline([n]);
		}
	}

	function listItem(item: N, listSpread: boolean): string {
		const loose = listSpread || !!item.spread;
		const box =
			item.checked == null ? '' : `<input type="checkbox"${item.checked ? ' checked' : ''} disabled> `;
		const parts = (item.children ?? []).map((c) =>
			c.type === 'paragraph' && !loose ? inline(c.children) : block(c),
		);
		return `<li>${box}${parts.filter((p) => p !== '').join('\n')}${loose ? '\n' : ''}</li>`;
	}

	function table(n: N): string {
		const align = n.align ?? [];
		const rows = (n.children ?? []).map((row, r) => {
			const cells = (row.children ?? []).map((cell, c) => {
				const tag = r === 0 ? 'th' : 'td';
				const a = align[c];
				return `<${tag}${a ? ` align="${a}"` : ''}>${inline(cell.children)}</${tag}>`;
			});
			return `<tr>${cells.join('')}</tr>`;
		});
		const head = rows[0] ? `<thead>\n${rows[0]}\n</thead>` : '';
		const body = rows.length > 1 ? `\n<tbody>\n${rows.slice(1).join('\n')}\n</tbody>` : '';
		return `<table>\n${head}${body}\n</table>`;
	}

	const html = blocks(root.children);
	if (cited.length === 0) return html;
	const notes = cited
		.map((id) => `<li>${blocks(footnoteDefs.get(id)?.children)}</li>`)
		.join('\n');
	return `${html}\n<hr>\n<section class="footnotes">\n<ol>\n${notes}\n</ol>\n</section>`;
}

// --- Link targets --------------------------------------------------------------------------

interface PathIndex {
	/** Resolves a wikilink target: by path or by name, as Obsidian does. */
	resolve: (target: string, fromPath: string) => string | null;
	/** Resolves a Markdown link target by path relative to the note or the vault root. */
	exact: (target: string, fromPath: string) => string | null;
}

function buildIndex(files: string[]): PathIndex {
	const keyOf = (p: string) => p.replace(NOTE, '').toLowerCase();
	const byPath = new Map<string, string>();
	const byName = new Map<string, string[]>();
	for (const f of files) {
		byPath.set(keyOf(f), f);
		const name = keyOf(f.replace(/^.*\//, ''));
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
			byPath.get(keyOf(normalize(dir ? `${dir}/${t}` : t))) ??
			byPath.get(keyOf(normalize(t))) ??
			null
		);
	};
	return {
		exact,
		resolve(target, fromPath) {
			const t = target.trim().replace(/^\//, '');
			if (t.includes('/')) return exact(t, fromPath);
			const candidates = byName.get(keyOf(t));
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
