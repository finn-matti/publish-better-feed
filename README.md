# Better Publish Feed

Generates an Atom feed of recent changes for your Obsidian Publish site and
hosts it on GitHub Pages. Publish's built-in `/rss.xml` has no dates, ids or
summaries and lists oldest first. This plugin builds a proper feed instead.

## How it works

1. Watches the core Publish plugin in this vault for uploads and removals. It
   only observes; it never uploads anything itself.
2. A few seconds after the last change, it reads the list of live files from
   Publish and builds an Atom feed (newest first, one entry per note, with a
   summary from the `description` property or the first paragraph).
3. It pushes `feed.atom` to a GitHub repository served by GitHub Pages.

Not supported: changes published from elsewhere (the `ob` CLI or another
device). Run **Rebuild feed** to pick them up.

## Setup

1. Create a repository with GitHub Pages enabled.
2. Create a fine-grained personal access token limited to that repository with
   **Contents: read and write**.
3. In the plugin settings, enter owner, repository and branch, and pick or
   create a secret for the token. The site URL comes from Publish itself.
4. Subscribe to `https://<owner>.github.io/<repo>/feed.atom`. The `.atom` extension makes GitHub Pages serve it as
   `application/atom+xml`; `.xml` would be served as plain `application/xml`.

## Security

The GitHub token is kept in Obsidian's secret storage (requires Obsidian
1.11.4 or later). Plugin data holds only the secret's name. Use a token scoped
to a single repository. The plugin never reads or handles your Obsidian
account token.

## Network use

- **GitHub API** (`api.github.com`): reads and writes the feed file in your
  repository, using your token.
- **Obsidian Publish API**: the plugin asks the core Publish plugin for the
  list of published files. The request is made by Obsidian itself.

No other network requests are made and no telemetry is collected.

## Development

```bash
npm install
npm run dev            # watch build to main.js
npm test               # unit tests; npm run test:coverage for a report
npm run build          # typecheck + production build
```

To try it in Obsidian, use a throwaway vault:

1. Symlink or copy this folder to `<vault>/.obsidian/plugins/better-publish-feed`.
2. Enable community plugins, this plugin, and optionally the
   [Hot Reload](https://github.com/pjeby/hot-reload) plugin to reload on every rebuild.
3. Without a Publish site, enable the core Publish plugin and paste
   [`dev/fake-publish.js`](dev/fake-publish.js) into the developer console, then disable and
   re-enable this plugin. Upload notes with
   `await fakePublish.apiUploadFile(app.vault.getFileByPath("Note.md"))`.
4. With a real site, [`dev/inspect-publish.js`](dev/inspect-publish.js) prints what the
   Publish instance returns (read-only).

Use a throwaway GitHub repository and a fine-grained token limited to it.

## License

[MIT](LICENSE)
