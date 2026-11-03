//! Real git repositories in a temp dir: a bare `origin` and the person's own checkout.

#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

pub struct Repos {
    pub dir: tempfile::TempDir,
}

pub fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().to_owned()
}

impl Repos {
    /// `origin` (bare, default branch `main`, one commit) and `checkout`, a clone of it.
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let repos = Self { dir };
        let seed = repos.path("seed");
        std::fs::create_dir_all(&seed).unwrap();
        git(&seed, &["init", "-q", "-b", "main"]);
        identify(&seed);
        std::fs::write(seed.join("app.txt"), "hello\n").unwrap();
        git(&seed, &["add", "."]);
        git(&seed, &["commit", "-q", "-m", "first"]);
        let root = repos.dir.path();
        git(root, &["clone", "-q", "--bare", "seed", "origin.git"]);
        git(root, &["clone", "-q", "origin.git", "checkout"]);
        identify(&repos.checkout());
        repos
    }

    pub fn path(&self, name: &str) -> PathBuf {
        self.dir.path().join(name)
    }
    pub fn origin(&self) -> PathBuf {
        self.path("origin.git")
    }
    pub fn checkout(&self) -> PathBuf {
        self.path("checkout")
    }
    pub fn worktrees(&self) -> PathBuf {
        self.path("worktrees")
    }

    /// The person is mid-work: another branch, an unpushed commit, uncommitted edits.
    pub fn busy_checkout(&self) {
        let c = self.checkout();
        git(&c, &["checkout", "-q", "-b", "my-feature"]);
        std::fs::write(c.join("mine.txt"), "committed locally\n").unwrap();
        git(&c, &["add", "."]);
        git(&c, &["commit", "-q", "-m", "mine"]);
        std::fs::write(c.join("app.txt"), "half-done edit\n").unwrap();
        std::fs::write(c.join("scratch.txt"), "untracked\n").unwrap();
    }

    /// Everything that says what state the person's checkout is in.
    pub fn checkout_state(&self) -> (String, String, String, String) {
        let c = self.checkout();
        (
            git(&c, &["rev-parse", "--abbrev-ref", "HEAD"]),
            git(&c, &["rev-parse", "HEAD"]),
            git(&c, &["status", "--porcelain"]),
            std::fs::read_to_string(c.join("app.txt")).unwrap(),
        )
    }

    /// Branches on origin.
    pub fn origin_branches(&self) -> Vec<String> {
        git(
            &self.origin(),
            &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
        )
        .lines()
        .map(str::to_owned)
        .collect()
    }
}

fn identify(dir: &Path) {
    git(dir, &["config", "user.name", "Test Person"]);
    git(dir, &["config", "user.email", "test@example.com"]);
}
