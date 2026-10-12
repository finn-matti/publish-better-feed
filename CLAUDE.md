# Obsidian Publish Feed Plugin

Obsidian community plugin that generates an Atom feed of recent changes for an
Obsidian Publish site and hosts it on GitHub Pages.

## Why

Publish's built-in `/rss.xml` is generated server-side and only has `<title>` and
`<link>` per item (no dates, guid, or content; oldest first; moved files appear as
new). It can't be enhanced from the client. Publish rejects non-whitelisted file
types (xml/json), so the feed is hosted externally. Goal: a better `rss.xml`.
A Publish page is an empty HTML shell filled in by JavaScript, so a reader's article extraction gets
nothing (checked with NetNewsWire's Reader View). Full text in the feed is what makes notes readable there.

## Architecture

1. Hook the core Publish plugin to learn when files are published or removed. Only
   this instance is observed; the "Rebuild feed" command covers changes made elsewhere
   (`ob` CLI, other devices).
2. Debounce after the last upload or remove to detect the end of a publish run.
3. Build Atom from `apiList()` (what's live and when) plus the verified published text of each
   note: a summary and, by default, the full text as HTML (`render.ts`, unified + `@quartz-community/remark-obsidian`).
4. Push `feed.atom` to a GitHub repo served by GitHub Pages (Contents API).

Logic lives in `service.ts` (`FeedService`, dependencies injected) and the small modules it
uses. `main.ts` and `settings.ts` are Obsidian glue: keep logic out of them so it stays
testable without Obsidian.

## Publish internals (from the Obsidian 1.14.4 app bundle and a live site, undocumented)

`app.internalPlugins.getEnabledPluginById("publish")` returns the instance, or null if disabled.

| Member | Notes |
| --- | --- |
| `siteId`, `host` | null if no site configured. `host` is the API server, not the site URL |
| `getCurrentSlug()` | async; site slug, falls back to `siteId` |
| `apiCustomUrl()` | async; `{ id, url, redirect }`, `url` is `""` without a custom domain |
| `apiList()` | `{ owner, files: [{ path, hash, ctime, mtime, size }] }`; times are server-side publish times in ms, `ctime` = `mtime` on first publish |
| `apiUploadFile(file: TFile)` | every upload: dialog, file menu and "publish current file" (both call `uploadFile()`, which opens the dialog's upload section), CLI handlers |
| `apiRemoveFile(path)` | unpublish and delete |
| `apiDownloadFile(path)` | async; live file as `ArrayBuffer`, see Rules |
| `getHash(file)` | async; SHA-256 hex of the file's raw bytes, equals the `apiList()` hash after publishing |
| `getPublishFlag(file)`, `includes`, `excludes` | publish rules |
| `scanForChanges()` | same diff the Publish dialog shows |

Publish emits no events: wrap `apiUploadFile` and `apiRemoveFile` with `monkey-around`.

URLs as Publish builds them: site = `https://publish.obsidian.md/<slug>` (or the custom
domain, no slug); page = site + `/` + path without `.md`, each segment
`encodeURIComponent` with `%20` replaced by `+`. The live site replaces the path with the target's
frontmatter `permalink` (from `cache/<uid>`); the dialog's "open in live site" ignores it. We don't handle
`permalink` yet. Wikilinks resolve as in the app (`getLinkpathDest`) over the published file set.

The live site is client-rendered by `app.js`, the same renderer as the Obsidian app. Its HTML shell sets
`window.siteInfo = {uid, host, status, slug, redirect, customurl}` and preloads three things from
`https://<host>/` (`host` is the API host): `cache/<uid>` (public JSON, the published metadata cache per
file: `links`, `embeds`, `tags`, `headings`, `frontmatter`, `footnotes`, `listItems`), `options/<uid>`, and
the raw note at `access/<uid>/<path>.md`. Notes and assets are served from `access/` (each path segment
`encodeURIComponent`, CORS open, `max-age=30`); a missing path returns 200 with a "## Not Found" body and the
real status in the `obs-status` header. How the live site renders a note, which `render.ts` follows: published
wikilinks are links (alias as text, `Note > Heading` for heading links); unpublished or missing ones are
still links with the written text; note embeds are inlined, embeds of unpublished notes render nothing;
image embeds and relative Markdown images become `<img>` of the asset (`|100` width, `|alt` alt);
`==x==` is `<mark>`; `%%comments%%` vanish (but not inside code); callouts are boxes; frontmatter is hidden.

To inspect internals: `npx @electron/asar extract /Applications/Obsidian.app/Contents/Resources/app.asar <dir>`,
then grep `app.js` (identifiers are minified, property and string names are not).

## Rules

- Observe only. Never call `apiUploadFile` with our own files.
- The hook wrapper is transparent: call the original first, return its exact result,
  never throw, notify only on success.
- Never read or handle the account token. All Publish calls go through the instance.
- Guard every internal access (existence and type checks). If the shape changes, disable
  the hook; "Rebuild feed" must keep working.
- Feed content must be published content: use text only if its SHA-256 (lowercase hex) equals the
  live hash from `apiList()`, read locally or via `apiDownloadFile(path)`. Otherwise use the file name
  and no summary. `apiDownloadFile` returns an `ArrayBuffer` and never throws; on a server error it
  returns the error body ("Something broke!"), so always verify.
- Rendering: only published files are linked or embedded. Unpublished wikilinks become plain text,
  embeds of unpublished files are dropped, raw HTML is dropped, and link or image URLs must be
  http(s), mailto or a published path. Comments and frontmatter never reach the output.
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
- Inline note embeds (Publish inlines them; we link to them).
- Noise filtering (renames, opt-in per change).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), enforced by
commitlint in a husky hook and in CI. A single short subject line: no body, no trailers,
no attribution, unless explicitly asked. Default branch is `main`.

Run `npm run lint`, `build` and `test` before committing (`npm run test:coverage` for coverage).
Add user-visible changes to `CHANGELOG.md` under `[Unreleased]` ([Keep a Changelog](https://keepachangelog.com/en/1.0.0/)).

Release: `npm version x.y.z`, then `git push --follow-tags`. It bumps `manifest.json`, `versions.json`
and the changelog (`[Unreleased]` becomes the version) and tags. The tag workflow drafts a GitHub release
with that changelog section as notes and fails if the section is missing.

## Testing

- Unit tests use `tests/mock-publish.ts` (the instance shape above) and a mocked `requestUrl`.
- Manual loop: throwaway vault with this repo symlinked as the plugin plus Hot Reload; `npm run dev`;
  paste `dev/fake-publish.js` in the console before the plugin loads (or toggle the plugin after),
  then `await fakePublish.apiUploadFile(app.vault.getFileByPath("Note.md"))`. Re-pasting the
  snippet empties the fake. `dev/inspect-publish.js` dumps a real site's instance state.
- Machine-specific paths and test targets belong in `CLAUDE.local.md` (gitignored), not here.
- CI `npm ci` fails with "Missing: ... from lock file" if the lockfile lacks other platforms'
  optional packages: delete `node_modules` and `package-lock.json`, `npm install`. Keep the
  root `esbuild` equal to vitest's vite dependency.

Still to check against a real site:
- Entry URLs with a custom domain.
