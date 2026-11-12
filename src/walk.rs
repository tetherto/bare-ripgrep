use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use ignore::WalkState;
use serde::Serialize;

use crate::scope::{threads, Scope};

#[derive(Serialize)]
pub struct File {
    path: String,
    mtime: i64,
}

#[derive(Serialize)]
pub struct Walked {
    files: Vec<File>,
    truncated: bool,
}

pub fn walk(scope: Arc<Scope>) -> Walked {
    let files = Mutex::new(Vec::new());

    scope.walker(threads()).build_parallel().run(|| {
        let scope = &scope;
        let files = &files;
        Box::new(move |result| {
            let Ok(entry) = result else {
                return WalkState::Continue;
            };
            if scope.cancelled() || !scope.keep(&entry) {
                return WalkState::Quit;
            }
            if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                return WalkState::Continue;
            }

            let path = scope.relative(&entry);
            if !scope.included(&entry, &path) {
                return WalkState::Continue;
            }

            let mtime = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |since| since.as_millis() as i64);
            files.lock().unwrap().push(File { path, mtime });
            WalkState::Continue
        })
    });

    let mut files = files.into_inner().unwrap();
    files.sort_unstable_by(|a, b| a.path.cmp(&b.path));
    Walked {
        files,
        truncated: scope.truncated.load(Ordering::Relaxed),
    }
}
