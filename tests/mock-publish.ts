import type { PublishFile } from '../src/publish';

/** Mock of the Publish instance shape documented in CLAUDE.md. */
export function mockPublish(files: PublishFile[] = []) {
	const calls: string[] = [];
	return {
		calls,
		siteId: 'abc123',
		host: 'publish.obsidian.md',
		apiDownloadFile: () => Promise.resolve(new TextEncoder().encode('Something broke!').buffer),
		getCurrentSlug: () => Promise.resolve('my-slug'),
		apiCustomUrl: () => Promise.resolve({}) as Promise<unknown>,
		apiList: () => Promise.resolve({ owner: 'o', files }),
		apiUploadFile: (f: unknown) => {
			calls.push(`upload:${String(f)}`);
			return Promise.resolve('uploaded');
		},
		apiRemoveFile: (p: unknown) => {
			calls.push(`remove:${String(p)}`);
			return Promise.resolve('removed');
		},
	};
}
