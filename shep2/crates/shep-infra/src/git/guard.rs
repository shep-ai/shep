//! The agent's push guard. Everything Shep runs in a worktree gets `core.hooksPath` (through
//! `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0`) pointing at a hooks folder Shep
//! writes beside the worktree. Its `pre-push` refuses every ref but `refs/heads/<task branch>`.
//! A hooks path replaces the repository's hooks, so every other standard hook there runs the
//! repository's own one (its configured `core.hooksPath`, else `<git common dir>/hooks`) when
//! it has one, and `pre-push` does the same after its check.
//!
//! It stops mistakes, not intent: `git push --no-verify` skips every pre-push hook.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use shep_app::ports::GitError;
use shep_domain::Worktree;

/// The hooks folder sits beside the worktree folder, named after it.
const HOOKS_SUFFIX: &str = ".hooks";
const PRE_PUSH: &str = "pre-push";
const EXECUTABLE: u32 = 0o755;
const CONFIG_COUNT: &str = "GIT_CONFIG_COUNT";
const CONFIG_KEY: &str = "GIT_CONFIG_KEY_0";
const CONFIG_VALUE: &str = "GIT_CONFIG_VALUE_0";
const HOOKS_PATH_KEY: &str = "core.hooksPath";

/// The hooks git runs on its own that pass through to the repository's. Left out: `pre-push`
/// (the guard), and hooks whose mere presence changes what git does (`push-to-checkout`,
/// `proc-receive`, `fsmonitor-watchman`).
const PASS_THROUGH: [&str; 24] = [
    "applypatch-msg",
    "pre-applypatch",
    "post-applypatch",
    "pre-commit",
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-receive",
    "update",
    "post-receive",
    "post-update",
    "reference-transaction",
    "pre-auto-gc",
    "post-rewrite",
    "sendemail-validate",
    "post-index-change",
    "p4-changelist",
    "p4-prepare-changelist",
    "p4-post-changelist",
    "p4-pre-submit",
];

/// Finds the repository's own hook as `$repo_hook` (empty when it has none). Reads
/// `core.hooksPath` with the environment's config switched off, so Shep's own folder is not
/// found; a relative path is relative to where git runs hooks, which is where this runs.
const FIND_REPO_HOOK: &str = r#"hooks=$(GIT_CONFIG_COUNT=0 git config --path --get core.hooksPath)
[ -n "$hooks" ] || hooks="$(git rev-parse --git-common-dir)/hooks"
repo_hook="$hooks/$hook"
if [ ! -x "$repo_hook" ] || [ "$(cd "$hooks" 2>/dev/null && pwd -P)" = "$shep_hooks" ]; then
  repo_hook=
fi
"#;

/// Reads what is being pushed, refuses anything but the task branch, then hands the same
/// lines to the repository's own `pre-push`.
const GUARD: &str = r#"pushed=$(cat)
refused=
while read -r local_ref local_sha remote_ref remote_sha; do
  [ -n "$remote_ref" ] || continue
  [ "$remote_ref" = "$allowed" ] || refused="$refused $remote_ref"
done <<SHEP_PUSHED
$pushed
SHEP_PUSHED
if [ -n "$refused" ]; then
  echo "Shep: an agent may push only $allowed, not:$refused" >&2
  exit 1
fi
"#;

/// Writes (again) the guard's hooks for the worktree's task branch; returns their folder.
pub(super) fn install(wt: &Worktree) -> Result<PathBuf, GitError> {
    let dir = hooks_dir(wt);
    std::fs::create_dir_all(&dir).map_err(|e| failed(&dir, &e))?;
    let dir = std::fs::canonicalize(&dir).map_err(|e| failed(&dir, &e))?;
    let allowed = format!("refs/heads/{}", wt.branch);
    write_hook(&dir, PRE_PUSH, &pre_push(&dir, &allowed))?;
    for name in PASS_THROUGH {
        write_hook(&dir, name, &pass_through(&dir, name))?;
    }
    Ok(dir)
}

/// The environment that points git at the guard's hooks.
pub(super) fn env(dir: &Path) -> Vec<(String, String)> {
    vec![
        (CONFIG_COUNT.into(), "1".into()),
        (CONFIG_KEY.into(), HOOKS_PATH_KEY.into()),
        (CONFIG_VALUE.into(), dir.display().to_string()),
    ]
}

/// Removes the guard's hooks; gone already is fine.
pub(super) fn remove(wt: &Worktree) -> Result<(), GitError> {
    let dir = hooks_dir(wt);
    match std::fs::remove_dir_all(&dir) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(failed(&dir, &e)),
        _ => Ok(()),
    }
}

fn hooks_dir(wt: &Worktree) -> PathBuf {
    PathBuf::from(format!("{}{HOOKS_SUFFIX}", wt.path))
}

fn header(dir: &Path, name: &str) -> String {
    format!(
        "#!/bin/sh\n# Written by Shep for an agent's worktree.\nhook={}\nshep_hooks={}\n",
        quote(name),
        quote(&dir.display().to_string())
    )
}

fn pass_through(dir: &Path, name: &str) -> String {
    format!(
        "{}{FIND_REPO_HOOK}[ -n \"$repo_hook\" ] || exit 0\nexec \"$repo_hook\" \"$@\"\n",
        header(dir, name)
    )
}

fn pre_push(dir: &Path, allowed: &str) -> String {
    format!(
        "{}allowed={}\n{GUARD}{FIND_REPO_HOOK}[ -n \"$repo_hook\" ] || exit 0\n\
         printf '%s\\n' \"$pushed\" | \"$repo_hook\" \"$@\"\n",
        header(dir, PRE_PUSH),
        quote(allowed)
    )
}

fn write_hook(dir: &Path, name: &str, script: &str) -> Result<(), GitError> {
    let path = dir.join(name);
    std::fs::write(&path, script).map_err(|e| failed(&path, &e))?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(EXECUTABLE))
        .map_err(|e| failed(&path, &e))
}

/// A single-quoted shell word.
fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

fn failed(path: &Path, e: &std::io::Error) -> GitError {
    GitError(format!("the push guard at {}: {e}", path.display()))
}
