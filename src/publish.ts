import type { App } from 'obsidian';
import { around } from 'monkey-around';

export interface PublishFile {
	path: string;
	hash: string;
	ctime: number;
	mtime: number;
	size: number;
}

export interface PublishInstance {
	siteId: string;
	host: string;
	apiList: () => Promise<unknown>;
	apiUploadFile: (...args: unknown[]) => unknown;
	apiRemoveFile: (...args: unknown[]) => unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null;

/** Returns the core Publish instance, or null if it is disabled or its shape changed. */
export function getPublishInstance(app: App): PublishInstance | null {
	try {
		const internal = (app as unknown as Record<string, unknown>)
			.internalPlugins;
		if (!isRecord(internal)) return null;
		const getter = internal.getEnabledPluginById;
		if (typeof getter !== 'function') return null;
		const inst: unknown = getter.call(internal, 'publish');
		if (!isRecord(inst)) return null;
		if (
			typeof inst.siteId !== 'string' ||
			typeof inst.host !== 'string' ||
			typeof inst.apiList !== 'function' ||
			typeof inst.apiUploadFile !== 'function' ||
			typeof inst.apiRemoveFile !== 'function'
		) {
			return null;
		}
		return inst as unknown as PublishInstance;
	} catch {
		return null;
	}
}

/** Validates the `apiList()` response. Unknown shapes yield an empty list. */
export function parsePublishList(raw: unknown): PublishFile[] {
	if (!isRecord(raw) || !Array.isArray(raw.files)) return [];
	const out: PublishFile[] = [];
	for (const f of raw.files as unknown[]) {
		if (!isRecord(f) || typeof f.path !== 'string') continue;
		out.push({
			path: f.path,
			hash: typeof f.hash === 'string' ? f.hash : '',
			ctime: typeof f.ctime === 'number' ? f.ctime : 0,
			mtime: typeof f.mtime === 'number' ? f.mtime : 0,
			size: typeof f.size === 'number' ? f.size : 0,
		});
	}
	return out;
}

/**
 * Observes successful uploads and removals. The wrappers are transparent: they
 * call the original first, return its exact result, and never throw.
 * Returns an uninstaller.
 */
export function hookPublish(
	inst: PublishInstance,
	onChange: () => void,
): () => void {
	const notifyWhenDone = (result: unknown) => {
		try {
			if (isRecord(result) && typeof result.then === 'function') {
				(result as unknown as Promise<unknown>).then(onChange, () => undefined);
			} else {
				onChange();
			}
		} catch {
			// Observing must never affect publishing.
		}
	};
	const wrap =
		(next: (...args: unknown[]) => unknown) =>
		function (this: unknown, ...args: unknown[]) {
			const result = next.apply(this, args);
			notifyWhenDone(result);
			return result;
		};
	return around(inst, {
		apiUploadFile: wrap,
		apiRemoveFile: wrap,
	});
}
