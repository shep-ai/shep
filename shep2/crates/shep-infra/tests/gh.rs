//! The gh adapter against a fake `gh` script that logs its arguments and answers from files.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use shep_app::ports::Forge;
use shep_domain::{CheckState, CiCheck, PullRequest, TaskBranch, TaskId, TaskSourceRef, Worktree};
use shep_infra::GhForge;

struct FakeGh {
    dir: tempfile::TempDir,
}

impl FakeGh {
    /// `gh` prints `out/<first two args joined by _>` (if present) and exits with
    /// `code/<same>` (default 0); every call is appended to `calls`.
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let script = format!(
            "#!/bin/sh\nd='{}'\necho \"$*\" >> \"$d/calls\"\nkey=\"$1_$2\"\n\
             [ -f \"$d/out/$key\" ] && cat \"$d/out/$key\"\n\
             [ -f \"$d/err/$key\" ] && cat \"$d/err/$key\" >&2\n\
             [ -f \"$d/code/$key\" ] && exit \"$(cat \"$d/code/$key\")\"\nexit 0\n",
            dir.path().display()
        );
        for sub in ["out", "err", "code"] {
            std::fs::create_dir_all(dir.path().join(sub)).unwrap();
        }
        let gh = dir.path().join("gh");
        std::fs::write(&gh, script).unwrap();
        std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
        Self { dir }
    }
    fn gh(&self) -> GhForge {
        GhForge::new(self.dir.path().join("gh").display().to_string())
    }
    fn answer(&self, key: &str, out: &str, code: i32) {
        std::fs::write(self.dir.path().join("out").join(key), out).unwrap();
        std::fs::write(self.dir.path().join("code").join(key), code.to_string()).unwrap();
    }
    fn complain(&self, key: &str, err: &str, code: i32) {
        std::fs::write(self.dir.path().join("err").join(key), err).unwrap();
        std::fs::write(self.dir.path().join("code").join(key), code.to_string()).unwrap();
    }
    fn calls(&self) -> Vec<String> {
        std::fs::read_to_string(self.dir.path().join("calls"))
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    }
    fn here(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }
}

fn worktree(dir: &Path) -> Worktree {
    Worktree {
        path: dir.display().to_string(),
        branch: TaskBranch::for_task(TaskId(1), "Fix login"),
        base: "main".into(),
    }
}

fn pr() -> PullRequest {
    PullRequest {
        number: 7,
        url: "https://github.com/acme/app/pull/7".into(),
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
