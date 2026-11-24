//! The engine's main road: worktree, agent, draft PR, CI fixes, second opinion, Ready, merge.

mod support;

use support::*;

#[test]
fn the_first_tick_reads_the_issue_makes_a_worktree_and_starts_the_agent() {
    let w = World::started();
    let task = w.task(1);
    assert_eq!(
        task.title, "Fix login redirect loop",
        "the title comes from the issue"
    );
    let wt = w.f.git.worktrees();
    assert_eq!(wt.len(), 1);
    assert_eq!(wt[0].branch.as_str(), "shep/1-fix-login-redirect-loop");

    let (_, spec) = w.session();
    assert_eq!(spec.cwd, Path::new(&wt[0].path));
    assert_eq!(w.mode(), "new");
    let prompt = w.prompt();
    assert!(prompt.contains("Fix login redirect loop"), "{prompt}");
    assert!(prompt.contains("Users land on /login again."), "{prompt}");
    assert!(prompt.contains("/tasks/1/question.md"), "{prompt}");
    assert!(prompt.contains("Do not push"), "{prompt}");
    assert_eq!(
        w.env(AGENT_ENV_QUESTION_FILE).as_deref(),
        Some("/tasks/1/question.md")
    );
    assert_eq!(
        w.env(AGENT_ENV_PROOF_DIR).as_deref(),
        Some("/tasks/1/proof")
    );
    assert_eq!(w.f.agents.asked(), [AgentKind::ClaudeCode]);
    assert!(
        w.f.awake.is_held(),
        "the machine stays awake while a task works"
    );

    w.engine.tick();
    assert_eq!(
        w.f.sessions.spawned().len(),
        1,
        "a running agent is left alone"
    );
}

#[test]
fn a_finished_agent_gets_a_pushed_branch_and_a_draft_pr() {
    let w = World::started();
    w.agent_finishes();
    w.engine.tick();
    assert_eq!(w.f.git.commits(), ["Fix login redirect loop"]);
    assert_eq!(w.f.git.pushes(), ["shep/1-fix-login-redirect-loop"]);
    let opened = w.f.forge.opened();
    assert_eq!(opened.len(), 1);
    assert_eq!(opened[0].0, "Fix login redirect loop");
    assert!(opened[0].1.contains("Closes #7"), "{}", opened[0].1);
    let task = w.task(1);
    assert_eq!(
        task.state,
        TaskState::Working,
        "Working until CI and the review are done"
    );
    assert_eq!(task.pr.unwrap().number, 101);
}

#[test]
fn green_ci_brings_a_second_opinion_then_ready_with_proof() {
    let w = World::reviewing();
    let (_, spec) = w.session();
    assert_eq!(spec.cwd, Path::new("/tasks/1/review"));
    assert_eq!(w.mode(), "new", "the reviewer is a separate conversation");
    assert_eq!(
        w.f.files.get("/tasks/1/review/diff.patch").as_deref(),
        Some("diff of shep/1-fix-login-redirect-loop")
    );
    assert_eq!(
        w.env(AGENT_ENV_REVIEW_FILE).as_deref(),
        Some("/tasks/1/review/review.md")
    );
    assert_eq!(w.state(1), TaskState::Working);

    w.f.files.put(
        "/tasks/1/review/review.md",
        "Looks correct; one naming nit.",
    );
    w.f.files
        .put("/tasks/1/proof/tests.txt", "$ cargo test\n48 passed");
    w.f.files.put("/tasks/1/proof/login.png", "PNG");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();

    assert_eq!(w.state(1), TaskState::Ready);
    let body = w.f.forge.bodies().last().cloned().unwrap();
    for part in [
        "Closes #7",
        "Looks correct; one naming nit.",
        "48 passed",
        "src/app.rs",
        "https://github.com/acme/app/blob/abc123/login.png?raw=true",
        "Shep opens drafts only",
    ] {
        assert!(body.contains(part), "{part:?} missing from:\n{body}");
    }
    assert_eq!(w.f.git.published()[0].0, "shep/proof/1");
    assert!(
        !w.f.awake.is_held(),
        "nothing works, so the machine may sleep"
    );
    assert!(w
        .kinds(1)
        .ends_with(&[EventKind::Reviewed, EventKind::Ready]));
}

#[test]
fn red_ci_goes_back_to_the_same_conversation_three_times_then_needs_you() {
    let w = World::started();
    w.agent_finishes();
    w.engine.tick();
    w.f.forge.queue_checks(vec![
        check("build", CheckState::Passed),
        check("lint", CheckState::Failed),
    ]);
    for attempt in 1..=3 {
        w.engine.tick();
        assert_eq!(w.mode(), "resume", "attempt {attempt}");
        let prompt = w.prompt();
        assert!(prompt.contains("lint"), "{prompt}");
        assert!(
            prompt.contains(&format!("/tasks/1/ci-{attempt}.log")),
            "{prompt}"
        );
        assert_eq!(
            w.f.files
                .get(format!("/tasks/1/ci-{attempt}.log"))
                .as_deref(),
            Some("log of lint")
        );
        w.agent_finishes();
        w.engine.tick();
        assert_eq!(w.f.git.pushes().len(), attempt + 1);
    }
    w.engine.tick();
    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    let question = task.question.unwrap();
    assert!(question.contains("lint"), "{question}");
    assert!(question.contains('3'), "{question}");
    assert_eq!(w.f.forge.opened().len(), 1, "one PR for all the fixes");
}

#[test]
fn send_back_revises_on_the_same_pr() {
    let w = World::reviewing();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Ready);

    w.shep
        .review(
            TaskId(1),
            ReviewAction::SendBack {
                note: "also handle /signup".into(),
            },
        )
        .unwrap();
    w.engine.tick();
    assert_eq!(w.mode(), "resume");
    assert!(w.prompt().contains("also handle /signup"));
    w.agent_finishes();
    w.engine.tick();
    assert_eq!(w.f.git.pushes().len(), 2);
    assert_eq!(w.f.forge.opened().len(), 1);
    assert!(w.kinds(1).contains(&EventKind::Pushed));
}

#[test]
fn merge_merges_the_pull_request_or_says_why_not() {
    let w = World::reviewing();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    w.f.forge
        .fail_merges(Some("base branch policy prohibits the merge"));
    let err = w.shep.review(TaskId(1), ReviewAction::Merge).unwrap_err();
    assert!(err.to_string().contains("prohibits"), "{err}");
    assert_eq!(w.state(1), TaskState::Ready);

    w.f.forge.fail_merges(None);
    w.shep.review(TaskId(1), ReviewAction::Merge).unwrap();
    assert_eq!(w.state(1), TaskState::Merged);
    assert_eq!(w.f.forge.merged()[0].number, 101);
}
