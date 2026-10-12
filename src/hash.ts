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

/** Lowercase hex SHA-256, the format Publish uses for file hashes. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
	return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

export function fromBase64(b64: string): string {
	const bin = atob(b64.replace(/\s/g, ''));
	return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
