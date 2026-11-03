//! Where Shep 2 keeps its files. `SHEP_HOME` (default `~/.shep`) is shared with Shep 1, so
//! everything except the database lives under `shep2/`, apart from Shep 1's own files.

use std::path::{Path, PathBuf};

pub const SHEP_HOME_ENV: &str = "SHEP_HOME";
const DEFAULT_HOME_DIR: &str = ".shep";
const DATABASE_FILE: &str = "shep2.db";
const OWN_DIR: &str = "shep2";
const RUN_DIR: &str = "run";
/// The longest socket path that binds everywhere (macOS allows 103 bytes, Linux 107).
pub const MAX_SOCKET_PATH: usize = 100;
/// The longest socket file name used below the run directory.
const LONGEST_SOCKET_NAME: &str = "daemon.sock";
/// Where sockets go when the home is too deep for them: short on every Unix.
const SHORT_RUN_ROOT: &str = "/tmp";
const SHORT_RUN_PREFIX: &str = "shep2-";
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0100_0000_01b3;

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

    /// Holds the sockets; created `0700` so only this user can reach them. A home too deep for
    /// a socket path gets `/tmp/shep2-<hash of the home>` instead, the same one every time.
    pub fn run_dir(&self) -> PathBuf {
        let near = self.dir().join(RUN_DIR);
        if near.join(LONGEST_SOCKET_NAME).as_os_str().len() <= MAX_SOCKET_PATH {
            return near;
        }
        let hash = fnv1a(self.root.as_os_str().as_encoded_bytes());
        Path::new(SHORT_RUN_ROOT).join(format!("{SHORT_RUN_PREFIX}{hash:016x}"))
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

/// FNV-1a: a hash that stays the same across builds and Rust versions, so a newer `shep` still
/// finds an older daemon's socket.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(FNV_OFFSET, |hash, &b| {
        (hash ^ u64::from(b)).wrapping_mul(FNV_PRIME)
    })
}
