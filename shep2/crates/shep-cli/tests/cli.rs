mod support;

use predicates::str::contains;
use support::{alive, Home};

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
    home.ready();
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
    home.ready();
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
        .stdout(row("start at", "22:30 every night"));
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
        .stdout(row("agent", "not chosen"))
        .stdout(row("start at", "23:00 every night"))
        .stdout(row("keep awake", "on"))
        .stdout(row("sources", "none · shep config --connect linear"))
        .stdout(row("pull requests", "draft · you merge"))
        .stdout(row("in parallel", "3"));
    home.shep()
        .args(["config", "--agent", "codex", "--parallel", "5"])
        .assert()
        .success()
        .stdout(row("agent", "codex"))
        .stdout(row("in parallel", "5"));
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
    assert!(home.shep_home().join("shep2.db").exists());
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
    home.ready();
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
    std::fs::remove_file(home.shep_home().join("shep2.db")).unwrap();
    home.shep().args(["add", "b"]).assert().success();
    assert!(!home.shep_home().join("shep2.db").exists());
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
        // Stored resolved: on macOS the temp dir is under /var, a link to /private/var.
        .stdout(row(
            "repo",
            &repo.path().canonicalize().unwrap().display().to_string(),
        ));
    home.shep()
        .args(["config", "--repo", "/no/such/dir"])
        .assert()
        .failure()
        .stderr(contains("/no/such/dir"));
}

#[test]
fn go_says_what_to_set_up_first() {
    let home = Home::new();
    home.shep().args(["add", "a"]).assert().success();
    home.shep()
        .arg("go")
        .assert()
        .failure()
        .stderr(contains("shep config --repo"));
}

#[test]
fn adding_inside_a_repository_points_shep_at_it() {
    let home = Home::new();
    let (_, checkout) = home.repos();
    let sub = checkout.join("src");
    std::fs::create_dir_all(&sub).unwrap();
    home.shep_in(&sub).args(["add", "#7"]).assert().success();
    home.shep().arg("config").assert().success().stdout(row(
        "repo",
        &checkout.canonicalize().unwrap().display().to_string(),
    ));
}

#[test]
fn add_by_label_queues_each_labelled_issue_once() {
    let home = Home::new();
    let (_, checkout) = home.repos();
    home.install(
        "gh",
        "#!/bin/sh\ncase \"$1 $2\" in\n  \"issue list\") echo '[{\"number\":4,\"title\":\"Fix login\"},{\"number\":9,\"title\":\"Add CSV\"}]';;\n  *) exit 1;;\nesac\n",
    );
    home.shep_in(&checkout)
        .args(["add", "--label", "shep"])
        .assert()
        .success()
        .stdout(contains("Queued 2 issues labelled shep"));
    home.shep_in(&checkout)
        .args(["add", "--label", "shep"])
        .assert()
        .success()
        .stdout(contains("No new open issues labelled shep"));
    home.shep()
        .assert()
        .success()
        .stdout(contains("Queued (2)"))
        .stdout(contains("Fix login"))
        .stdout(contains("Add CSV"));
}

/// A `shep config` row: the label, then its value after the padding.
fn row(label: &str, value: &str) -> predicates::str::RegexPredicate {
    predicates::str::is_match(format!(
        "(?m)^{}  +{}$",
        regex_escape(label),
        regex_escape(value)
    ))
    .unwrap()
}

fn regex_escape(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_ascii_punctuation() {
                format!("\\{c}")
            } else {
                c.to_string()
            }
        })
        .collect()
}

#[test]
fn the_daemon_starts_in_a_deep_home_that_does_not_exist_yet() {
    // Deep enough that the sockets move to /tmp, so nothing else creates the home first.
    let home = Home::new();
    let deep = home.dir.path().join("a".repeat(60)).join("b".repeat(60));
    home.set_env("SHEP_HOME", deep.to_str().unwrap());
    let _daemon = KillOnDrop(
        home.process_in(home.dir.path())
            .arg("__daemon")
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap(),
    );
    let pid = deep.join("shep2").join("daemon.pid");
    home.wait_for("the daemon's pid file", || pid.exists().then_some(()));
}

/// Stops a process a test started, whether the test passes or panics.
struct KillOnDrop(std::process::Child);

impl Drop for KillOnDrop {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
