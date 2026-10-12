# Obsidian Publish Feed Plugin

Obsidian community plugin that generates an Atom feed of recent changes for an
Obsidian Publish site and hosts it on GitHub Pages.

## Why

Publish's built-in `/rss.xml` is generated server-side and only has `<title>` and
`<link>` per item (no dates, guid, or content; oldest first; moved files appear as
new). It can't be enhanced from the client. Publish rejects non-whitelisted file
types (xml/json), so we don't upload the feed to Publish. We host it externally.

Scope for now: a better version of `rss.xml`, nothing else.

## Architecture

1. Hook the core Publish plugin to learn when files are published or removed.
2. Debounce (10 s by default after the last upload or remove) to detect the end of a publish run.
3. Build Atom from `apiList()` (what's live and when) plus vault metadata.
4. Push `feed.atom` to a GitHub repo served by GitHub Pages (Contents API).

Modules in `src/`: `publish.ts` (instance access, validation, hook, site URL),
`entries.ts` (list to entries, page URLs), `notes.ts` (title and summary from the vault),
`feed.ts` (Atom XML), `github.ts` (Contents API push), `hash.ts` (git blob sha, base64),
`settings.ts`, `main.ts` (lifecycle, debounce, rebuild).

Current behavior: one entry per published note, newest first, `updated` = live `mtime`,
`published` = `ctime`, summary from the `description` property else the first paragraph.
Author comes from a setting (default: feed title). The site URL is not a setting: it comes
from Publish. An automatic run with zero entries skips the push so a bad `apiList()`
response can't wipe the feed; the manual "Rebuild feed" command always pushes.

## Publish internals (verified in Obsidian 1.14.4 app bundle, undocumented)

`app.internalPlugins.getEnabledPluginById("publish")` returns the instance, or null if disabled.

| Member | Notes |
| --- | --- |
| `siteId`, `host` | null if no site configured. `host` is the API server, not the site URL |
| `includes`, `excludes` | folder rules |
| `getPublishFlag(file)` | true / false / null: frontmatter `publish`, then excludes, then includes |
| `getHash(file)` | SHA-256 of raw bytes (metadata cache or computed) |
| `getCurrentSlug()` | async; site slug, falls back to `siteId` |
| `apiCustomUrl()` | async; `{ url }` when a custom domain is set (network call via Publish) |
| `apiList()` | `{ owner, files: [{ path, hash, ctime, mtime, size }] }` |
| `apiUploadFile(file: TFile)` | used by the dialog, the "publish current file" command, the file menu and this instance's own CLI handler (not the external `ob` CLI, see Out of scope) |
| `apiRemoveFile(path)` | used for unpublish and delete |
| `scanForChanges()` | same diff the Publish dialog shows |

Publish emits no events. Wrap `apiUploadFile` and `apiRemoveFile` with `monkey-around`
(register the uninstaller with `this.register`).

Site and page URLs, as Publish builds them: site = `https://publish.obsidian.md/<slug>`
(or the custom domain from `apiCustomUrl()`, without a slug); page = site + `/` + path
without `.md`, each segment `encodeURIComponent` with `%20` replaced by `+`. The bundle's
own "open in live site" link ignores `permalink`, so we do too.

To inspect internals yourself: extract the app bundle and grep `app.js`
(`npx @electron/asar extract /Applications/Obsidian.app/Contents/Resources/app.asar <dir>`;
identifiers are minified but property and string names survive).

## Out of scope

- Publishing from elsewhere: the Obsidian CLI (`ob`) or another collaborator's or
  device's Obsidian instance. The hook only sees uploads and removals made through
  this instance. The manual "Rebuild feed" command is the only way to pick up
  changes made elsewhere.
- Frontmatter opt-outs (`feed: skip`) and `permalink` handling.

## Rules

- Observe only. Never call `apiUploadFile` with our own files.
- The hook wrapper must be transparent: call the original first, return its exact
  result, never throw, notify only on success.
- Never read or handle the account token. All Publish calls go through the instance.
- Guard every internal access (existence and type checks). If the shape changes,
  disable the hook and keep a manual "Rebuild feed" command working.
- No Node APIs. Use `requestUrl` and `crypto.subtle` so the plugin works on mobile.
- The GitHub token lives in Obsidian's SecretStorage (`app.secretStorage`, `SecretComponent`,
  since 1.11.4, hence `minAppVersion`). Settings store only the secret's name. Never log or
  echo the token. Use a fine-grained token limited to the one repo, Contents read/write.
- Check the `@since` tag of any newly used API against `minAppVersion`. `obsidian` is a
  types-only dev dependency (`latest`, pinned by the lockfile); it does not change runtime.
- GitHub Contents API: the GET for the current `sha` must bypass HTTP caches
  (`Cache-Control: no-cache` plus a cache-busting query), or a stale sha gives a 409 even
  after retry. Skip the PUT when the git blob sha already matches.
- Name the feed file `*.atom`: Pages serves `.atom` as `application/atom+xml` (via mime-db)
  and `.xml` as plain `application/xml`.
- Pages deploys ~30 s after a push and caches for 10 min. That is expected.
- README needs a network-use disclosure (GitHub API, Publish API via the instance).

## Open decisions

- Feed semantics: one entry per note (current) or one entry per change or publish run.
  Crossposting tools need new IDs per change; this needs a persisted snapshot of the
  previous `apiList()` to diff against.
- Content: summary only so far, add full content later. Rendering with `MarkdownRenderer`
  means rewriting internal links to Publish URLs and images to
  `https://<host>/access/<siteId>/...` (unverified).
- Noise filtering: skip renames (same hash, new path), opt-in per change via frontmatter.
- A pending debounce is lost if Obsidian quits before it fires.
- Settings-search lint warning (`getSettingDefinitions()` for Obsidian 1.13+).

## Commits

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), enforced by
commitlint (`@commitlint/config-conventional`) in a husky `commit-msg` hook and in CI
for pull requests. Example: `feat(feed): add per-change entries`.

Commit messages are a single short subject line: no body, no trailers, no
attribution lines, unless explicitly asked for. Default branch is `main`.

## Development

- `npm run dev` (watch build), `npm run build` (typecheck + production), `npm run lint`,
  `npm test` (vitest). Run lint, build and tests before every commit; CI runs the same on
  Node 20, 22 and 24 plus commitlint on pull requests.
- `npm ci` in CI needs a lockfile that includes all platforms' optional packages. If it
  fails with "Missing: ... from lock file", regenerate: delete `node_modules` and
  `package-lock.json`, `npm install`. Keep the root `esbuild` version equal to the one
  vitest's vite pulls in, or two copies end up in the lockfile.
- ESLint (`eslint-plugin-obsidianmd`) rejects sample code and `console.log`; `dev/` is
  excluded from linting.
- The production bundle is minified, so identifiers are mangled in the console.
  `touch` does not trigger a rebuild; esbuild only rewrites on a content change.

## Testing

Unit tests (`tests/`) run against `tests/mock-publish.ts`, which has the instance shape
above, and a mocked `requestUrl` for `github.ts`.

Manual loop: `~/Local/Obsidian/TESTVAULT` has this repo symlinked as the plugin and the
community Hot Reload plugin installed. Core Publish is enabled but has no site, so paste
`dev/fake-publish.js` in the Obsidian console once per session, before the plugin loads
(or disable and enable the plugin afterwards), then upload with
`await fakePublish.apiUploadFile(app.vault.getFileByPath("Note.md"))`. Re-pasting the
snippet empties the fake's published list.
Throwaway target: `finn-matti/publish-feed-test` (public, Pages from `main`), feed at
`https://finn-matti.github.io/publish-feed-test/feed.atom`. Check pushes with `gh api
repos/finn-matti/publish-feed-test/contents/feed.atom`.

Real-subscription checklist (7-day refund deletes the site):
1. Are `apiList()` `mtime`/`ctime` values server-side publish times, in milliseconds?
2. Does the hook fire for the dialog, the single-file command and the file menu?
3. Does local `getHash()` match the live hash after publishing?
4. Do `getCurrentSlug()` and `apiCustomUrl()` return what the bundle suggests? With a
   custom domain, are entry URLs correct?
5. Do the page URLs built from paths (spaces, folders, special characters) open the
   live pages?
6. Does `apiList()` include non-note files, and are notes always `.md`?
7. End to end: publish, feed, GitHub Pages, feed reader and an Atom validator.

Use the open-source `obsidianmd/obsidian-help` vault as realistic content.

## References

- Prior art using Publish internals: https://github.com/toki1703/publish-status
  (reads the instance, calls `scanForChanges()`; also handles the token and uploads
  directly, which we avoid).
- Plugin docs: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- Sample plugin template: https://github.com/obsidianmd/obsidian-sample-plugin
- `.atom` content type on Pages: https://github.com/jekyll/jekyll-feed/issues/358#issuecomment-1003658903
