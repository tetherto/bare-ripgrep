# bare-ripgrep

ripgrep's search and walk crates (`ignore`, `grep-searcher`, `grep-regex`) as a native addon for Bare and Node. It searches a local folder without an `rg` subprocess, so it also runs on iOS and Android.

The result is meant to match the `grep` tool of qvac-harness (`lib/tools/fs/search.ts`, `walk.ts`, `ignore.ts`, `glob.ts`) while being faster and not stopping at its 10k-entry JS walk cap.

## Install

```
npm i bare-ripgrep
```

## Usage

```js
const { search, walk } = require('bare-ripgrep')

const { hits, truncated, cut } = await search({
  root: '/path/to/project',
  queries: ['todo', 'fixme'],
  include: '*.ts'
})
// hits: [{ path: 'src/a.ts', line: 12, text: '// TODO: ...' }]

const { files } = await walk({ root: '/path/to/project', folder: 'src' })
// files: [{ path: 'src/a.ts', mtime: 1760000000000 }]
```

### `search(options)`

| Option           | Default | Meaning                                                                                   |
| ---------------- | ------- | ----------------------------------------------------------------------------------------- |
| `root`           |         | Absolute directory. Returned paths are relative to it, `/`-separated.                     |
| `folder`         | `''`    | Subfolder of `root` to search.                                                            |
| `queries`        |         | Each query is an alternative. Literal text unless `regex`.                                |
| `regex`          | `false` | Queries are regular expressions (Rust `regex` syntax).                                    |
| `caseSensitive`  | `false` |                                                                                           |
| `include`        |         | Glob or array of globs. A bare name matches the basename at any depth; with `/` the path. |
| `deny`           |         | Absolute paths whose files and folders are skipped, case-insensitively.                   |
| `includeIgnored` | `false` | Also walk what `.gitignore`, `.ignore` and the hidden tool folders leave out.             |
| `maxMatches`     | `1000`  | Most hits returned.                                                                       |
| `maxEntries`     | `10000` | Most entries (files and folders) the walk keeps.                                          |
| `signal`         |         | `AbortSignal`. Abort rejects with an `AbortError` and stops the native work.              |

Resolves `{ hits: { path, line, text }[], truncated, cut }`. Hits are sorted by path, then line. `truncated` is set when there were more hits than `maxMatches` or more entries than `maxEntries`. `cut` is set when a line past 1 MiB was searched in its head only.

### `walk(options)`

Same scope options (`root`, `folder`, `include`, `deny`, `includeIgnored`, `maxEntries`, `signal`). Resolves `{ files: { path, mtime }[], truncated }`, sorted by path; `mtime` is in milliseconds.

## Semantics

- Case-insensitive by default. Queries are literal unless `regex`.
- A file with a NUL in its first 1024 bytes is binary and skipped; a later NUL is text.
- `.gitignore` and `.ignore` are honoured with or without a git repository, `.ignore` wins. Ignore files between `root` and `folder` apply. `.git/info/exclude`, global ignore files and ignore files above `root` are not read. Dotfiles are searched.
- `.git`, `node_modules` and `.trash` are always skipped. `.hg`, `.svn`, `.venv`, `.cache` and `.next` are skipped unless `includeIgnored`.
- Symlinks are never followed, files or folders.
- Hit text is the line without its `\n` (a `\r` stays), cut to 500 UTF-16 units. A line past 1 MiB is searched in its head only.
- With `maxMatches`, the hits kept are the first by path then line, whatever the thread timing.

## Differences from the harness engine

- **Regex dialect.** Queries with `regex` use Rust's `regex` syntax, not JavaScript's: no look-around and no backreferences (they reject with `invalid regex`), `\w`, `\d` and `\b` are Unicode-aware, a pattern naming a newline is rejected, and `.` also matches `\r`. Literal queries are unaffected.
- **Case folding.** `caseSensitive: false` uses Unicode simple case folding, which can differ from JS `i` on a few characters.
- **Ignore engine.** Ignore rules are git's, through the `ignore` crate, not the harness's regex translation; edge cases of exotic patterns can differ. A `folder` that an ancestor's ignore file ignores yields nothing; the harness searches it.
- **Caps under parallelism.** The walk is parallel. When `maxEntries` cuts it short, which entries were kept can differ between runs. The `maxMatches` result is deterministic. Entries under a `deny` path are pruned, not counted.
- **Long lines.** A line past 1 MiB is searched in its head only and sets `cut` (the harness sets `cut` only for a cut drive read). A line past 16 MiB ends that file's scan, keeps its earlier hits and sets `cut`.
- **Text clipping.** A surrogate pair split by the 500-unit cut is dropped whole; JS would keep a lone surrogate.
- **Not provided.** `maxMs` and `skippedLinks`. A file that cannot be opened is skipped silently.

## Build

`bare-make generate && bare-make build && bare-make install` (`npm run build`) writes `prebuilds/<platform>-<arch>/bare-ripgrep.bare` and `bare-ripgrep.node`: one build, one C binding (`binding.c`, written against `js.h`), loaded by Bare directly and by Node through `bare-compat-napi`.

The Rust crate (`Cargo.toml`, `src/`) builds as a `staticlib` through `cmake-cargo`, which runs `cargo build --release --target <triple>` and imports the archive. It needs `cargo` and the rustup target of the platform being built. The C side only passes a JSON request to Rust and a JSON result back; the work runs on the libuv thread pool (`uv_queue_work`), and the walk fans out over its own threads. The Rust entry points never unwind into C.

| Target                                     | Rust triple                                             |
| ------------------------------------------ | ------------------------------------------------------- |
| `darwin-arm64`, `darwin-x64`               | `aarch64-apple-darwin`, `x86_64-apple-darwin`           |
| `linux-arm64`, `linux-x64`                 | `aarch64-unknown-linux-gnu`, `x86_64-unknown-linux-gnu` |
| `win32-arm64`, `win32-x64`                 | `aarch64-pc-windows-msvc`, `x86_64-pc-windows-msvc`     |
| `ios-arm64`                                | `aarch64-apple-ios`                                     |
| `ios-arm64-simulator`, `ios-x64-simulator` | `aarch64-apple-ios-sim`, `x86_64-apple-ios`             |
| `android-arm64`, `android-x64`             | `aarch64-linux-android`, `x86_64-linux-android`         |

## Test and bench

```
npm test          # brittle, on Node and on Bare
node bench/index.js <dir> [pattern...]   # search() against `rg -i -F` under the same ignore rules
```

## License

Apache-2.0
