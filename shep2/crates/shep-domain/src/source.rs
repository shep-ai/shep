use std::fmt;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Where a task came from. Shep answers in the same place.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum SourceKind {
    GitHub,
    Linear,
    Jira,
    Notion,
    Monday,
    Slack,
    /// Typed straight into Shep (CLI, Mac app, MCP).
    Shep,
}

/// A reference to the task in its source, or the sentence the user typed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum TaskSourceRef {
    /// `repo` is `owner/name`; `None` means the repository Shep is pointed at.
    GitHubIssue {
        repo: Option<String>,
        number: u64,
    },
    Linear {
        key: String,
    },
    Jira {
        key: String,
    },
    Notion {
        url: String,
    },
    Monday {
        url: String,
    },
    Slack {
        url: String,
    },
    Sentence {
        text: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SourceRefError {
    #[error("a task needs a reference or a sentence")]
    Empty,
}

const GITHUB_HOST: &str = "github.com";
const LINEAR_HOST: &str = "linear.app";
const JIRA_HOST_SUFFIX: &str = ".atlassian.net";
const NOTION_HOSTS: [&str; 2] = ["notion.so", "www.notion.so"];
const MONDAY_HOST_SUFFIX: &str = ".monday.com";
const SLACK_HOST_SUFFIX: &str = ".slack.com";

impl TaskSourceRef {
    /// Reads what a user typed or pasted: an issue reference, a link to a ticket or message, or
    /// a plain sentence.
    pub fn parse(input: &str) -> Result<Self, SourceRefError> {
        let text = input.trim();
        if text.is_empty() {
            return Err(SourceRefError::Empty);
        }
        Ok(parse_github_short(text)
            .or_else(|| parse_url(text))
            .unwrap_or_else(|| Self::Sentence {
                text: text.to_owned(),
            }))
    }

    pub fn kind(&self) -> SourceKind {
        match self {
            Self::GitHubIssue { .. } => SourceKind::GitHub,
            Self::Linear { .. } => SourceKind::Linear,
            Self::Jira { .. } => SourceKind::Jira,
            Self::Notion { .. } => SourceKind::Notion,
            Self::Monday { .. } => SourceKind::Monday,
            Self::Slack { .. } => SourceKind::Slack,
            Self::Sentence { .. } => SourceKind::Shep,
        }
    }
}

impl fmt::Display for TaskSourceRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GitHubIssue { repo: None, number } => write!(f, "#{number}"),
            Self::GitHubIssue {
                repo: Some(repo),
                number,
            } => write!(f, "{repo}#{number}"),
            Self::Linear { key } | Self::Jira { key } => f.write_str(key),
            Self::Notion { url } | Self::Monday { url } | Self::Slack { url } => f.write_str(url),
            Self::Sentence { text } => f.write_str(text),
        }
    }
}

/// `#412` or `owner/repo#412`.
fn parse_github_short(text: &str) -> Option<TaskSourceRef> {
    let (repo, number) = text.split_once('#')?;
    let number = number.parse().ok()?;
    let repo = match repo {
        "" => None,
        r if is_owner_repo(r) => Some(r.to_owned()),
        _ => return None,
    };
    Some(TaskSourceRef::GitHubIssue { repo, number })
}

fn is_owner_repo(s: &str) -> bool {
    let valid = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    };
    matches!(s.split_once('/'), Some((owner, name)) if valid(owner) && valid(name))
}

fn parse_url(text: &str) -> Option<TaskSourceRef> {
    let rest = text
        .strip_prefix("https://")
        .or_else(|| text.strip_prefix("http://"))?;
    if text.contains(char::is_whitespace) {
        return None;
    }
    let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let url = || text.to_owned();
    match host {
        GITHUB_HOST => match segments.as_slice() {
            [owner, name, "issues", number, ..] => Some(TaskSourceRef::GitHubIssue {
                repo: Some(format!("{owner}/{name}")),
                number: number.parse().ok()?,
            }),
            _ => None,
        },
        LINEAR_HOST => match segments.as_slice() {
            [_, "issue", key, ..] => Some(TaskSourceRef::Linear {
                key: (*key).to_owned(),
            }),
            _ => None,
        },
        h if h.ends_with(JIRA_HOST_SUFFIX) => match segments.as_slice() {
            ["browse", key, ..] => Some(TaskSourceRef::Jira {
                key: (*key).to_owned(),
            }),
            _ => None,
        },
        h if NOTION_HOSTS.contains(&h) => Some(TaskSourceRef::Notion { url: url() }),
        h if h.ends_with(MONDAY_HOST_SUFFIX) => Some(TaskSourceRef::Monday { url: url() }),
        h if h.ends_with(SLACK_HOST_SUFFIX) => Some(TaskSourceRef::Slack { url: url() }),
        _ => None,
    }
}
