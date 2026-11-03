use assert_cmd::Command;
use predicates::str::contains;

struct Home(tempfile::TempDir);

impl Home {
    fn new() -> Self {
        Self(tempfile::tempdir().unwrap())
    }
    fn shep(&self) -> Command {
        let mut c = Command::cargo_bin("shep").unwrap();
        c.env("SHEP_HOME", self.0.path()).env("NO_COLOR", "1");
        c
    }
    fn file(&self, name: &str) -> std::path::PathBuf {
        self.0.path().join("shep2").join(name)
    }
    fn daemon_pid(&self) -> Option<String> {
        std::fs::read_to_string(self.file("daemon.pid"))
            .ok()
            .map(|p| p.trim().to_owned())
    }
}

/// Stops the daemon a test started, so test runs leave no processes behind.
impl Drop for Home {
    fn drop(&mut self) {
        if let Some(pid) = self.daemon_pid() {
            let _ = std::process::Command::new("kill").arg(&pid).status();
        }
    }
}

fn alive(pid: &str) -> bool {
    std::process::Command::new("kill")
        .args(["-0", pid])
        .status()
        .is_ok_and(|s| s.success())
}

#[test]
fn help_lists_exactly_the_four_commands() {
    let out = Home::new().shep().arg("--help").output().unwrap();
    let help = String::from_utf8(out.stdout).unwrap();
    let commands: Vec<&str> = help
        .lines()
        .skip_while(|l| !l.starts_with("Commands:"))
        .skip(1)
        .take_while(|l| l.starts_with("  "))
        .map(|l| l.split_whitespace().next().unwrap())
        .collect();
    assert_eq!(commands, ["add", "go", "config"], "{help}");
    assert!(
        help.contains("Run `shep` with no command to see the board"),
        "{help}"
    );
}

#[test]
fn an_empty_board_says_how_to_start() {
    Home::new()
        .shep()
        .assert()
        .success()
        .stdout(contains("Nothing yet"))
        .stdout(contains("shep add"));
}

#[test]
fn add_queues_and_the_board_shows_it() {
    let home = Home::new();
    home.shep()
        .args(["add", "#412"])
        .assert()
        .success()
        .stdout(contains("Queued #412"))
        .stdout(contains("23:00"));
    home.shep()
        .args(["add", "Rate-limit", "/api/search"])
        .assert()
        .success()
        .stdout(contains("Queued Rate-limit /api/search"));
    home.shep()
        .assert()
        .success()
        .stdout(contains("Queued (2)"))
        .stdout(contains("#412"))
        .stdout(contains("Rate-limit /api/search"));
}

#[test]
fn add_without_a_task_fails_with_a_hint() {
    Home::new()
        .shep()
        .arg("add")
        .arg("  ")
        .assert()
        .failure()
        .stderr(contains("needs a reference or a sentence"));
}

#[test]
fn go_starts_queued_work_up_to_the_limit() {
    let home = Home::new();
    for t in ["a", "b", "c", "d"] {
        home.shep().args(["add", t]).assert().success();
    }
    home.shep()
        .arg("go")
        .assert()
        .success()
        .stdout(contains("Started 3"));
    home.shep()
        .assert()
        .success()
        .stdout(contains("Working (3)"))
        .stdout(contains("Queued (1)"));
    home.shep()
        .arg("go")
        .assert()
        .success()
        .stdout(contains("Already running 3 at a time"));
}

#[test]
fn go_at_a_time_sets_the_shift() {
    let home = Home::new();
    home.shep().args(["add", "a"]).assert().success();
    home.shep()
        .args(["go", "--at", "22:30"])
        .assert()
        .success()
        .stdout(contains("Shift starts at 22:30 with 1 queued"));
    home.shep()
        .arg("config")
        .assert()
        .success()
        .stdout(contains("shift  22:30"));
    home.shep()
        .args(["go", "--at", "25:00"])
        .assert()
        .failure()
        .stderr(contains("not a time"));
}

#[test]
fn config_shows_and_changes_settings() {
    let home = Home::new();
    home.shep()
        .arg("config")
        .assert()
        .success()
        .stdout(contains("agent  not chosen"))
        .stdout(contains("shift  23:00"))
        .stdout(contains("parallel  3"));
    home.shep()
        .args(["config", "--agent", "codex", "--parallel", "5"])
        .assert()
        .success()
        .stdout(contains("agent  codex"))
        .stdout(contains("parallel  5"));
    home.shep()
        .args(["config", "--agent", "cursor"])
        .assert()
        .failure()
        .stderr(contains("unknown agent"));
    home.shep()
        .args(["config", "--parallel", "0"])
        .assert()
        .failure()
        .stderr(contains("between 1 and 12"));
}

#[test]
fn state_lives_under_shep_home() {
    let home = Home::new();
    home.shep().args(["add", "x"]).assert().success();
    assert!(home.0.path().join("shep2.db").exists());
    let other = Home::new();
    other
        .shep()
        .assert()
        .success()
        .stdout(contains("Nothing yet"));
}

#[test]
fn go_starts_the_daemon_and_later_commands_go_through_it() {
    let home = Home::new();
    home.shep().args(["add", "a"]).assert().success();
    assert_eq!(
        home.daemon_pid(),
        None,
        "add alone does not start the daemon"
    );

    home.shep().arg("go").assert().success();
    let pid = home.daemon_pid().expect("go starts the daemon");
    assert!(alive(&pid));
    assert!(home.file("run/daemon.sock").exists());

    // The daemon holds the database open. Unlink it: a CLI that opened the file itself would
    // create an empty one and lose the board; a CLI talking to the daemon sees no difference.
    std::fs::remove_file(home.0.path().join("shep2.db")).unwrap();
    home.shep().args(["add", "b"]).assert().success();
    assert!(!home.0.path().join("shep2.db").exists());
    home.shep()
        .assert()
        .success()
        .stdout(contains("Working (1)"))
        .stdout(contains("Queued (1)"));

    home.shep().arg("go").assert().success();
    assert_eq!(home.daemon_pid(), Some(pid), "one daemon per home");
}

#[test]
fn config_sets_the_repository() {
    let home = Home::new();
    let repo = tempfile::tempdir().unwrap();
    home.shep()
        .args(["config", "--repo"])
        .arg(repo.path())
        .assert()
        .success()
        .stdout(contains(format!("repo  {}", repo.path().display())));
    home.shep()
        .args(["config", "--repo", "/no/such/dir"])
        .assert()
        .failure()
        .stderr(contains("/no/such/dir"));
}
