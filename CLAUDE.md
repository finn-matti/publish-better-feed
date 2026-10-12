# Obsidian Publish Feed Plugin

Obsidian community plugin that generates an Atom feed of recent changes for an
Obsidian Publish site and hosts it on GitHub Pages.

## Why

Publish's built-in `/rss.xml` is generated server-side and only has `<title>` and
`<link>` per item (no dates, guid, or content; oldest first; moved files appear as
new). It can't be enhanced from the client. Publish rejects non-whitelisted file
types (xml/json), so we don't upload the feed to Publish. We host it externally.

## Architecture

1. Hook the core Publish plugin to learn when files are published or removed.
2. Debounce (a few seconds after the last upload or remove) to detect the end of a publish run.
3. Build Atom from `apiList()` (what's live and when) plus vault content.
4. Push `feed.atom` to a GitHub repo served by GitHub Pages (Contents API).

## Publish internals (verified in Obsidian 1.14.4 app bundle, undocumented)

`app.internalPlugins.getEnabledPluginById("publish")` returns the instance, or null if disabled.

| Member | Notes |
| --- | --- |
| `siteId`, `host` | null if no site configured. `host` is the API server, not the site URL |
| `includes`, `excludes` | folder rules |
| `getPublishFlag(file)` | true / false / null: frontmatter `publish`, then excludes, then includes |
| `getHash(file)` | SHA-256 of raw bytes (metadata cache or computed) |
| `getCurrentSlug()` | async; site slug (`https://publish.obsidian.md/<slug>`), falls back to `siteId` |
| `apiCustomUrl()` | async; `{ url }` when a custom domain is set (network call via Publish) |
| `apiList()` | `{ owner, files: [{ path, hash, ctime, mtime, size }] }` |
| `apiUploadFile(file: TFile)` | used by the dialog, the "publish current file" command, the file menu and this instance's own CLI handler (not the external `ob` CLI, see Out of scope) |
| `apiRemoveFile(path)` | used for unpublish and delete |
| `scanForChanges()` | same diff the Publish dialog shows |

Publish emits no events. Wrap `apiUploadFile` and `apiRemoveFile` with `monkey-around`
(register the uninstaller with `this.register`).

## Out of scope

- Publishing from elsewhere: the Obsidian CLI (`ob`) or another collaborator's or
  device's Obsidian instance. The hook only sees uploads and removals made through
  this instance. The manual "Rebuild feed" command is the only way to pick up
  changes made elsewhere.

## Rules

- Observe only. Never call `apiUploadFile` with our own files.
- Never read or handle the account token. All Publish calls go through the instance.
- Guard every internal access (existence and type checks). If the shape changes,
  disable the hook and keep a manual "Rebuild feed" command working.
- No Node APIs. Use `requestUrl` and `crypto.subtle` so the plugin works on mobile.
- The GitHub token is stored in plugin data, so document the risk in the README.
  Check whether the current API offers secret storage.
- README needs a network-use disclosure (GitHub API, Publish API via the instance).

## Open decisions

- Feed semantics: one entry per note (bump `updated`) or one entry per change or publish
  run. Crossposting tools need new IDs per change.
- Content: start with a summary (`description` property or first paragraph), add full
  content later. Rendering with `MarkdownRenderer` means rewriting internal links to
  Publish URLs (slug rules, `permalink`) and images to `https://<host>/access/<siteId>/...`.
- Noise filtering: opt-in per change via frontmatter (`updated:` / `changelog:`), skip
  renames (same hash, new path), `feed: skip`.

## Commits

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), enforced by
commitlint (`@commitlint/config-conventional`) in a husky `commit-msg` hook and in CI
for pull requests. Example: `feat(feed): add per-change entries`.

Commit messages are a single short subject line: no body, no trailers, no
attribution lines, unless explicitly asked for.

## Testing

Manual loop: `~/Local/Obsidian/TESTVAULT` has this repo symlinked as the plugin and the
community Hot Reload plugin installed. Run `npm run dev`, paste `dev/fake-publish.js` in
the Obsidian console once per session (before the plugin loads), and edits reload live.
Re-pasting the snippet empties the fake's published list.

- No Publish trial. Develop against a mock instance with the shape above.
  Use the open-source `obsidianmd/obsidian-help` vault as realistic content.
- Things to verify with a real subscription (7-day refund deletes the site):
  1. Are `apiList()` `mtime`/`ctime` values server-side publish times?
  2. Does the hook fire for the dialog, the single-file command and the file menu?
  3. Does local `getHash()` match the live hash after publishing?
  4. End to end: publish, feed, GitHub Pages, feed reader.

## References

- Prior art using Publish internals: https://github.com/toki1703/publish-status
  (reads the instance, calls `scanForChanges()`; also handles the token and uploads
  directly, which we avoid).
- Plugin docs: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- Sample plugin template: https://github.com/obsidianmd/obsidian-sample-plugin
