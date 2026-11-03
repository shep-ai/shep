//! `shep add "#7"` then `shep go` all the way to a draft PR that is Ready: the real binary,
//! daemon, holder, git and a bare `origin`, with a fake agent and a fake `gh`.

mod support;

use support::{alive, git, Home, FAKE_CLAUDE, FAKE_GH};

const BRANCH: &str = "shep/1-fix-login-redirect-loop";

fn home_with_fakes() -> (Home, std::path::PathBuf, std::path::PathBuf) {
    let home = Home::new();
    let (origin, checkout) = home.repos();
    home.install("claude", FAKE_CLAUDE);
    home.install("gh", FAKE_GH);
    (home, origin, checkout)
}

#[test]
fn add_then_go_ends_in_a_ready_draft_pr() {
    let (home, origin, checkout) = home_with_fakes();
    let before = git(&checkout, &["status", "--porcelain", "--branch"]);

    home.shep_in(&checkout)
        .args(["add", "#7"])
        .assert()
        .success();
    home.shep().arg("go").assert().success();
    let board = home.wait_for_board("Ready (1)");

    assert!(board.contains("Fix login redirect loop"), "{board}");
    assert!(
        board.contains("https://github.com/acme/app/pull/12"),
        "{board}"
    );

    // The work is on origin, on the task branch only.
    let pushed = git(&origin, &["show", &format!("{BRANCH}:fix.txt")]);
    assert_eq!(pushed, "fixed");
    assert!(git(&origin, &["show", "main:app.txt"]).contains("hello"));
    assert_eq!(
        git(&origin, &["rev-list", "--count", "main"]),
        "1",
        "main is never pushed"
    );
    assert_eq!(
        git(&checkout, &["status", "--porcelain", "--branch"]),
        before,
        "the person's checkout is untouched"
    );

    let gh = home.calls("gh");
    assert!(
        gh.iter().any(|c| c == "issue view 7 --json title,body,url"),
        "{gh:#?}"
    );
    let create = gh.iter().find(|c| c.starts_with("pr create")).unwrap();
    assert!(
        create.starts_with(&format!(
            "pr create --draft --base main --head {BRANCH} --title Fix login redirect loop"
        )),
        "{create}"
    );
    assert!(create.contains("Closes #7."), "{create}");
    let body = gh
        .iter()
        .rev()
        .find(|c| c.starts_with("pr edit 12"))
        .unwrap();
    for part in [
        "Looks correct to me; one naming nit.",
        "3 passed",
        "fix.txt",
        "all checks pass",
    ] {
        assert!(body.contains(part), "{part:?} missing from {body}");
    }

    let claude = home.calls("claude");
    assert_eq!(claude.len(), 2, "the coder, then the reviewer: {claude:#?}");
    assert!(claude[0].contains("--session-id"), "{}", claude[0]);
    assert!(
        claude[0].contains("Users land on /login again."),
        "{}",
        claude[0]
    );
    assert!(
        claude[1].contains("second-opinion reviewer"),
        "{}",
        claude[1]
    );
}

#[test]
fn a_daemon_restart_does_not_stop_a_running_agent() {
    let (home, _origin, checkout) = home_with_fakes();
    let hold = home.log().join("hold");
    std::fs::write(&hold, "").unwrap();
    home.shep_in(&checkout)
        .args(["add", "#7"])
        .assert()
        .success();
    home.shep().arg("go").assert().success();
    home.wait_for("the agent to start", || {
        (home.calls("claude").len() == 1).then_some(())
    });

    let daemon = home.daemon_pid().unwrap();
    let holder = home
        .pid("holder.pid")
        .expect("the daemon started the holder");
    let _ = std::process::Command::new("kill").arg(&daemon).status();
    home.wait_for("the daemon to stop", || (!alive(&daemon)).then_some(()));
    assert!(alive(&holder), "the holder outlives the daemon");

    home.shep().arg("go").assert().success();
    let restarted = home.daemon_pid().unwrap();
    assert_ne!(restarted, daemon);
    std::fs::remove_file(&hold).unwrap();
    home.wait_for_board("Ready (1)");

    let claude = home.calls("claude");
    assert_eq!(
        claude.len(),
        2,
        "the coder ran once, through the restart, then the reviewer: {claude:#?}"
    );
    assert_eq!(home.pid("holder.pid"), Some(holder), "one holder all along");
}
