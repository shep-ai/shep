//! The agent's own git, run with the environment Shep gives agent sessions, against a real
//! bare origin: it can push its task branch and nothing else, and the repository's own hooks
//! still run.

mod support;

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use shep_app::ports::Git;
use shep_domain::{TaskBranch, TaskId, Worktree};
use shep_infra::GitCli;
use support::{git, Repos};

fn branch() -> TaskBranch {
    TaskBranch::for_task(TaskId(1), "Fix login")
}

/// Runs git as the agent would: in its worktree, with Shep's environment for it.
fn agent_git(wt: &Worktree, env: &[(String, String)], args: &[&str]) -> Output {
    Command::new("git")
        .args(args)
        .current_dir(&wt.path)
        .envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .output()
        .unwrap()
}

fn agent_commit(wt: &Worktree, env: &[(String, String)], file: &str) -> Output {
    std::fs::write(Path::new(&wt.path).join(file), "agent work\n").unwrap();
    assert!(agent_git(wt, env, &["add", file]).status.success());
    agent_git(wt, env, &["commit", "-q", "-m", file])
}

fn install_hook(dir: &Path, name: &str, script: &str) {
    std::fs::create_dir_all(dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, script).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
}

fn setup() -> (Repos, GitCli, Worktree, Vec<(String, String)>) {
    let repos = Repos::new();
    let g = GitCli::new(repos.worktrees());
    let wt = g.prepare_worktree(&repos.checkout(), &branch()).unwrap();
    let env = g.agent_env(&wt).unwrap();
    (repos, g, wt, env)
}

#[test]
fn the_agent_can_push_its_task_branch_and_nothing_else() {
    let (repos, _g, wt, env) = setup();
    assert!(agent_commit(&wt, &env, "fix.txt").status.success());
    let main_before = git(&repos.origin(), &["rev-parse", "main"]);

    for target in ["HEAD:main", "HEAD:refs/heads/feature", "HEAD:refs/tags/v1"] {
        let out = agent_git(&wt, &env, &["push", "origin", target]);
        assert!(!out.status.success(), "{target} was pushed");
        let err = String::from_utf8_lossy(&out.stderr);
        assert!(err.contains("Shep"), "{target}: {err}");
    }
    assert_eq!(git(&repos.origin(), &["rev-parse", "main"]), main_before);
    assert_eq!(repos.origin_branches(), ["main"]);

    let own = format!("HEAD:refs/heads/{}", branch());
    let out = agent_git(&wt, &env, &["push", "origin", &own]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(repos.origin_branches().contains(&branch().to_string()));
}

#[test]
fn the_repositorys_own_hooks_still_run_for_the_agent() {
    let (repos, _g, wt, env) = setup();
    let marks = repos.path("marks");
    std::fs::create_dir_all(&marks).unwrap();
    let hooks =
        PathBuf::from(git(&repos.checkout(), &["rev-parse", "--absolute-git-dir"])).join("hooks");
    install_hook(
        &hooks,
        "pre-commit",
        &format!("#!/bin/sh\necho ran >> '{}/pre-commit'\n", marks.display()),
    );
    install_hook(
        &hooks,
        "pre-push",
        &format!("#!/bin/sh\ncat >> '{}/pre-push'\n", marks.display()),
    );

    assert!(agent_commit(&wt, &env, "fix.txt").status.success());
    assert_eq!(
        std::fs::read_to_string(marks.join("pre-commit")).unwrap(),
        "ran\n"
    );
    let own = format!("HEAD:refs/heads/{}", branch());
    assert!(agent_git(&wt, &env, &["push", "origin", &own])
        .status
        .success());
    let pushed = std::fs::read_to_string(marks.join("pre-push")).unwrap();
    assert!(
        pushed.contains(&format!("refs/heads/{}", branch())),
        "the repository's pre-push hook reads what is pushed: {pushed:?}"
    );

    install_hook(
        &hooks,
        "pre-commit",
        "#!/bin/sh\necho 'lint failed' >&2\nexit 1\n",
    );
    let refused = agent_commit(&wt, &env, "more.txt");
    assert!(
        !refused.status.success(),
        "a failing repository hook still blocks"
    );
    assert!(String::from_utf8_lossy(&refused.stderr).contains("lint failed"));
}

#[test]
fn a_repository_with_its_own_hooks_path_keeps_it() {
    let repos = Repos::new();
    let checkout = repos.checkout();
    let marks = repos.path("marks");
    std::fs::create_dir_all(&marks).unwrap();
    install_hook(
        &checkout.join(".githooks"),
        "commit-msg",
        &format!(
            "#!/bin/sh\ncat \"$1\" >> '{}/commit-msg'\n",
            marks.display()
        ),
    );
    git(&checkout, &["add", ".githooks"]);
    git(&checkout, &["commit", "-q", "-m", "hooks"]);
    git(&checkout, &["push", "-q", "origin", "main"]);
    git(&checkout, &["config", "core.hooksPath", ".githooks"]);

    let g = GitCli::new(repos.worktrees());
    let wt = g.prepare_worktree(&checkout, &branch()).unwrap();
    let env = g.agent_env(&wt).unwrap();
    assert!(agent_commit(&wt, &env, "fix.txt").status.success());
    assert_eq!(
        std::fs::read_to_string(marks.join("commit-msg")).unwrap(),
        "fix.txt\n"
    );
    let main = agent_git(&wt, &env, &["push", "origin", "HEAD:main"]);
    assert!(
        !main.status.success(),
        "the guard holds with a hooks path too"
    );
}
