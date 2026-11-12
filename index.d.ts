export interface Hit {
  /** Relative to `root`, `/`-separated. */
  path: string
  /** 1-based. */
  line: number
  /** The line without its newline, at most 500 UTF-16 units. */
  text: string
}

export interface WalkedFile {
  /** Relative to `root`, `/`-separated. */
  path: string
  /** Milliseconds since the epoch. */
  mtime: number
}

interface Scope {
  /** Absolute directory every returned path is relative to. */
  root: string
  /** Subfolder of `root` to search, `''` for all of it. */
  folder?: string
  /**
   * Glob a file must match: a bare name matches the basename at any depth, a pattern with
   * `/` matches the path relative to `root`. Several globs are alternatives.
   */
  include?: string | string[]
  /** Absolute paths whose files and folders are skipped (case-insensitive). */
  deny?: string[]
  /** Also walk what ignore files and the hidden tool folders leave out. */
  includeIgnored?: boolean
  /** Most entries (files and folders) the walk keeps, default 10000. */
  maxEntries?: number
  signal?: AbortSignal
}

export interface SearchOptions extends Scope {
  /** Each query is an alternative. */
  queries: string[]
  /** Queries are regular expressions rather than literals. */
  regex?: boolean
  caseSensitive?: boolean
  /** Most hits returned, default 1000. */
  maxMatches?: number
}

export interface SearchResult {
  /** Sorted by path, then line. */
  hits: Hit[]
  /** More hits or entries than the caps allowed. */
  truncated: boolean
  /** A line past 1 MiB was searched in its head only. */
  cut: boolean
}

export interface WalkOptions extends Scope {}

export interface WalkResult {
  /** Sorted by path. */
  files: WalkedFile[]
  truncated: boolean
}

export class AbortError extends Error {
  name: 'AbortError'
  code: 'ABORT_ERR'
}

export function search(options: SearchOptions): Promise<SearchResult>

export function walk(options: WalkOptions): Promise<WalkResult>
