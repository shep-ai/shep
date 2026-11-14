//! The gh adapter against a fake `gh` script that logs its arguments and answers from files.

mod support;

use std::path::Path;

use shep_app::ports::Forge;
use shep_domain::{CheckState, CiCheck, TaskBranch, TaskId, TaskSourceRef, Worktree};
use shep_infra::GhForge;
use support::fake_gh::{pr, FakeGh};

fn worktree(dir: &Path) -> Worktree {
    Worktree {
        path: dir.display().to_string(),
        branch: TaskBranch::for_task(TaskId(1), "Fix login"),
        base: "main".into(),
    }
}

#[test]
fn an_issue_is_read_from_its_repository() {
    let fake = FakeGh::new();
    fake.answer(
        "issue_view",
        r#"{"title":"Fix login","body":"It loops.","url":"https://github.com/acme/app/issues/4"}"#,
        0,
    );
    let gh = fake.gh();
    let here = TaskSourceRef::parse("#4").unwrap();
    let issue = gh.issue(&fake.here(), &here).unwrap().unwrap();
    assert_eq!(
        (issue.title.as_str(), issue.body.as_str()),
        ("Fix login", "It loops.")
    );
    let other = TaskSourceRef::parse("acme/api#9").unwrap();
    gh.issue(&fake.here(), &other).unwrap();
    let sentence = TaskSourceRef::parse("Do a thing").unwrap();
    assert_eq!(gh.issue(&fake.here(), &sentence).unwrap(), None);
    assert_eq!(
        fake.calls(),
        [
            "issue view 4 --json title,body,url",
            "issue view 9 --json title,body,url -R acme/api"
        ]
    );
}

#[test]
fn a_draft_is_opened_from_the_task_branch_into_the_base() {
    let fake = FakeGh::new();
    fake.answer("pr_create", "https://github.com/acme/app/pull/12\n", 0);
    let pr = fake
        .gh()
        .open_draft(&worktree(&fake.here()), "Fix login", "Closes #4.")
        .unwrap();
    assert_eq!(pr.number, 12);
    assert_eq!(pr.url, "https://github.com/acme/app/pull/12");
    assert_eq!(
        fake.calls(),
        ["pr create --draft --base main --head shep/1-fix-login --title Fix login --body Closes #4."]
    );
}

#[test]
fn checks_are_read_even_when_gh_exits_non_zero() {
    let fake = FakeGh::new();
    fake.answer(
        "pr_checks",
        r#"[{"name":"build","bucket":"pass","link":"https://x/actions/runs/11/job/22"},
            {"name":"lint","bucket":"fail","link":"https://github.com/acme/app/actions/runs/31/job/32"},
            {"name":"e2e","bucket":"pending","link":""},
            {"name":"docs","bucket":"skipping","link":""},
            {"name":"deploy","bucket":"cancel","link":""}]"#,
        8,
    );
    let checks = fake.gh().checks(&worktree(&fake.here()), &pr()).unwrap();
    let states: Vec<(&str, CheckState)> =
        checks.iter().map(|c| (c.name.as_str(), c.state)).collect();
    assert_eq!(
        states,
        [
            ("build", CheckState::Passed),
            ("lint", CheckState::Failed),
            ("e2e", CheckState::Pending),
            ("docs", CheckState::Skipped),
            ("deploy", CheckState::Failed)
        ]
    );
    assert_eq!(checks[2].link, None);
    assert_eq!(fake.calls(), ["pr checks 7 --json name,bucket,link"]);
}

#[test]
fn no_checks_yet_is_an_empty_list() {
    let fake = FakeGh::new();
    fake.complain("pr_checks", "no checks reported on the 'shep/1' branch", 1);
    assert_eq!(
        fake.gh().checks(&worktree(&fake.here()), &pr()).unwrap(),
        []
    );
}

#[test]
fn a_failed_log_comes_from_its_run_and_is_trimmed() {
    let fake = FakeGh::new();
    let lines: Vec<String> = (1..=500).map(|i| format!("line {i}")).collect();
    fake.answer("run_view", &lines.join("\n"), 0);
    let check = CiCheck {
        name: "lint".into(),
        state: CheckState::Failed,
        link: Some("https://github.com/acme/app/actions/runs/31/job/32".into()),
    };
    let tail = fake
        .gh()
        .failed_log(&worktree(&fake.here()), &check)
        .unwrap();
    assert!(tail.ends_with("line 500"), "{}", &tail[tail.len() - 20..]);
    assert!(!tail.contains("line 1\n"));
    assert_eq!(fake.calls(), ["run view 31 --log-failed"]);
}

#[test]
fn merge_marks_ready_then_merges_falling_back_to_an_allowed_method() {
    let fake = FakeGh::new();
    fake.complain(
        "pr_merge",
        "Squash merges are not allowed on this repository",
        1,
    );
    let err = fake.gh().merge(&fake.here(), &pr()).unwrap_err();
    assert!(err.to_string().contains("not allowed"), "{err}");
    assert_eq!(
        fake.calls(),
        [
            "pr ready 7",
            "pr merge 7 --squash",
            "pr merge 7 --merge",
            "pr merge 7 --rebase"
        ]
    );
}

#[test]
fn labelled_issues_are_listed_open_only() {
    let fake = FakeGh::new();
    fake.answer(
        "issue_list",
        r#"[{"number":4,"title":"Fix login"},{"number":9,"title":"Add CSV"}]"#,
        0,
    );
    let issues = fake.gh().labelled(&fake.here(), "shep").unwrap();
    assert_eq!(
        issues
            .iter()
            .map(|i| (i.number, i.title.as_str()))
            .collect::<Vec<_>>(),
        [(4, "Fix login"), (9, "Add CSV")]
    );
    assert_eq!(
        fake.calls(),
        ["issue list --label shep --state open --json number,title --limit 200"]
    );
}

#[test]
fn who_is_signed_in_and_the_newest_open_issues() {
    let fake = FakeGh::new();
    fake.answer("api_user", "ariel\n", 0);
    fake.answer("issue_list", r#"[{"number":4,"title":"Fix login"}]"#, 0);
    let gh = fake.gh();
    assert_eq!(gh.whoami().unwrap().as_deref(), Some("ariel"));
    assert_eq!(gh.open_issues(&fake.here(), 5).unwrap()[0].number, 4);
    fake.complain("api_user", "You are not logged into any GitHub hosts", 4);
    assert_eq!(gh.whoami().unwrap(), None);
    assert_eq!(GhForge::new("/no/such/gh").whoami().unwrap(), None);
}
