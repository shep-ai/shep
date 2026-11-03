use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::TaskId;

/// Every branch Shep creates or pushes starts with this.
pub const TASK_BRANCH_PREFIX: &str = "shep/";
const MAX_BRANCH_LEN: usize = 48;
const FALLBACK_SLUG: &str = "task";

/// The git branch a task's work lives on: `shep/<id>-<slug of the title>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct TaskBranch(String);

impl TaskBranch {
    pub fn for_task(id: TaskId, title: &str) -> Self {
        let prefix = format!("{TASK_BRANCH_PREFIX}{id}-");
        let mut slug = String::new();
        for c in title.chars() {
            if c.is_ascii_alphanumeric() {
                slug.push(c.to_ascii_lowercase());
            } else if !slug.is_empty() && !slug.ends_with('-') {
                slug.push('-');
            }
        }
        slug.truncate(MAX_BRANCH_LEN.saturating_sub(prefix.len()));
        let slug = slug.trim_end_matches('-');
        let slug = if slug.chars().all(|c| c.is_ascii_digit()) {
            FALLBACK_SLUG
        } else {
            slug
        };
        Self(format!("{prefix}{slug}"))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for TaskBranch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PushRefused {
    #[error("Shep never pushes to the default branch ({0}); a person merges")]
    DefaultBranch(String),
    #[error("Shep only pushes its own task branches, not {0}")]
    NotATaskBranch(String),
}

/// The one rule every push goes through: only a task branch, never the default branch.
pub fn check_push(branch: &str, default_branch: &str) -> Result<(), PushRefused> {
    if branch == default_branch {
        return Err(PushRefused::DefaultBranch(branch.to_owned()));
    }
    match branch.strip_prefix(TASK_BRANCH_PREFIX) {
        Some(rest) if !rest.is_empty() => Ok(()),
        _ => Err(PushRefused::NotATaskBranch(branch.to_owned())),
    }
}
