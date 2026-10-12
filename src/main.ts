import { Notice, Plugin } from 'obsidian';
import { createDebouncer } from './debounce';
import { pushFile } from './github';
import { vaultMetaResolver } from './notes';
import { getPublishInstance, hookPublish, matchesLive } from './publish';
import { FeedService } from './service';
import { FeedSettingTab } from './settings';
import { DEFAULT_SETTINGS, type FeedSettings } from './settings-model';

// lol
export default class FeedPlugin extends Plugin {
	settings!: FeedSettings;
	private service!: FeedService;
	private debouncer = createDebouncer(
		() => void this.service.rebuild(false),
		() => this.settings.debounceSeconds * 1000,
	);

	async onload() {
		await this.loadSettings();
		this.service = new FeedService({
			getSettings: () => this.settings,
			getInstance: () => getPublishInstance(this.app),
			getToken: (name) => this.app.secretStorage.getSecret(name),
			createMetaResolver: (inst) =>
				vaultMetaResolver(this.app, (file, hash) => matchesLive(inst, file, hash)),
			push: pushFile,
			notify: (message) => new Notice(message),
			logError: (e) => console.error('Publish feed:', e),
		});
		this.addSettingTab(new FeedSettingTab(this.app, this));
		this.addCommand({
			id: 'rebuild-feed',
			name: 'Rebuild feed',
			callback: () => void this.service.rebuild(true),
		});
		this.app.workspace.onLayoutReady(() => this.installHook());
	}

	onunload() {
		this.debouncer.cancel();
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
				if (this.settings.autoPush) this.debouncer.schedule();
			}),
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<FeedSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
