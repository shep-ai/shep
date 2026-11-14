//! The base branch moving under a task, and a task's worktree going away, against real repos.

mod support;

use std::path::Path;

use shep_app::ports::{BaseUpdate, Git};
use shep_domain::{TaskBranch, TaskId, Worktree};
use shep_infra::GitCli;
use support::{git, Repos};

fn branch() -> TaskBranch {
    TaskBranch::for_task(TaskId(1), "Fix login")
}

/// A task worktree whose agent changed `app.txt` and Shep committed it.
fn worked(repos: &Repos) -> (GitCli, Worktree) {
    let g = GitCli::new(repos.worktrees());
    let wt = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    std::fs::write(Path::new(&wt.path).join("app.txt"), "fixed\n").unwrap();
    assert!(g.commit_all(&wt, "Fix login").unwrap());
    (g, wt)
}

fn merging(wt: &Worktree) -> bool {
    Path::new(&git(Path::new(&wt.path), &["rev-parse", "--git-dir"]))
        .join("MERGE_HEAD")
        .exists()
}

#[test]
fn an_unmoved_base_is_up_to_date() {
    let repos = Repos::new();
    let (g, wt) = worked(&repos);
    assert_eq!(g.update_from_base(&wt).unwrap(), BaseUpdate::UpToDate);
}

#[test]
fn a_moved_base_is_merged_into_the_task_branch() {
    let repos = Repos::new();
    let (g, wt) = worked(&repos);
    repos.advance_main("other.txt", "theirs\n");

    assert_eq!(g.update_from_base(&wt).unwrap(), BaseUpdate::Merged);
    let dir = Path::new(&wt.path);
    assert_eq!(
        std::fs::read_to_string(dir.join("other.txt")).unwrap(),
        "theirs\n"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join("app.txt")).unwrap(),
        "fixed\n"
    );
    assert_eq!(g.commits_ahead(&wt).unwrap(), 2, "the change and the merge");
    assert!(
        !g.diff(&wt).unwrap().contains("other.txt"),
        "only the task's change"
    );
    assert_eq!(g.update_from_base(&wt).unwrap(), BaseUpdate::UpToDate);
}

#[test]
fn a_conflict_is_reported_and_leaves_the_worktree_as_it_was() {
    let repos = Repos::new();
    let (g, wt) = worked(&repos);
    let dir = Path::new(&wt.path);
    let head = git(dir, &["rev-parse", "HEAD"]);
    repos.advance_main("app.txt", "theirs\n");

    assert_eq!(
        g.update_from_base(&wt).unwrap(),
        BaseUpdate::Conflict(vec!["app.txt".into()])
    );
    assert_eq!(git(dir, &["rev-parse", "HEAD"]), head);
    assert_eq!(git(dir, &["status", "--porcelain"]), "");
    assert!(!merging(&wt));
}

#[test]
fn an_unresolved_merge_left_by_the_agent_is_never_committed() {
    let repos = Repos::new();
    let (g, wt) = worked(&repos);
    let dir = Path::new(&wt.path);
    let head = git(dir, &["rev-parse", "HEAD"]);
    repos.advance_main("app.txt", "theirs\n");
    git(dir, &["fetch", "-q", "origin", "main"]);
    let out = std::process::Command::new("git")
        .args(["merge", "origin/main"])
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(!out.status.success(), "the agent's merge conflicts");

    assert!(!g.commit_all(&wt, "Fix login").unwrap());
    assert_eq!(git(dir, &["rev-parse", "HEAD"]), head);
    assert!(!merging(&wt));
    assert!(!std::fs::read_to_string(dir.join("app.txt"))
        .unwrap()
        .contains("<<<<<<<"));
}

#[test]
fn a_merged_task_loses_its_worktree_guard_and_local_branch() {
    let repos = Repos::new();
    let (g, wt) = worked(&repos);
    g.agent_env(&wt).unwrap();
    std::fs::write(Path::new(&wt.path).join("left-over.txt"), "x\n").unwrap();
    let checkout = repos.checkout();

    g.remove_worktree(&checkout, &wt).unwrap();
    assert!(!Path::new(&wt.path).exists());
    let leftovers: Vec<_> = std::fs::read_dir(Path::new(&wt.path).parent().unwrap())
        .unwrap()
        .collect();
    assert!(
        leftovers.is_empty(),
        "the guard's hooks go too: {leftovers:?}"
    );
    assert!(git(&checkout, &["branch", "--list", branch().as_str()]).contains("shep/"));

    g.delete_branch(&checkout, &branch()).unwrap();
    assert_eq!(git(&checkout, &["branch", "--list", branch().as_str()]), "");
    g.delete_branch(&checkout, &branch()).unwrap();
    g.remove_worktree(&checkout, &wt).unwrap();
}
