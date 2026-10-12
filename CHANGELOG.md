# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Atom feed of recent changes for an Obsidian Publish site: one entry per published note,
  newest first, with dates, stable ids and a summary from the `description` property or
  the first paragraph. Text is only taken from what is published (the local note if it
  matches, otherwise the live copy from Publish), so unpublished edits never reach the feed.
- Full text in the feed as HTML, with a "Full text / Summary only" setting. Wikilinks, images,
  highlights, callouts and tags are converted; comments and frontmatter are removed; links and
  images only point at published files.
- Automatic update a few seconds after a publish run, by observing the core Publish plugin.
- "Rebuild feed" command, which also picks up changes published from elsewhere.
- Push to a GitHub repository served by GitHub Pages as `feed.atom`; no commit when the
  feed is unchanged.
- Settings for feed title, author, GitHub owner, repository, branch and feed path.
- GitHub token stored in Obsidian's secret storage (requires Obsidian 1.11.4).
