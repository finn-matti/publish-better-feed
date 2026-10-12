// Paste into the Obsidian developer console (Ctrl/Cmd+Shift+I) of the test vault.
// Requires the core Publish plugin to be enabled. Fakes a configured site so the
// plugin's guards pass. Uploads store the file's bytes and SHA-256 hex hash like the real
// service, so apiList() and apiDownloadFile() behave realistically.
(() => {
	const inst = app.internalPlugins.getEnabledPluginById('publish');
	if (!inst) return console.error('Enable the core Publish plugin first');
	inst.siteId = 'fake-site';
	inst.host = 'publish.example.test';
	const published = new Map(); // path -> { ctime, mtime, hash, size, bytes }
	const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
	inst.getCurrentSlug = async () => 'fake-slug';
	inst.apiCustomUrl = async () => ({});
	inst.apiList = async () => ({
		owner: 'fake',
		files: [...published].map(([path, f]) => ({
			path,
			hash: f.hash,
			size: f.size,
			ctime: f.ctime,
			mtime: f.mtime,
		})),
	});
	inst.apiDownloadFile = async (path) => {
		const f = published.get(path);
		return f ? f.bytes.slice(0) : new TextEncoder().encode('Something broke!').buffer;
	};
	inst.apiUploadFile = async (file) => {
		const now = Date.now();
		const bytes = await app.vault.readBinary(file);
		const hash = hex(await crypto.subtle.digest('SHA-256', bytes));
		const ctime = published.get(file.path)?.ctime ?? now;
		published.set(file.path, { ctime, mtime: now, hash, size: bytes.byteLength, bytes });
	};
	inst.apiRemoveFile = async (path) => void published.delete(path);
	window.fakePublish = inst;
	console.log('Fake Publish ready. Try: await fakePublish.apiUploadFile(app.vault.getFileByPath("Feed test one.md"))');
})();
