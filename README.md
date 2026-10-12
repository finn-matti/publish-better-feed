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

A note moves to the top of the feed at most once per cooldown (24 hours by default, see the
settings; zero shows every publish). Publishing again sooner still updates the note's text in the
feed, but not its position, so fixing a typo doesn't resurface it. The feed itself records when each
note last surfaced.

On desktop the status bar shows when an update is pending, running or finished, and clicking it
updates the feed right away. If Obsidian is closed before an update has finished, the plugin
completes it at the next start.

The feed carries each note's published text as HTML (or only a summary, see the Content
setting). Links and embeds only point at published files, links to unpublished notes become
plain text, and comments and frontmatter are removed.

Feed readers keep the entries they have already fetched. If you change the Content setting, or
update the plugin, readers that already know an entry keep showing the older version until
the note is published again. Resubscribing shows the current text of everything.

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

**What reaches the feed.** Only text that is published: a note's text is used only if it matches
what is live on Publish, and edits you haven't published never appear. Links and embeds point only
at published files, and raw HTML is dropped.

**Comments are not private on Publish.** `%%comments%%` and frontmatter are removed from the
feed, as Publish hides them when it renders a page. But Publish serves the raw Markdown of every
published note, comments included, at a public address, and search engines receive it as well.
Do not keep anything private in a note you publish, even in a comment.

## Network use

- **GitHub API** (`api.github.com`): reads and writes the feed file in your
  repository, using your token.
- **Obsidian Publish API**: the plugin asks the core Publish plugin for the
  list of published files and, for notes you have edited since publishing, for
  the live copy. These requests are made by Obsidian itself, with your session.
- **Your Publish site** (`publish-01.obsidian.md` or the host Publish reports): the plugin reads the
  site's public metadata file (`/cache/<site id>`) to find notes with a `permalink`. No account
  token is sent, and if the request fails, links use the file paths.

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
