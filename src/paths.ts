export const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
export const NOTE = /\.md$/i;

interface PathIndex {
	/** Resolves a wikilink target: by path or by name, as Obsidian does. */
	resolve: (target: string, fromPath: string) => string | null;
	/** Resolves a Markdown link target by path relative to the note or the vault root. */
	exact: (target: string, fromPath: string) => string | null;
}

export function buildIndex(files: string[]): PathIndex {
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
