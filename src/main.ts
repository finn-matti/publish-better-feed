import { Notice, Plugin, debounce } from 'obsidian';
import { buildEntries } from './entries';
import { buildAtom } from './feed';
import { pushFile } from './github';
import { vaultMetaResolver } from './notes';
import {
	getPublishInstance,
	hookPublish,
	parsePublishList,
	type PublishInstance,
} from './publish';
import {
	DEFAULT_SETTINGS,
	FeedSettingTab,
	feedUrl,
	type FeedSettings,
} from './settings';

export default class FeedPlugin extends Plugin {
	settings!: FeedSettings;
	private uninstallHook: (() => void) | null = null;
	private running = false;
	private rerun = false;
	private scheduleRebuild = this.makeDebounce();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FeedSettingTab(this.app, this));
		this.addCommand({
			id: 'rebuild-feed',
			name: 'Rebuild feed',
			callback: () => void this.rebuild(true),
		});
		this.app.workspace.onLayoutReady(() => this.installHook());
	}

	onunload() {
		this.scheduleRebuild.cancel();
	}

	private installHook() {
		const inst = getPublishInstance(this.app);
		if (!inst) {
			console.warn(
				'Publish feed: core Publish plugin unavailable; auto-update disabled. Use the "Rebuild feed" command.',
			);
			return;
		}
		this.uninstallHook = hookPublish(inst, () => {
			if (this.settings.autoPush) this.scheduleRebuild();
		});
		this.register(this.uninstallHook);
	}

	refreshDebounce() {
		this.scheduleRebuild.cancel();
		this.scheduleRebuild = this.makeDebounce();
	}

	private makeDebounce() {
		return debounce(
			() => void this.rebuild(false),
			(this.settings?.debounceSeconds ?? 10) * 1000,
			true,
		);
	}

	/** Builds the feed and pushes it. `manual` runs report their outcome in a notice. */
	async rebuild(manual: boolean) {
		if (this.running) {
			this.rerun = true;
			return;
		}
		this.running = true;
		try {
			const result = await this.buildAndPush();
			if (manual) new Notice(`Publish feed: ${result}`);
		} catch (e) {
			console.error('Publish feed:', e);
			new Notice(`Publish feed failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.running = false;
			if (this.rerun) {
				this.rerun = false;
				void this.rebuild(false);
			}
		}
	}

	private async buildAndPush(): Promise<string> {
		const s = this.settings;
		const inst: PublishInstance | null = getPublishInstance(this.app);
		if (!inst) throw new Error('Publish is not enabled or not configured');
		const token = s.tokenSecretName
			? this.app.secretStorage.getSecret(s.tokenSecretName)
			: null;
		if (!token) throw new Error('No GitHub token configured');
		if (!s.githubOwner || !s.githubRepo) {
			throw new Error('GitHub owner and repository are required');
		}

		const siteUrl = s.siteUrl || `https://${inst.host}`;
		const files = parsePublishList(await inst.apiList());
		const entries = await buildEntries(files, {
			siteUrl,
			maxEntries: s.maxEntries,
			resolve: vaultMetaResolver(this.app),
		});
		const xml = buildAtom(
			{ title: s.feedTitle, siteUrl, feedUrl: feedUrl(s) },
			entries,
		);
		const outcome = await pushFile(
			{
				token,
				owner: s.githubOwner,
				repo: s.githubRepo,
				branch: s.githubBranch,
				path: s.feedPath,
			},
			xml,
			'Update feed',
		);
		return `${outcome} (${entries.length} entries)`;
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
