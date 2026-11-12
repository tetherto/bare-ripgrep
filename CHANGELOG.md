# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-11-12

### Added

- `search({ root, queries, ... })`: searches a local folder with ripgrep's crates, no `rg`
  subprocess, on Bare and Node, including iOS and Android. Resolves `{ hits, truncated, cut }`,
  sorted by path then line ([usage](README.md#searchoptions))

  ```js
  const { search } = require('bare-ripgrep')
  const { hits } = await search({ root: '/path/to/project', queries: ['todo'], include: '*.ts' })
  ```

- `walk({ root, folder, ... })`: lists files under a folder with their `mtime`, honouring
  `.gitignore` and `.ignore` ([usage](README.md#walkoptions))
- Scope options shared by both: `include` globs, `deny` paths, `includeIgnored`, `maxEntries`
  and `signal`, which rejects with an `AbortError` and stops the native work
- Prebuilds for `darwin-arm64`, `darwin-x64`, `linux-arm64` and `linux-x64`. Differences from
  the qvac-harness `grep` tool are listed in the
  [README](README.md#differences-from-the-harness-engine)

[Unreleased]: https://github.com/tetherto/bare-ripgrep/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/tetherto/bare-ripgrep/releases/tag/v0.0.1
