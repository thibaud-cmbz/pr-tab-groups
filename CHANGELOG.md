# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Open authored pull requests ("My PRs (n)") and pull requests awaiting review
  ("To review (n)") in collapsed, colored tab groups at browser startup.
- Optional fixed page, opened (and pinned) at startup when not already open.
- Unloaded (discarded) tabs, so pages only load when opened.
- Session-restore-safe identification of managed tabs. Refreshes reuse tabs
  still listed and close the stale ones.
- Toolbar button for manual refresh, with loading and error badges.
- Options page: token, organization, review filter, fixed page, pinning,
  startup delay and periodic refresh.
- English and French translations.

[Unreleased]: https://github.com/OWNER/pr-tab-groups/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/OWNER/pr-tab-groups/releases/tag/v1.0.0
