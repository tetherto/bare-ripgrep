use regex::Regex;

/// Mirrors qvac-harness `compileGlob`: `*` and `?` stay inside a segment, `**/` spans
/// directories, anything else is literal. A pattern with `/` tests the path, else the name.
pub struct Glob {
    regex: Regex,
    on_path: bool,
}

impl Glob {
    pub fn new(pattern: &str) -> Result<Glob, String> {
        let pattern = pattern.strip_prefix("./").unwrap_or(pattern);
        let chars: Vec<char> = pattern.chars().collect();
        let mut source = String::from("(?s)^");
        let mut i = 0;
        while i < chars.len() {
            let rest = &chars[i..];
            if rest.starts_with(&['*', '*', '/']) {
                source.push_str("(?:.*/)?");
                i += 3;
            } else if rest.starts_with(&['*', '*']) {
                source.push_str(".*");
                i += 2;
            } else if rest[0] == '*' {
                source.push_str("[^/]*");
                i += 1;
            } else if rest[0] == '?' {
                source.push_str("[^/]");
                i += 1;
            } else {
                source.push_str(&regex::escape(&rest[0].to_string()));
                i += 1;
            }
        }
        source.push('$');

        let regex = Regex::new(&source).map_err(|err| format!("invalid include glob: {err}"))?;
        Ok(Glob {
            regex,
            on_path: pattern.contains('/'),
        })
    }

    pub fn matches(&self, name: &str, path: &str) -> bool {
        self.regex.is_match(if self.on_path { path } else { name })
    }
}
