//! The files in a task's folder.

use std::path::{Path, PathBuf};

use shep_domain::UnixTime;

pub struct TaskPaths {
    pub dir: PathBuf,
}

impl TaskPaths {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }
    /// The issue text, saved when the task is prepared.
    pub fn issue(&self) -> PathBuf {
        self.dir.join("issue.md")
    }
    pub fn question(&self) -> PathBuf {
        self.dir.join("question.md")
    }
    pub fn proof_dir(&self) -> PathBuf {
        self.dir.join("proof")
    }
    /// The reviewer works here, apart from the coder's worktree and conversation.
    pub fn review_dir(&self) -> PathBuf {
        self.dir.join("review")
    }
    pub fn review(&self) -> PathBuf {
        self.review_dir().join("review.md")
    }
    pub fn diff(&self) -> PathBuf {
        self.review_dir().join("diff.patch")
    }
    pub fn ci_log(&self, attempt: u8) -> PathBuf {
        self.dir.join(format!("ci-{attempt}.log"))
    }
    pub fn agent_log(&self, at: UnixTime) -> PathBuf {
        self.dir.join(format!("agent-{}.log", at.0))
    }
}

/// Files whose names end in one of `extensions`.
pub fn with_extension<'a>(
    files: &'a [PathBuf],
    extensions: &'a [&str],
) -> impl Iterator<Item = &'a PathBuf> {
    files.iter().filter(move |p| {
        p.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| extensions.contains(&e.to_ascii_lowercase().as_str()))
    })
}

pub fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}
