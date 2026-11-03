mod support;

use shep_app::ports::Git;
use shep_domain::{TaskBranch, TaskId, Worktree};
use shep_infra::GitCli;
use support::{git, Repos};

fn branch() -> TaskBranch {
    TaskBranch::for_task(TaskId(1), "Fix login")
}

#[test]
fn a_task_worktree_comes_from_origin_and_never_touches_the_checkout() {
    let repos = Repos::new();
    repos.busy_checkout();
    let before = repos.checkout_state();
    let g = GitCli::new(repos.worktrees());

    let wt = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    assert_eq!(wt.base, "main");
    assert_eq!(wt.branch, branch());
    let path = std::path::Path::new(&wt.path);
    assert!(path.starts_with(repos.worktrees()));
    assert_eq!(
        std::fs::read_to_string(path.join("app.txt")).unwrap(),
        "hello\n"
    );
    assert!(
        !path.join("mine.txt").exists(),
        "made from origin, not the local branch"
    );
    assert_eq!(
        git(path, &["rev-parse", "--abbrev-ref", "HEAD"]),
        "shep/1-fix-login"
    );

    std::fs::write(path.join("app.txt"), "fixed\n").unwrap();
    assert!(g.commit_all(&wt, "Fix login").unwrap());
    assert!(
        !g.commit_all(&wt, "again").unwrap(),
        "nothing left to commit"
    );
    assert_eq!(g.commits_ahead(&wt).unwrap(), 1);
    g.push(&wt).unwrap();

    assert_eq!(
        repos.checkout_state(),
        before,
        "the person's checkout is untouched"
    );
    assert!(repos
        .origin_branches()
        .contains(&"shep/1-fix-login".to_owned()));
    assert!(g.diff(&wt).unwrap().contains("+fixed"));
    assert!(g.diff_stat(&wt).unwrap().contains("app.txt"));
}

#[test]
fn preparing_again_finds_the_same_worktree_or_rebuilds_it_on_the_same_branch() {
    let repos = Repos::new();
    let g = GitCli::new(repos.worktrees());
    let first = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    std::fs::write(std::path::Path::new(&first.path).join("new.txt"), "x").unwrap();
    g.commit_all(&first, "work").unwrap();
    assert_eq!(
        g.prepare_worktree(&repos.checkout(), &branch()).unwrap(),
        first
    );

    std::fs::remove_dir_all(&first.path).unwrap();
    let again = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    assert_eq!(again, first);
    assert_eq!(
        g.commits_ahead(&again).unwrap(),
        1,
        "the branch's work is kept"
    );
}

#[test]
fn the_default_branch_is_never_pushed() {
    let repos = Repos::new();
    let g = GitCli::new(repos.worktrees());
    let wt = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    let onto_main: Worktree = serde_json::from_value(serde_json::json!({
        "path": wt.path, "branch": "main", "base": "main"
    }))
    .unwrap();
    let err = g.push(&onto_main).unwrap_err();
    assert!(err.to_string().contains("default branch"), "{err}");
    let err = g.publish_files(&wt, "main", &[]).unwrap_err();
    assert!(err.to_string().contains("default branch"), "{err}");
    assert_eq!(repos.origin_branches(), ["main"]);
}

#[test]
fn proof_files_go_to_a_branch_of_their_own() {
    let repos = Repos::new();
    let g = GitCli::new(repos.worktrees());
    let wt = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    let shot = repos.path("login.png");
    std::fs::write(&shot, b"\x89PNG fake").unwrap();
    let commit = g.publish_files(&wt, "shep/proof/1", &[shot]).unwrap();
    assert_eq!(commit.len(), 40);
    let files = git(&repos.origin(), &["ls-tree", "--name-only", "shep/proof/1"]);
    assert_eq!(files, "login.png");
    assert_eq!(git(&repos.origin(), &["rev-parse", "shep/proof/1"]), commit);
    assert_eq!(
        g.commits_ahead(&wt).unwrap(),
        0,
        "the task branch is untouched"
    );
}

#[test]
fn the_repository_root_is_found_from_inside_it() {
    let repos = Repos::new();
    let sub = repos.checkout().join("src");
    std::fs::create_dir_all(&sub).unwrap();
    let g = GitCli::new(repos.worktrees());
    assert_eq!(
        g.repo_root(&sub).unwrap().canonicalize().unwrap(),
        repos.checkout().canonicalize().unwrap()
    );
    assert!(g.repo_root(repos.dir.path()).is_err());
}
