//! The real Claude Code CLI, run by Shep, against the mock model: no API key, no cost. Only the
//! model is scripted (`shep-mock-model`); Shep's prompts, the PTY, Claude Code's flags,
//! `--session-id`, `--resume` and exit codes are all real.
//!
//! Needs `claude` on `PATH`, so it is opt-in locally:
//! `cargo test -p shep-cli --test real_claude -- --include-ignored`. CI installs Claude Code
//! and runs it.

mod support;

use std::path::{Path, PathBuf};

use shep_mock_model::MockModel;
use support::{git, Home};

const BRANCH: &str = "shep/1-fix-login-redirect-loop";
const NEEDS_CLAUDE: &str = "runs the real Claude Code CLI; needs `claude` on PATH";

/// `gh`: issue #7, draft PR #12, and CI that fails `lint` once, then passes.
const GH_RED_ONCE: &str = r#"#!/bin/sh
printf '%s' "$*" | tr '\n' ' ' >> "$FAKE_LOG/gh.calls"; echo >> "$FAKE_LOG/gh.calls"
case "$1 $2" in
  "issue view") echo '{"title":"Fix login redirect loop","body":"Users land on /login again.","url":"https://github.com/acme/app/issues/7"}';;
  "pr create") echo "https://github.com/acme/app/pull/12";;
  "pr checks")
    n=$(cat "$FAKE_LOG/checks" 2>/dev/null || echo 0); echo $((n + 1)) > "$FAKE_LOG/checks"
    if [ "$n" = 0 ]; then
      echo '[{"name":"lint","bucket":"fail","link":"https://github.com/acme/app/actions/runs/31/job/32"}]'
    else
      echo '[{"name":"lint","bucket":"pass","link":""}]'
    fi;;
  "run view") echo "session.ts:3 error: unused import";;
  "pr edit"|"pr ready"|"pr merge") ;;
  *) echo "fake gh: unexpected $*" >&2; exit 1;;
esac
"#;

/// The real `claude` on this process's PATH.
fn real_claude() -> PathBuf {
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .map(|dir| dir.join("claude"))
        .find(|p| p.is_file())
        .expect("install Claude Code (npm install -g @anthropic-ai/claude-code) to run this test")
}

/// Puts a `claude` in the sandbox that runs the real one, with its own folder (and so `node`)
/// on PATH, and points it at the mock model with a config home of its own.
fn use_real_claude(home: &Home, model: &MockModel) {
    let claude = real_claude();
    let dir = claude.parent().unwrap_or(Path::new("/"));
    home.install(
        "claude",
        &format!(
            "#!/bin/sh\nPATH=\"{}:$PATH\" exec \"{}\" \"$@\"\n",
            dir.display(),
            claude.display()
        ),
    );
    let config = home.dir.path().join("claude-home");
    std::fs::create_dir_all(&config).unwrap();
    home.set_env("HOME", &config.display().to_string());
    home.set_env("ANTHROPIC_BASE_URL", &model.url());
    home.set_env("ANTHROPIC_API_KEY", "sk-ant-mock");
    home.set_env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");
    // Claude Code refuses --dangerously-skip-permissions as root unless it is told it runs in a
    // sandbox; CI containers and this test's sandbox are exactly that.
    home.set_env("IS_SANDBOX", "1");
}

/// Every Claude Code conversation file in the sandbox's config home, with its text.
fn conversations(home: &Home) -> Vec<(String, String)> {
    let projects = home.dir.path().join("claude-home/.claude/projects");
    let mut found = Vec::new();
    for project in std::fs::read_dir(projects).into_iter().flatten().flatten() {
        for file in std::fs::read_dir(project.path())
            .into_iter()
            .flatten()
            .flatten()
        {
            let name = file.file_name().to_string_lossy().into_owned();
            if let Some(id) = name.strip_suffix(".jsonl") {
                let text = std::fs::read_to_string(file.path()).unwrap_or_default();
                found.push((id.to_owned(), text));
            }
        }
    }
    found
}

#[test]
#[ignore = "runs the real Claude Code CLI; needs `claude` on PATH"]
fn claude_code_carries_a_task_through_a_ci_fix_to_a_ready_pr() {
    let _ = NEEDS_CLAUDE;
    let model = MockModel::start().unwrap();
    let home = Home::new();
    let (origin, checkout) = home.repos();
    use_real_claude(&home, &model);
    home.install("gh", GH_RED_ONCE);

    home.shep_in(&checkout)
        .args(["add", "#7"])
        .assert()
        .success();
    home.shep()
        .args(["config", "--agent", "claude-code"])
        .assert()
        .success();
    home.shep().arg("go").assert().success();
    let board = home.wait_for_board("Ready (1)");
    assert!(
        board.contains("https://github.com/acme/app/pull/12"),
        "{board}"
    );

    // The agent's change, and the CI fix it committed itself, are on origin's task branch.
    let change = git(&origin, &["show", &format!("{BRANCH}:MOCK_CHANGE.md")]);
    assert_eq!(change, "Changed by the mock model.");
    let fix = git(&origin, &["show", &format!("{BRANCH}:MOCK_FIX.md")]);
    assert_eq!(fix, "fixed by the mock model");

    // Three agent turns: the task, the CI fix, the second opinion.
    let prompts = model.prompts();
    assert_eq!(prompts.len(), 3, "{prompts:#?}");
    assert!(
        prompts[0].contains("Users land on /login again."),
        "{}",
        prompts[0]
    );
    assert!(
        prompts[1].contains("CI failed on your pull request: lint"),
        "{}",
        prompts[1]
    );
    assert!(
        prompts[2].contains("second-opinion reviewer"),
        "{}",
        prompts[2]
    );

    // The fix went into the coder's own conversation (`--resume`), the review into another.
    let conversations = conversations(&home);
    assert_eq!(
        conversations.len(),
        2,
        "coder and reviewer: {conversations:#?}"
    );
    let coder = conversations
        .iter()
        .find(|(_, text)| text.contains("Users land on /login again."))
        .expect("the coder's conversation");
    assert!(
        coder.1.contains("CI failed on your pull request"),
        "the fix resumed it"
    );
    assert!(!coder.1.contains("second-opinion reviewer"));

    let gh = home.calls("gh");
    let body = gh
        .iter()
        .rev()
        .find(|c| c.starts_with("pr edit 12"))
        .unwrap();
    for part in [
        "Mock review: the change does what the task asks.",
        "3 passed",
        "lint failed",
        "all checks pass",
    ] {
        assert!(body.contains(part), "{part:?} missing from {body}");
    }
}

#[test]
#[ignore = "runs the real Claude Code CLI; needs `claude` on PATH"]
fn a_question_from_claude_code_waits_for_the_answer() {
    let model = MockModel::start().unwrap();
    let home = Home::new();
    let (_origin, checkout) = home.repos();
    use_real_claude(&home, &model);
    home.install("gh", GH_RED_ONCE);

    home.shep_in(&checkout)
        .args(["add", "Store uploads [mock:ask]"])
        .assert()
        .success();
    home.shep()
        .args(["config", "--agent", "claude-code"])
        .assert()
        .success();
    home.shep().arg("go").assert().success();
    let board = home.wait_for_board("Needs you (1)");
    assert!(
        board.contains("Which bucket should this use, prod or staging?"),
        "{board}"
    );
    let _ = checkout;
}
