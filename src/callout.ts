import { text, type N } from './mdast';

/** `> [!type]+ Title` becomes a blockquote with a bold title; the body is always shown. */
export function callout(node: N): void {
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
