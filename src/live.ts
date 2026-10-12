import { sha256Hex } from './hash';
import type { PublishFile, PublishInstance } from './publish';

const isBuffer = (v: unknown): v is ArrayBuffer =>
	Object.prototype.toString.call(v) === '[object ArrayBuffer]';

/**
 * The text of a note exactly as published, or null if it can't be proven.
 * Bytes count only if their SHA-256 equals the live hash from `apiList()`: first the
 * local file, else the live copy from Publish. `apiDownloadFile` never throws; on a
 * server error it returns the error body, which can't pass this check.
 */
export async function liveText(
	inst: PublishInstance,
	readLocal: (path: string) => Promise<ArrayBuffer | null>,
	live: PublishFile,
): Promise<string | null> {
	if (!live.hash) return null;
	const verified = async (buf: unknown) =>
		isBuffer(buf) && (await sha256Hex(buf)) === live.hash
			? new TextDecoder().decode(buf)
			: null;
	try {
		const local = await verified(await readLocal(live.path));
		if (local !== null) return local;
	} catch {
		// Fall through to the live copy.
	}
	try {
		if (typeof inst.apiDownloadFile !== 'function') return null;
		return await verified(await inst.apiDownloadFile(live.path));
	} catch {
		return null;
	}
}
