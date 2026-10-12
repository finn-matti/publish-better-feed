import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		coverage: {
			include: ['src/**'],
			// Obsidian UI and lifecycle glue; everything with logic is tested without Obsidian.
			exclude: ['src/main.ts', 'src/settings.ts'],
		},
	},
});
