use serde::Deserialize;

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Op {
    Search,
    Walk,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub op: Op,
    pub root: String,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub queries: Vec<String>,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
    #[serde(default)]
    pub include_ignored: bool,
    pub max_matches: u64,
    pub max_entries: u64,
}
