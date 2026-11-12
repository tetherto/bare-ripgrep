use std::collections::BinaryHeap;
use std::fs::File;
use std::io::{self, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use grep_matcher::{LineTerminator, Matcher};
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkMatch};
use ignore::WalkState;
use serde::Serialize;

use crate::request::Request;
use crate::scope::{threads, Scope};

const MAX_LINE_CHARS: usize = 500;
// head only: a NUL further in is text, as in the harness
const BINARY_PROBE_BYTES: usize = 1024;
// a longer line is searched in its head only
const MAX_LINE_BYTES: usize = 1024 * 1024;
const HEAP_LIMIT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct Hit {
    path: String,
    line: u64,
    text: String,
}

#[derive(Serialize)]
pub struct Searched {
    hits: Vec<Hit>,
    truncated: bool,
    cut: bool,
}

/// The `max_matches` smallest hits by (path, line), whatever order the files finish in.
struct Best {
    max: usize,
    hits: BinaryHeap<Hit>,
    over: bool,
}

impl Best {
    fn add(&mut self, hits: Vec<Hit>) {
        for hit in hits {
            self.hits.push(hit);
            if self.hits.len() > self.max {
                self.hits.pop();
                self.over = true;
            }
        }
    }

    /// A file sorting past a full set can add nothing.
    fn beyond(&self, path: &str) -> bool {
        self.over
            && self
                .hits
                .peek()
                .is_some_and(|last| path > last.path.as_str())
    }
}

pub fn matcher(req: &Request) -> Result<RegexMatcher, String> {
    if req.queries.is_empty() {
        return Err("queries is empty".into());
    }

    RegexMatcherBuilder::new()
        .case_insensitive(!req.case_sensitive)
        .fixed_strings(!req.regex)
        .line_terminator(Some(b'\n'))
        .build_many(&req.queries)
        .map_err(|err| format!("invalid regex: {err}"))
}

pub fn search(scope: Arc<Scope>, matcher: RegexMatcher, max_matches: usize) -> Searched {
    let best = Mutex::new(Best {
        max: max_matches,
        hits: BinaryHeap::new(),
        over: false,
    });
    let cut = AtomicBool::new(false);

    scope.walker(threads()).build_parallel().run(|| {
        let scope = &scope;
        let best = &best;
        let cut = &cut;
        let matcher = matcher.clone();
        let mut searcher = SearcherBuilder::new()
            .line_number(true)
            .line_terminator(LineTerminator::byte(b'\n'))
            .binary_detection(BinaryDetection::none())
            .heap_limit(Some(HEAP_LIMIT_BYTES))
            .build();

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
            if !scope.included(&entry, &path) || best.lock().unwrap().beyond(&path) {
                return WalkState::Continue;
            }

            let mut sink = Collect {
                matcher: &matcher,
                path: &path,
                // one past the cap, so a file alone can show there is more
                room: max_matches + 1,
                hits: Vec::new(),
                cut: false,
            };
            scan(entry.path(), &matcher, &mut searcher, &mut sink);
            if sink.cut {
                cut.store(true, Ordering::Relaxed);
            }
            if !sink.hits.is_empty() {
                best.lock().unwrap().add(sink.hits);
            }

            WalkState::Continue
        })
    });

    let best = best.into_inner().unwrap();
    Searched {
        hits: best.hits.into_sorted_vec(),
        truncated: best.over || scope.truncated.load(Ordering::Relaxed),
        cut: cut.load(Ordering::Relaxed),
    }
}

fn scan(
    path: &std::path::Path,
    matcher: &RegexMatcher,
    searcher: &mut Searcher,
    sink: &mut Collect,
) {
    let Ok(mut file) = File::open(path) else {
        return;
    };

    let mut probe = [0u8; BINARY_PROBE_BYTES];
    let mut filled = 0;
    while filled < probe.len() {
        match file.read(&mut probe[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => return,
        }
    }
    if probe[..filled].contains(&0) {
        return;
    }

    // what arrived before a read error still counts, and the file is flagged cut
    if searcher
        .search_reader(matcher, (&probe[..filled]).chain(file), &mut *sink)
        .is_err()
    {
        sink.cut = true;
    }
}

struct Collect<'a> {
    matcher: &'a RegexMatcher,
    path: &'a str,
    room: usize,
    hits: Vec<Hit>,
    cut: bool,
}

impl Sink for Collect<'_> {
    type Error = io::Error;

    fn matched(&mut self, _: &Searcher, found: &SinkMatch<'_>) -> Result<bool, io::Error> {
        let mut line = found.bytes();
        if line.ends_with(b"\n") {
            line = &line[..line.len() - 1];
        }

        if line.len() > MAX_LINE_BYTES {
            self.cut = true;
            line = &line[..MAX_LINE_BYTES];
            if !self.matcher.is_match(line).unwrap_or(false) {
                return Ok(true);
            }
        }

        self.hits.push(Hit {
            path: self.path.to_string(),
            line: found.line_number().unwrap_or(0),
            text: clip(line),
        });
        Ok(self.hits.len() < self.room)
    }
}

/// The first MAX_LINE_CHARS UTF-16 units, like `text.slice(0, 500)`.
/// A surrogate pair split by the cut is dropped whole.
fn clip(line: &[u8]) -> String {
    // 500 units take at most 1500 bytes, so a cut inside a character lands past them
    let head = String::from_utf8_lossy(&line[..line.len().min(2048)]);
    let mut units = 0;
    let mut text = String::new();
    for ch in head.chars() {
        units += ch.len_utf16();
        if units > MAX_LINE_CHARS {
            break;
        }
        text.push(ch);
    }
    text
}
