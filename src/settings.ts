import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type FeedPlugin from './main';

export interface FeedSettings {
	githubOwner: string;
	githubRepo: string;
	githubBranch: string;
	feedPath: string;
	/** Name of the secret in Obsidian's secret storage, not the token itself. */
	tokenSecretName: string;
	siteUrl: string;
	feedTitle: string;
	maxEntries: number;
	autoPush: boolean;
	debounceSeconds: number;
}

export const DEFAULT_SETTINGS: FeedSettings = {
	githubOwner: '',
	githubRepo: '',
	githubBranch: 'main',
	feedPath: 'feed.xml',
	tokenSecretName: '',
	siteUrl: '',
	feedTitle: 'Recent changes',
	maxEntries: 50,
	autoPush: true,
	debounceSeconds: 10,
};

/** Public URL of the feed on GitHub Pages. */
export function feedUrl(s: FeedSettings): string {
	const root = s.githubRepo.toLowerCase() === `${s.githubOwner}.github.io`.toLowerCase();
	const base = `https://${s.githubOwner}.github.io${root ? '' : `/${s.githubRepo}`}`;
	return `${base}/${s.feedPath}`;
}

export class FeedSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: FeedPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		const text = (
			name: string,
			desc: string,
			key: 'githubOwner' | 'githubRepo' | 'githubBranch' | 'feedPath' | 'siteUrl' | 'feedTitle',
			placeholder = '',
		) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((t) =>
					t
						.setPlaceholder(placeholder)
						.setValue(s[key])
						.onChange(async (v) => {
							s[key] = v.trim();
							await this.plugin.saveSettings();
						}),
				);

		new Setting(containerEl).setName('Feed').setHeading();
		text('Feed title', '', 'feedTitle');
		text(
			'Site URL',
			'Public base URL of your Publish site. Used for entry links.',
			'siteUrl',
			'https://publish.obsidian.md/your-site',
		);
		new Setting(containerEl)
			.setName('Maximum entries')
			.addText((t) =>
				t.setValue(String(s.maxEntries)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (n > 0) {
						s.maxEntries = n;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(containerEl).setName('Hosting').setHeading();
		text('Owner', 'GitHub user or organization.', 'githubOwner');
		text('Repository', 'Repository served by GitHub Pages.', 'githubRepo');
		text('Branch', 'Branch GitHub Pages publishes from.', 'githubBranch');
		text('Feed path', 'File path inside the repository.', 'feedPath');
		new Setting(containerEl)
			.setName('Access token')
			.setDesc(
				'Fine-grained token with contents write access to this one repository. Stored in Obsidian secret storage.',
			)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(s.tokenSecretName)
					.onChange(async (v) => {
						s.tokenSecretName = v ?? '';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Updates').setHeading();
		new Setting(containerEl)
			.setName('Update after publishing')
			.setDesc('Rebuild and push the feed shortly after a publish run.')
			.addToggle((t) =>
				t.setValue(s.autoPush).onChange(async (v) => {
					s.autoPush = v;
					await this.plugin.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName('Delay (seconds)')
			.setDesc('Wait this long after the last upload or removal.')
			.addText((t) =>
				t.setValue(String(s.debounceSeconds)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (n >= 0) {
						s.debounceSeconds = n;
						await this.plugin.saveSettings();
						this.plugin.refreshDebounce();
					}
				}),
			);
	}
}
