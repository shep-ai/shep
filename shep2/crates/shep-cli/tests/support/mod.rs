//! A sandbox for running the real `shep` binary: its own `SHEP_HOME`, a working directory that is
//! not a git repository, and a PATH holding only fake agents and `gh` plus the system tools.
//! Nothing a test runs can reach this repository or a real agent.

#![allow(dead_code)]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use assert_cmd::Command;

const SYSTEM_PATH: &str = "/usr/bin:/bin";
pub const WAIT: Duration = Duration::from_secs(60);

pub struct Home {
    pub dir: tempfile::TempDir,
}

impl Home {
    pub fn new() -> Self {
        let home = Self {
            dir: tempfile::tempdir().unwrap(),
        };
        for sub in ["shep-home", "bin", "work", "log"] {
            std::fs::create_dir_all(home.dir.path().join(sub)).unwrap();
        }
        home
    }

    pub fn shep_home(&self) -> PathBuf {
        self.dir.path().join("shep-home")
    }
    pub fn bin(&self) -> PathBuf {
        self.dir.path().join("bin")
    }
    /// Where fakes write what they were asked.
    pub fn log(&self) -> PathBuf {
        self.dir.path().join("log")
    }

    pub fn shep(&self) -> Command {
        self.shep_in(&self.dir.path().join("work"))
    }

    pub fn shep_in(&self, dir: &Path) -> Command {
        let mut c = Command::cargo_bin("shep").unwrap();
        c.current_dir(dir)
            .env("SHEP_HOME", self.shep_home())
            .env("PATH", format!("{}:{SYSTEM_PATH}", self.bin().display()))
            .env("NO_COLOR", "1")
            .env("FAKE_LOG", self.log())
            .env("SHEP_ENGINE_TICK_MS", "100")
            .env("SHEP_CI_POLL_SECS", "0")
            .env("SHEP_CI_GRACE_SECS", "0")
            .env("GIT_AUTHOR_NAME", "Test Person")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test Person")
            .env("GIT_COMMITTER_EMAIL", "test@example.com");
        c
    }

    pub fn file(&self, name: &str) -> PathBuf {
        self.shep_home().join("shep2").join(name)
    }

    pub fn pid(&self, name: &str) -> Option<String> {
        std::fs::read_to_string(self.file(name))
            .ok()
            .map(|p| p.trim().to_owned())
    }

    pub fn daemon_pid(&self) -> Option<String> {
        self.pid("daemon.pid")
    }

    pub fn install(&self, name: &str, script: &str) {
        let path = self.bin().join(name);
        std::fs::write(&path, script).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// The calls a fake logged, one per line (newlines inside a call become spaces).
    pub fn calls(&self, fake: &str) -> Vec<String> {
        std::fs::read_to_string(self.log().join(format!("{fake}.calls")))
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    }

    pub fn board(&self) -> String {
        let out = self.shep().output().unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    /// Waits for the board to show `text`; on timeout, fails with the board and both logs.
    pub fn wait_for_board(&self, text: &str) -> String {
        self.wait_for(&format!("board showing {text:?}"), || {
            let board = self.board();
            board.contains(text).then_some(board)
        })
    }

    pub fn wait_for<T>(&self, what: &str, mut ready: impl FnMut() -> Option<T>) -> T {
        let deadline = Instant::now() + WAIT;
        loop {
            if let Some(value) = ready() {
                return value;
            }
            assert!(
                Instant::now() <= deadline,
                "gave up waiting for {what}\n--- board\n{}\n--- daemon log\n{}\n--- holder log\n{}",
                self.board(),
                std::fs::read_to_string(self.file("daemon.log")).unwrap_or_default(),
                std::fs::read_to_string(self.file("holder.log")).unwrap_or_default(),
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    /// Repositories, an idle fake agent and a fake `gh`, and Shep pointed at the checkout:
    /// enough for `shep go` to start work. Returns the checkout.
    pub fn ready(&self) -> PathBuf {
        let (_, checkout) = self.repos();
        self.install("claude", IDLE_CLAUDE);
        self.install("gh", FAKE_GH);
        self.shep()
            .args(["config", "--repo"])
            .arg(&checkout)
            .assert()
            .success();
        checkout
    }

    /// A bare `origin` (default branch `main`) and the person's clone of it.
    pub fn repos(&self) -> (PathBuf, PathBuf) {
        let root = self.dir.path();
        let seed = root.join("seed");
        std::fs::create_dir_all(&seed).unwrap();
        git(&seed, &["init", "-q", "-b", "main"]);
        std::fs::write(seed.join("app.txt"), "hello\n").unwrap();
        git(&seed, &["add", "."]);
        git(
            &seed,
            &[
                "-c",
                "user.name=T",
                "-c",
                "user.email=t@e",
                "commit",
                "-q",
                "-m",
                "first",
            ],
        );
        git(root, &["clone", "-q", "--bare", "seed", "origin.git"]);
        git(root, &["clone", "-q", "origin.git", "checkout"]);
        (root.join("origin.git"), root.join("checkout"))
    }
}

/// Stops the daemon and holder a test started, so test runs leave no processes behind.
impl Drop for Home {
    fn drop(&mut self) {
        for pid in [self.daemon_pid(), self.pid("holder.pid")]
            .into_iter()
            .flatten()
        {
            let _ = std::process::Command::new("kill").arg(&pid).status();
        }
    }
}

pub fn alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid])
        .status()
        .is_ok_and(|s| s.success())
}

pub fn git(dir: &Path, args: &[&str]) -> String {
    let out = std::process::Command::new("git")
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

/// A stand-in for Claude Code: reports over OSC 7501, edits a file without committing, saves
/// test proof, and answers as the reviewer when asked for a second opinion. While
/// `$FAKE_LOG/hold` exists it keeps working.
pub const FAKE_CLAUDE: &str = r#"#!/bin/sh
printf '%s' "$*" | tr '\n' ' ' >> "$FAKE_LOG/claude.calls"; echo >> "$FAKE_LOG/claude.calls"
printf '\033]7501;state=working:app=claude-code\033\\'
case "$2" in
  *"second-opinion reviewer"*)
    echo "Looks correct to me; one naming nit." > "$SHEP_REVIEW_FILE"
    exit 0;;
esac
while [ -f "$FAKE_LOG/hold" ]; do sleep 0.1; done
echo "fixed" >> fix.txt
mkdir -p "$SHEP_PROOF_DIR"
printf '$ make test\n3 passed\n' > "$SHEP_PROOF_DIR/tests.txt"
printf '\033]7501;state=done\033\\'
echo "All done."
"#;

/// A stand-in for `gh`: issue #7, a draft PR #12, green checks.
pub const FAKE_GH: &str = r#"#!/bin/sh
printf '%s' "$*" | tr '\n' ' ' >> "$FAKE_LOG/gh.calls"; echo >> "$FAKE_LOG/gh.calls"
case "$1 $2" in
  "issue view") echo '{"title":"Fix login redirect loop","body":"Users land on /login again.","url":"https://github.com/acme/app/issues/7"}';;
  "pr create") echo "https://github.com/acme/app/pull/12";;
  "pr checks") echo '[{"name":"build","bucket":"pass","link":""}]';;
  "pr edit"|"pr ready"|"pr merge") ;;
  *) echo "fake gh: unexpected $*" >&2; exit 1;;
esac
"#;

/// A `claude` that only waits, for tests about starting rather than finishing work.
pub const IDLE_CLAUDE: &str = "#!/bin/sh\nsleep 600\n";
