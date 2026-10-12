# Obsidian Publish Feed Plugin

Obsidian community plugin that generates an Atom feed of recent changes for an
Obsidian Publish site and hosts it on GitHub Pages.

## Why

Publish's built-in `/rss.xml` is generated server-side and only has `<title>` and
`<link>` per item (no dates, guid, or content; oldest first; moved files appear as
new). It can't be enhanced from the client. Publish rejects non-whitelisted file
types (xml/json), so the feed is hosted externally. Goal: a better `rss.xml`.

## Architecture

1. Hook the core Publish plugin to learn when files are published or removed. Only
   this instance is observed; the "Rebuild feed" command covers changes made elsewhere
   (`ob` CLI, other devices).
2. Debounce after the last upload or remove to detect the end of a publish run.
3. Build Atom from `apiList()` (what's live and when) plus vault metadata.
4. Push `feed.atom` to a GitHub repo served by GitHub Pages (Contents API).

## Publish internals (verified in Obsidian 1.14.4 app bundle, undocumented)

`app.internalPlugins.getEnabledPluginById("publish")` returns the instance, or null if disabled.

| Member | Notes |
| --- | --- |
| `siteId`, `host` | null if no site configured. `host` is the API server, not the site URL |
| `getCurrentSlug()` | async; site slug, falls back to `siteId` |
| `apiCustomUrl()` | async; `{ url }` when a custom domain is set |
| `apiList()` | `{ owner, files: [{ path, hash, ctime, mtime, size }] }` |
| `apiUploadFile(file: TFile)` | dialog, "publish current file" command, file menu, own CLI handler |
| `apiRemoveFile(path)` | unpublish and delete |
| `getHash(file)` | SHA-256 of raw bytes |
| `getPublishFlag(file)`, `includes`, `excludes` | publish rules |
| `scanForChanges()` | same diff the Publish dialog shows |

Publish emits no events: wrap `apiUploadFile` and `apiRemoveFile` with `monkey-around`.

URLs as Publish builds them: site = `https://publish.obsidian.md/<slug>` (or the custom
domain, no slug); page = site + `/` + path without `.md`, each segment
`encodeURIComponent` with `%20` replaced by `+`. `permalink` is ignored by Publish's own links.

To inspect internals: `npx @electron/asar extract /Applications/Obsidian.app/Contents/Resources/app.asar <dir>`,
then grep `app.js` (identifiers are minified, property and string names are not).

## Rules

- Observe only. Never call `apiUploadFile` with our own files.
- The hook wrapper is transparent: call the original first, return its exact result,
  never throw, notify only on success.
- Never read or handle the account token. All Publish calls go through the instance.
- Guard every internal access (existence and type checks). If the shape changes, disable
  the hook; "Rebuild feed" must keep working.
- An automatic run with zero entries must not push (a bad `apiList()` would wipe the feed).
- No Node APIs: `requestUrl` and `crypto.subtle`, so it works on mobile.
- The GitHub token lives in SecretStorage (since 1.11.4, hence `minAppVersion`); settings
  hold only the secret's name. Never log or echo it.
- Check the `@since` tag of any newly used API against `minAppVersion`.
- GitHub Contents API: the GET for the current `sha` must bypass HTTP caches
  (`Cache-Control: no-cache` plus a cache-busting query), otherwise a stale sha gives a 409.
- Name the feed `*.atom`: Pages serves it as `application/atom+xml`, `.xml` as `application/xml`.
- README needs a network-use disclosure (GitHub API, Publish API via the instance).

## Open decisions

- One entry per note (current) vs. per change. Per-change needs a persisted snapshot of
  `apiList()` and gives crossposting tools new IDs.
- Full content instead of summary: needs link and image rewriting to Publish URLs.
- Noise filtering (renames, opt-in per change).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), enforced by
commitlint in a husky hook and in CI. A single short subject line: no body, no trailers,
no attribution, unless explicitly asked. Default branch is `main`.

Run `npm run lint`, `build` and `test` before committing.
Add user-visible changes to `CHANGELOG.md` under `[Unreleased]` ([Keep a Changelog](https://keepachangelog.com/en/1.0.0/)).

Release: `npm version x.y.z`, then `git push --follow-tags`. It bumps `manifest.json`, `versions.json`
and the changelog (`[Unreleased]` becomes the version) and tags. The tag workflow drafts a GitHub release
with that changelog section as notes and fails if the section is missing.

## Testing

- Unit tests use `tests/mock-publish.ts` (the instance shape above) and a mocked `requestUrl`.
- Manual: `~/Local/Obsidian/TESTVAULT` has this repo symlinked as the plugin plus Hot Reload.
  Run `npm run dev`, paste `dev/fake-publish.js` in the console before the plugin loads
  (or toggle the plugin after), then `await fakePublish.apiUploadFile(app.vault.getFileByPath("Note.md"))`.
  Re-pasting the snippet empties the fake.
- Throwaway target: `finn-matti/publish-feed-test`, feed at
  `https://finn-matti.github.io/publish-feed-test/feed.atom`.
- CI `npm ci` fails with "Missing: ... from lock file" if the lockfile lacks other platforms'
  optional packages: delete `node_modules` and `package-lock.json`, `npm install`. Keep the
  root `esbuild` equal to vitest's vite dependency.

Needs a real Publish subscription (7-day refund deletes the site):
1. Are `apiList()` `mtime`/`ctime` server-side publish times, in milliseconds?
2. Does the hook fire for the dialog, the single-file command and the file menu?
3. Does local `getHash()` match the live hash after publishing?
4. Do `getCurrentSlug()` and `apiCustomUrl()` behave as above, and are entry URLs right with a custom domain?
5. Do page URLs for paths with spaces, folders and special characters open the live pages?
6. End to end: publish, feed, GitHub Pages, feed reader and an Atom validator.
