import { key, type N } from './mdast';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const attr = (s: string) => esc(s).replace(/"/g, '&quot;');

/** Our own small serializer: the few node types we support, no raw HTML, every attribute escaped. */
export function toHtml(root: N): string {
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
