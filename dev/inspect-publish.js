// Read-only. Paste into the Obsidian console of a vault with a real Publish site.
// Prints what the real instance returns, for the checklist in CLAUDE.md.
(async () => {
	const p = app.internalPlugins.getEnabledPluginById('publish');
	if (!p?.siteId) return console.error('No Publish site configured');
	const list = await p.apiList();
	const iso = (t) => new Date(t).toISOString();
	console.log('slug:', await p.getCurrentSlug());
	console.log('custom url:', JSON.stringify(await p.apiCustomUrl()));
	console.log('now:', iso(Date.now()), '| files:', list.files.length);
	const rows = [];
	for (const f of list.files) {
		const file = app.vault.getFileByPath(f.path);
		rows.push({
			path: f.path,
			ctime: f.ctime,
			ctimeIso: f.ctime > 0 ? iso(f.ctime) : '-',
			mtimeIso: f.mtime > 0 ? iso(f.mtime) : '-',
			size: f.size,
			hashMatchesLocal: file ? (await p.getHash(file)) === f.hash : 'no local file',
		});
	}
	console.table(rows);
})();
