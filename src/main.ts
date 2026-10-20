import { Notice, Plugin, debounce, parseYaml } from 'obsidian';
import { pushFile, readFeed } from './github';
import { liveText } from './live';
import { metaResolver } from './notes';
import { fetchPermalinks } from './permalinks';
import { updateFeed, type FeedDeps } from './pipeline';
import { getPublishInstance, hookPublish } from './publish';
import { createRenderer } from './render';
import { FeedRunner } from './runner';
import { FeedSettingTab } from './settings';
import { DEFAULT_SETTINGS, normalizeSettings, type FeedSettings } from './settings-model';
import { assetBase } from './urls';

/**
 * How it runs:
 *  1. `onload` loads settings, creates the runner and the command, and, once Obsidian's layout is
 *     ready, installs the hook on the core Publish plugin.
 *  2. The hook tells the runner that something was published (`requestUpdate`).
 *  3. The runner waits for quiet, then runs `updateFeed` (pipeline.ts): read the old feed, ask
 *     Publish what is live, build the entries and the Atom file, push it to GitHub.
 *  4. A notice shows while an update runs and how it went. A publish that is never followed by a
 *     successful update is remembered (`pendingUpdate`) and finished at the next start.
 */
export default class FeedPlugin extends Plugin {
	settings!: FeedSettings;
	private runner!: FeedRunner;

	async onload() {
		await this.loadSettings();
		const deps: FeedDeps = {
			getSettings: () => this.settings,
			getInstance: () => getPublishInstance(this.app),
			getToken: (name) => this.app.secretStorage.getSecret(name),
			createMetaResolver: (inst, { siteUrl, files, permalinks, full }) => {
				const render = full
					? createRenderer({
							siteUrl,
							assetBase: assetBase(inst.host, inst.siteId),
							files: files.map((f) => f.path),
							permalinks,
						})
					: undefined;
				return metaResolver(
					(live) =>
						liveText(
							inst,
							async (path) => {
								const file = this.app.vault.getFileByPath(path);
								return file ? this.app.vault.readBinary(file) : null;
							},
							live,
						),
					parseYaml,
					render,
				);
			},
			fetchPermalinks,
			readFeed,
			push: pushFile,
		};
		this.runner = new FeedRunner({
			update: (manual) => updateFeed(deps, manual),
			debounce: (fn, ms) => debounce(fn, ms, true),
			showProgress: (message) => {
				const notice = new Notice(message, 0);
				return () => notice.hide();
			},
			notify: (message) => new Notice(message),
			logError: (e) => console.error('Publish feed:', e),
			setDirty: (dirty) => {
				if (this.settings.pendingUpdate === dirty) return;
				this.settings.pendingUpdate = dirty;
				void this.saveSettings();
			},
		});

		this.addSettingTab(new FeedSettingTab(this.app, this));
		this.addCommand({
			id: 'rebuild-feed',
			name: 'Rebuild feed',
			callback: () => void this.runner.updateNow(),
		});
		this.app.workspace.onLayoutReady(() => {
			this.installHook();
			// Closing Obsidian can interrupt an update; finish it now.
			if (this.settings.pendingUpdate && this.settings.autoPush) this.runner.requestUpdate();
		});
	}

	onunload() {
		this.runner.cancel();
	}

	private installHook() {
		const inst = getPublishInstance(this.app);
		if (!inst) {
			console.warn(
				'Publish feed: core Publish plugin unavailable; auto-update disabled. Use the "Rebuild feed" command.',
			);
			return;
		}
		this.register(
			hookPublish(inst, () => {
				if (this.settings.autoPush) this.runner.requestUpdate();
			}),
		);
	}

	async loadSettings() {
		const loaded = (await this.loadData()) as Partial<FeedSettings>;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			normalizeSettings(loaded),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
