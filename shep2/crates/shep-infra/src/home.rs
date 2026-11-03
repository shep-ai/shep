//! Where Shep 2 keeps its files. `SHEP_HOME` (default `~/.shep`) is shared with Shep 1, so
//! everything except the database lives under `shep2/`, apart from Shep 1's own files.

use std::path::{Path, PathBuf};

pub const SHEP_HOME_ENV: &str = "SHEP_HOME";
const DEFAULT_HOME_DIR: &str = ".shep";
const DATABASE_FILE: &str = "shep2.db";
const OWN_DIR: &str = "shep2";
const RUN_DIR: &str = "run";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShepHome {
    root: PathBuf,
}

impl ShepHome {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// `$SHEP_HOME`, or `~/.shep`.
    pub fn from_env() -> Self {
        Self::new(std::env::var_os(SHEP_HOME_ENV).map_or_else(
            || PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(DEFAULT_HOME_DIR),
            PathBuf::from,
        ))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn database(&self) -> PathBuf {
        self.root.join(DATABASE_FILE)
    }

    /// Shep 2's own directory.
    pub fn dir(&self) -> PathBuf {
        self.root.join(OWN_DIR)
    }

    /// Holds the sockets; created `0700` so only this user can reach them.
    pub fn run_dir(&self) -> PathBuf {
        self.dir().join(RUN_DIR)
    }

    pub fn daemon_socket(&self) -> PathBuf {
        self.run_dir().join("daemon.sock")
    }

    pub fn daemon_pid(&self) -> PathBuf {
        self.dir().join("daemon.pid")
    }

    pub fn daemon_log(&self) -> PathBuf {
        self.dir().join("daemon.log")
    }

    pub fn holder_socket(&self) -> PathBuf {
        self.run_dir().join("holder.sock")
    }

    pub fn holder_pid(&self) -> PathBuf {
        self.dir().join("holder.pid")
    }

    pub fn holder_log(&self) -> PathBuf {
        self.dir().join("holder.log")
    }

    /// Per-task files: prompts, agent logs, questions, proof, reviews.
    pub fn tasks_dir(&self) -> PathBuf {
        self.dir().join("tasks")
    }

    /// One git worktree per task.
    pub fn worktrees_dir(&self) -> PathBuf {
        self.dir().join("worktrees")
    }
}
