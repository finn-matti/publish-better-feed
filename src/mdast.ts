/** What we read of an mdast node (from `mdast-util-from-markdown` and our extensions). */
export interface N {
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

export interface Def {
	url: string;
	title?: string | null;
}

export const text = (value: string): N => ({ type: 'text', value });
export const plainText = (n: N): string =>
	n.children ? n.children.map(plainText).join('') : (n.value ?? '');
export const key = (id: string | undefined) => (id ?? '').toLowerCase();

export function collectDefinitions(node: N, defs: Map<string, Def>): void {
	for (const child of node.children ?? []) {
		if (child.type === 'definition' && child.url !== undefined) {
			const k = key(child.identifier);
			if (!defs.has(k)) defs.set(k, { url: child.url, title: child.title });
		}
		collectDefinitions(child, defs);
	}
}
