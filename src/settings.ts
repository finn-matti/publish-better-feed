import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type FeedPlugin from './main';

const validateNonNegative = (v: unknown): string | void => {
	if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
		return 'Cooldown must be a non-negative number.';
	}
};

const validatePositiveInteger = (v: unknown): string | void => {
	if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
		return 'Maximum entries must be a positive integer.';
	}
};

const validateNoWhitespace = (
	v: unknown,
	fieldName: string,
): string | void => {
	if (typeof v === 'string' && v !== v.trim()) {
		return `${fieldName} must not have surrounding whitespace.`;
	}
};

export class FeedSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: FeedPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Feed',
				items: [
					{
						name: 'Feed title',
						control: {
							type: 'text',
							key: 'feedTitle',
						},
					},
					{
						name: 'Author',
						desc: 'Author name shown in feed readers. Defaults to the feed title.',
						control: {
							type: 'text',
							key: 'feedAuthor',
						},
					},
					{
						name: 'Content',
						desc: 'Full text puts each note\'s published text in the feed. Summary shows one short snippet.',
						control: {
							type: 'dropdown',
							key: 'contentMode',
							options: {
								full: 'Full text',
								summary: 'Summary only',
							},
						},
					},
					{
						name: 'Update cooldown (hours)',
						desc: 'A note moves to the top of the feed at most once per this time. Publishing sooner updates its text but not its position. Set it to zero to show every publish.',
						control: {
							type: 'number',
							key: 'cooldownHours',
							min: 0,
							validate: validateNonNegative,
						},
					},
					{
						name: 'Maximum entries',
						control: {
							type: 'number',
							key: 'maxEntries',
							min: 1,
							step: 1,
							validate: validatePositiveInteger,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Hosting',
				items: [
					{
						name: 'Owner',
						desc: 'GitHub user or organization.',
						control: {
							type: 'text',
							key: 'githubOwner',
							validate: (v) => validateNoWhitespace(v, 'Owner'),
						},
					},
					{
						name: 'Repository',
						desc: 'Repository served by GitHub Pages.',
						control: {
							type: 'text',
							key: 'githubRepo',
							validate: (v) => validateNoWhitespace(v, 'Repository'),
						},
					},
					{
						name: 'Branch',
						desc: 'Branch GitHub Pages publishes from.',
						control: {
							type: 'text',
							key: 'githubBranch',
							validate: (v) => validateNoWhitespace(v, 'Branch'),
						},
					},
					{
						name: 'Feed path',
						desc: 'File path inside the repository. Keep the .atom extension so Pages serves the right content type.',
						control: {
							type: 'text',
							key: 'feedPath',
							validate: (v) => validateNoWhitespace(v, 'Feed path'),
						},
					},
					{
						name: 'Access token',
						desc: 'Fine-grained token with contents write access to this one repository. Stored in Obsidian secret storage.',
						control: {
							type: 'secret',
							key: 'tokenSecretName',
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Updates',
				items: [
					{
						name: 'Update after publishing',
						desc: 'Rebuild and push the feed shortly after a publish run.',
						control: {
							type: 'toggle',
							key: 'autoPush',
						},
					},
				],
			},
		];
	}
}
