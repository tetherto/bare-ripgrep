use std::path::{Path, MAIN_SEPARATOR};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use ignore::{DirEntry, WalkBuilder};

use crate::glob::Glob;
use crate::request::Request;

// Skipped even with includeIgnored.
const SKIP_DIRS: [&str; 3] = [".git", "node_modules", ".trash"];
// includeIgnored lifts these.
const HIDDEN_DIRS: [&str; 5] = [".hg", ".svn", ".venv", ".cache", ".next"];

pub struct Scope {
    pub root: String,
    folder: Vec<String>,
    include_ignored: bool,
    deny: Vec<String>,
    include: Vec<Glob>,
    max_entries: u64,
    entries: AtomicU64,
    pub truncated: AtomicBool,
    pub cancel: Arc<AtomicBool>,
}

impl Scope {
    pub fn new(req: &Request, cancel: Arc<AtomicBool>) -> Result<Scope, String> {
        let mut folder = Vec::new();
        for part in req.folder.split(['/', '\\']) {
            match part {
                "" | "." => {}
                ".." => return Err(format!("folder escapes root: {}", req.folder)),
                part => folder.push(part.to_string()),
            }
        }

        let mut dir = Path::new(&req.root).to_path_buf();
        dir.extend(&folder);
        if !dir.is_dir() {
            return Err(format!("not a directory: {}", dir.display()));
        }

        let include = req
            .include
            .iter()
            .map(|pattern| Glob::new(pattern))
            .collect::<Result<_, _>>()?;

        Ok(Scope {
            root: req.root.clone(),
            folder,
            include_ignored: req.include_ignored,
            deny: req.deny.iter().map(|path| path.to_lowercase()).collect(),
            include,
            max_entries: req.max_entries,
            entries: AtomicU64::new(0),
            truncated: AtomicBool::new(false),
            cancel,
        })
    }

    pub fn walker(self: &Arc<Scope>, threads: usize) -> WalkBuilder {
        let scope = Arc::clone(self);
        let mut builder = WalkBuilder::new(&self.root);
        builder
            .standard_filters(false)
            .git_ignore(!self.include_ignored)
            .ignore(!self.include_ignored)
            .require_git(false)
            .follow_links(false)
            .threads(threads)
            .filter_entry(move |entry| scope.admits(entry));
        builder
    }

    fn admits(&self, entry: &DirEntry) -> bool {
        let depth = entry.depth();
        if depth == 0 {
            return true;
        }

        let name = entry.file_name().to_string_lossy();
        if SKIP_DIRS.contains(&name.as_ref()) {
            return false;
        }

        let is_dir = entry.file_type().is_some_and(|kind| kind.is_dir());
        if is_dir && !self.include_ignored && HIDDEN_DIRS.contains(&name.as_ref()) {
            return false;
        }

        // Walking from the root keeps the ignore files between it and the folder in force.
        if depth <= self.folder.len() && name != self.folder[depth - 1] {
            return false;
        }

        !self.is_denied(entry.path())
    }

    fn is_denied(&self, path: &Path) -> bool {
        if self.deny.is_empty() {
            return false;
        }

        let path = path.to_string_lossy().to_lowercase();
        self.deny.iter().any(|root| {
            path == *root
                || path
                    .strip_prefix(root.as_str())
                    .is_some_and(|rest| rest.starts_with(MAIN_SEPARATOR))
        })
    }

    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    /// Counts what the walk keeps, below the folder. False once over the cap.
    pub fn keep(&self, entry: &DirEntry) -> bool {
        if entry.depth() <= self.folder.len() {
            return true;
        }

        let kept = self.entries.fetch_add(1, Ordering::Relaxed) + 1;
        if kept > self.max_entries {
            self.truncated.store(true, Ordering::Relaxed);
            return false;
        }

        true
    }

    pub fn relative(&self, entry: &DirEntry) -> String {
        let path = entry
            .path()
            .strip_prefix(&self.root)
            .unwrap_or(entry.path());
        let path = path.to_string_lossy();
        if MAIN_SEPARATOR == '/' {
            path.into_owned()
        } else {
            path.replace(MAIN_SEPARATOR, "/")
        }
    }

    pub fn included(&self, entry: &DirEntry, path: &str) -> bool {
        if self.include.is_empty() {
            return true;
        }

        let name = entry.file_name().to_string_lossy();
        self.include.iter().any(|glob| glob.matches(&name, path))
    }
}

pub fn threads() -> usize {
    std::thread::available_parallelism()
        .map_or(4, |n| n.get())
        .min(12)
}
