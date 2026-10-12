import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type FeedPlugin from './main';

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
			key: 'githubOwner' | 'githubRepo' | 'githubBranch' | 'feedPath' | 'feedTitle' | 'feedAuthor',
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
			'Author',
			'Author name shown in feed readers. Defaults to the feed title.',
			'feedAuthor',
		);
		new Setting(containerEl)
			.setName('Content')
			.setDesc('Full text puts each note\'s published text in the feed. Summary shows one short snippet.')
			.addDropdown((d) =>
				d
					.addOption('full', 'Full text')
					.addOption('summary', 'Summary only')
					.setValue(s.contentMode)
					.onChange(async (v) => {
						s.contentMode = v === 'summary' ? 'summary' : 'full';
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName('Update cooldown (hours)')
			.setDesc(
				'A note moves to the top of the feed at most once per this time. Publishing sooner updates its text but not its position. Set it to zero to show every publish.',
			)
			.addText((t) =>
				t.setValue(String(s.cooldownHours)).onChange(async (v) => {
					const n = parseFloat(v);
					if (n >= 0) {
						s.cooldownHours = n;
						await this.plugin.saveSettings();
					}
				}),
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
		text(
			'Feed path',
			'File path inside the repository. Keep the .atom extension so Pages serves the right content type.',
			'feedPath',
		);
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
	}
}
