const toHex = (buf: ArrayBuffer) =>
	Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(
		'',
	);

/** Git blob SHA-1, to compare local content with GitHub's `sha` without downloading it. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
	const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
	const all = new Uint8Array(header.length + bytes.length);
	all.set(header);
	all.set(bytes, header.length);
	return toHex(await crypto.subtle.digest('SHA-1', all));
}

export function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(bin);
}
