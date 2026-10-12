// Paste into the Obsidian developer console (Ctrl/Cmd+Shift+I) of the test vault.
// Requires the core Publish plugin to be enabled. Fakes a configured site so the
// plugin's guards pass, and serves the vault's notes from apiList().
(() => {
	const inst = app.internalPlugins.getEnabledPluginById('publish');
	if (!inst) return console.error('Enable the core Publish plugin first');
	inst.siteId = 'fake-site';
	inst.host = 'publish.example.test';
	const published = new Map(); // path -> { ctime, mtime }
	inst.apiList = async () => ({
		owner: 'fake',
		files: [...published].map(([path, t]) => ({ path, hash: '', size: 1, ...t })),
	});
	inst.apiUploadFile = async (file) => {
		const now = Date.now();
		published.set(file.path, { ctime: published.get(file.path)?.ctime ?? now, mtime: now });
	};
	inst.apiRemoveFile = async (path) => void published.delete(path);
	window.fakePublish = inst;
	console.log('Fake Publish ready. Try: await fakePublish.apiUploadFile(app.vault.getFileByPath("Feed test one.md"))');
})();
