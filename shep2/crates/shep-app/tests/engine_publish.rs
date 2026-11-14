//! Around publishing: the agent's push guard, the repository's own screenshots, the base
//! branch moving under a task, and cleaning up after Merge.

mod support;

use support::*;

const DEV_JSON: &str = "/wt/shep/1-fix-login-redirect-loop/.shep/dev.json";
const SHELL: &str = "/bin/sh";

fn env_of(spec: &shep_app::ports::SessionSpec, key: &str) -> Option<String> {
    spec.env
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
}

/// Queued #7 with a screenshot command in the repository, started, the coder running.
fn started_with_screenshots(dev_json: &str) -> World {
    let w = world();
    w.f.files.put(DEV_JSON, dev_json);
    w.shep.add("#7", None).unwrap();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    w
}

#[test]
fn every_agent_session_gets_the_push_guard_for_its_branch() {
    let w = World::reviewing();
    let spawned = w.f.sessions.spawned();
    assert_eq!(spawned.len(), 2, "the coder and the reviewer");
    for (_, spec) in &spawned {
        assert_eq!(env_of(spec, "GIT_CONFIG_COUNT").as_deref(), Some("1"));
        assert_eq!(
            env_of(spec, "GIT_CONFIG_KEY_0").as_deref(),
            Some("core.hooksPath")
        );
        assert_eq!(
            env_of(spec, "GIT_CONFIG_VALUE_0"),
            Some(format!("/hooks/{BRANCH}"))
        );
    }
}

#[test]
fn the_repositorys_screenshot_command_runs_after_the_coder_and_its_pngs_become_proof() {
    let w = started_with_screenshots(r#"{"command":"pnpm dev","screenshot":"pnpm screenshot"}"#);
    let prompt = w.prompt();
    assert!(!prompt.contains("save screenshots"), "{prompt}");
    assert!(prompt.contains("screenshot command"), "{prompt}");

    w.agent_finishes();
    w.engine.tick();
    let (shot, spec) = w.session();
    assert_eq!(spec.program, SHELL);
    assert_eq!(spec.args[0], "-c");
    assert_eq!(
        spec.args[1], "mkdir -p \"$SHEP_PROOF_DIR\" && pnpm screenshot",
        "the proof folder exists before the command runs"
    );
    assert_eq!(spec.cwd, Path::new(WORKTREE));
    assert_eq!(
        env_of(&spec, AGENT_ENV_PROOF_DIR).as_deref(),
        Some("/tasks/1/proof")
    );
    assert_eq!(
        env_of(&spec, "GIT_CONFIG_VALUE_0"),
        Some(format!("/hooks/{BRANCH}"))
    );
    assert!(
        w.f.git.pushes().is_empty(),
        "screenshots come before the push"
    );
    w.engine.tick();
    assert_eq!(w.session().0, shot, "a running command is left alone");

    w.f.files.put("/tasks/1/proof/home.png", "PNG");
    w.f.sessions.exit(&shot, 0, "saved home.png");
    w.engine.tick();
    assert_eq!(w.f.git.pushes(), [BRANCH]);
    assert!(w.kinds(1).contains(&EventKind::Screenshots));

    w.f.forge
        .queue_checks(vec![check("build", CheckState::Passed)]);
    w.engine.tick();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Ready);
    let published = w.f.git.published();
    assert_eq!(published[0].1, [Path::new("/tasks/1/proof/home.png")]);
}

#[test]
fn without_a_screenshot_command_the_agent_is_asked_for_screenshots() {
    for dev_json in [None, Some("{not json"), Some(r#"{"command":"pnpm dev"}"#)] {
        let w = world();
        if let Some(text) = dev_json {
            w.f.files.put(DEV_JSON, text);
        }
        w.shep.add("#7", None).unwrap();
        w.shep.start(StartWhen::Now).unwrap();
        w.engine.tick();
        assert!(
            w.prompt().contains("save screenshots (PNG)"),
            "{dev_json:?}"
        );
        w.agent_finishes();
        w.engine.tick();
        assert_eq!(w.f.git.pushes(), [BRANCH], "{dev_json:?}");
        assert_eq!(w.f.sessions.spawned().len(), 1, "no command ran");
    }
}

#[test]
fn a_failing_or_stuck_screenshot_command_never_holds_the_task_back() {
    let w = started_with_screenshots(r#"{"screenshot":"make shots"}"#);
    w.agent_finishes();
    w.engine.tick();
    w.f.sessions.exit(&w.session().0, 2, "make: no rule");
    w.engine.tick();
    assert_eq!(w.f.git.pushes().len(), 1);

    let w = started_with_screenshots(r#"{"screenshot":"make shots"}"#);
    w.agent_finishes();
    w.engine.tick();
    let (stuck, _) = w.session();
    w.f.clock
        .advance(EngineConfig::default().screenshot_timeout_secs + 1);
    w.engine.tick();
    assert_eq!(w.f.sessions.killed(), [stuck]);
    assert_eq!(w.f.git.pushes().len(), 1);
    let events = {
        use shep_app::ports::EventLog;
        w.f.events.events(TaskId(1)).unwrap()
    };
    let shots = events
        .iter()
        .find(|e| e.kind == EventKind::Screenshots)
        .unwrap();
    assert!(shots.detail.contains("minutes"), "{}", shots.detail);
}

#[test]
fn a_moved_base_branch_is_merged_in_before_the_push() {
    let w = World::started();
    w.f.git.queue_base_update(BaseUpdate::Merged);
    w.agent_finishes();
    w.engine.tick();
    assert_eq!(w.f.git.base_checks(), 1);
    assert_eq!(w.f.git.pushes(), [BRANCH]);
    assert!(w.kinds(1).contains(&EventKind::BaseMerged));
}

#[test]
fn a_conflict_with_the_base_goes_back_to_the_agent_then_publishes() {
    let w = World::started();
    w.f.git.queue_base_update(BaseUpdate::Conflict(vec![
        "src/app.rs".into(),
        "README.md".into(),
    ]));
    w.agent_finishes();
    w.engine.tick();
    assert!(w.f.git.pushes().is_empty(), "nothing conflicting is pushed");
    assert_eq!(w.mode(), "resume", "the coder's own conversation");
    let prompt = w.prompt();
    for part in ["src/app.rs", "README.md", "git merge origin/main"] {
        assert!(prompt.contains(part), "{part:?} missing from {prompt}");
    }

    w.agent_finishes();
    w.engine.tick();
    assert_eq!(w.f.git.pushes(), [BRANCH]);
    assert_eq!(w.state(1), TaskState::Working);
}

#[test]
fn a_conflict_the_agent_cannot_resolve_needs_you() {
    let w = World::started();
    let conflict = BaseUpdate::Conflict(vec!["src/app.rs".into()]);
    w.f.git.queue_base_update(conflict.clone());
    w.f.git.queue_base_update(conflict);
    w.agent_finishes();
    w.engine.tick();
    w.agent_finishes();
    w.engine.tick();

    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    let question = task.question.unwrap();
    assert!(
        question.starts_with("Both sides changed src/app.rs"),
        "{question}"
    );
    assert_eq!(w.f.git.pushes(), Vec::<String>::new());
}

#[test]
fn conflict_markers_the_agent_committed_are_never_pushed() {
    let w = World::started();
    w.f.git
        .queue_base_update(BaseUpdate::Conflict(vec!["src/app.rs".into()]));
    w.agent_finishes();
    w.engine.tick();
    w.f.git.set_diff(
        "diff --git a/src/app.rs b/src/app.rs\n--- a/src/app.rs\n+++ b/src/app.rs\n\
         @@ -1 +1,5 @@\n+<<<<<<< HEAD\n+mine\n+=======\n+theirs\n+>>>>>>> origin/main\n",
    );
    w.agent_finishes();
    w.engine.tick();

    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    assert!(
        task.question
            .unwrap()
            .starts_with("Both sides changed src/app.rs"),
        "markers count as a conflict"
    );
    assert_eq!(w.f.git.pushes(), Vec::<String>::new());
}

#[test]
fn merge_removes_the_worktree_and_the_local_branch() {
    let w = World::ready();
    w.f.forge.fail_merges(Some("checks are failing"));
    w.shep.review(TaskId(1), ReviewAction::Merge).unwrap_err();
    assert!(w.f.git.removed().is_empty(), "nothing is removed unmerged");

    w.f.forge.fail_merges(None);
    w.shep.review(TaskId(1), ReviewAction::Merge).unwrap();
    assert_eq!(w.f.git.removed(), [WORKTREE]);
    assert_eq!(w.f.git.deleted(), [BRANCH]);
}
