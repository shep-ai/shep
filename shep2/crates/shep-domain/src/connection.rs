//! Sources a person connects, so work handed over there reaches Shep. Only what is safe to keep
//! in plain settings lives here; tokens stay in the OS keychain.

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::SourceKind;

impl SourceKind {
    /// The sources a person can connect (Shep itself is always there).
    pub const CONNECTABLE: [SourceKind; 6] = [
        Self::GitHub,
        Self::Linear,
        Self::Jira,
        Self::Notion,
        Self::Monday,
        Self::Slack,
    ];

    /// The name used on the command line and in config.
    pub fn cli_name(self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::Linear => "linear",
            Self::Jira => "jira",
            Self::Notion => "notion",
            Self::Monday => "monday",
            Self::Slack => "slack",
            Self::Shep => "shep",
        }
    }

    /// The name people know it by.
    pub fn display_name(self) -> &'static str {
        match self {
            Self::GitHub => "GitHub",
            Self::Linear => "Linear",
            Self::Jira => "Jira",
            Self::Notion => "Notion",
            Self::Monday => "Monday",
            Self::Slack => "Slack",
            Self::Shep => "Shep",
        }
    }

    /// A connectable source by its command-line name, in any case.
    pub fn parse(s: &str) -> Result<Self, String> {
        let wanted = s.trim().to_ascii_lowercase();
        Self::CONNECTABLE
            .into_iter()
            .find(|k| k.cli_name() == wanted)
            .ok_or_else(|| {
                let names: Vec<&str> = Self::CONNECTABLE.iter().map(|k| k.cli_name()).collect();
                format!("unknown source {s:?}; use one of {}", names.join(", "))
            })
    }
}

/// A connected source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SourceSetting {
    pub kind: SourceKind,
    /// What it is connected as, for people to read, like "Acme · team ENG".
    #[serde(default)]
    pub account: String,
    /// What the adapter needs that is not secret, like a Jira site or a Notion database.
    #[serde(default)]
    pub options: BTreeMap<String, String>,
}

impl SourceSetting {
    pub fn new(kind: SourceKind, account: &str) -> Self {
        Self {
            kind,
            account: account.to_owned(),
            options: BTreeMap::new(),
        }
    }

    #[must_use]
    pub fn with_option(mut self, key: &str, value: &str) -> Self {
        self.options.insert(key.to_owned(), value.to_owned());
        self
    }

    pub fn option(&self, key: &str) -> Option<&str> {
        self.options.get(key).map(String::as_str)
    }
}
