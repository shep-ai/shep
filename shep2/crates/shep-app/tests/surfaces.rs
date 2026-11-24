//! What the surfaces read beyond the board: task detail, the morning brief, adding by label, and
//! watching or typing to a running agent.

mod support;

use std::time::Duration;

use shep_app::{AppError, StepView};
use support::*;

#[test]
fn a_working_task_shows_its_agent_live() {
    let w = World::started();
    let (id, _) = w.session();
    w.f.sessions.show(
        &id,
        Some(AgentStatus::Working),
        "● Read src/pages/index.tsx\n● Edit src/pages/index.tsx  +18 -2\n⠋ Herding commits…\n\n",
    );
    let d = w.shep.detail(TaskId(1)).unwrap();
    assert_eq!(d.task.title, "Fix login redirect loop");
    assert_eq!(d.step, StepView::Coding);
    assert_eq!(d.activity, "⠋ Herding commits…");
    assert!(d
        .screen
        .as_deref()
        .unwrap()
        .contains("Edit src/pages/index.tsx"));
    assert_eq!(d.branch.as_deref(), Some("shep/1-fix-login-redirect-loop"));
    assert_eq!(d.agent, Some(AgentKind::ClaudeCode));
    assert!(d.live);
}

#[test]
fn a_ready_task_shows_ci_proof_diff_and_the_second_opinion() {
    let w = World::reviewing();
    w.f.files.put("/tasks/1/review/review.md", "Looks correct.");
    w.f.files.put("/tasks/1/proof/tests.txt", "3 passed");
    w.f.files.put("/tasks/1/proof/login.png", "PNG");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();

    let d = w.shep.detail(TaskId(1)).unwrap();
    assert_eq!(d.step, StepView::Ready);
    assert_eq!(d.activity, "ready · CI green");
    assert_eq!(d.checks, [check("build", CheckState::Passed)]);
    assert_eq!(d.review.as_deref(), Some("Looks correct."));
    assert_eq!(
        d.proof,
        ["/tasks/1/proof/login.png", "/tasks/1/proof/tests.txt"]
    );
    assert_eq!(
        (d.stat.files, d.stat.added, d.stat.removed),
        (1, 1, 1),
        "from ` src/app.rs | 2 +-`"
    );
    assert!(d.diff.as_deref().unwrap().contains("diff of shep/1"));
    assert!(!d.live);
    assert!(d.events.iter().any(|e| e.kind == EventKind::Ready));
}

#[test]
fn queued_parked_and_waiting_tasks_say_so_in_a_line() {
    let w = world();
    w.shep.add("a sentence", None).unwrap();
    assert_eq!(w.shep.detail(TaskId(1)).unwrap().activity, "queued");

    let w = World::started();
    w.f.agents.get(AgentKind::ClaudeCode).on_screen(
        "session limit",
        AgentStatus::UsageLimit {
            resets: ResetAt::InSeconds(3600),
        },
    );
    w.f.sessions.show(
        &w.session().0,
        None,
        "You've hit your session limit · resets 3pm",
    );
    w.engine.tick();
    let d = w.shep.detail(TaskId(1)).unwrap();
    assert_eq!(d.step, StepView::Parked);
    // START is 13:46:40 UTC; an hour later is 14:46.
    assert_eq!(d.activity, "parked until 14:46 · usage limit");

    let w = World::started();
    w.f.files.put("/tasks/1/question.md", "Which bucket?");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    assert_eq!(
        w.shep.detail(TaskId(1)).unwrap().activity,
        "needs you: Which bucket?"
    );
    assert!(matches!(
        w.shep.detail(TaskId(9)),
        Err(AppError::NotFound(TaskId(9)))
    ));
}

#[test]
fn the_brief_lists_the_night_and_comes_once_per_morning() {
    let w = World::reviewing();
    w.f.files.put("/tasks/1/proof/login.png", "PNG");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    w.shep.add("Store uploads", None).unwrap();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    w.f.files.put("/tasks/2/question.md", "Which bucket?");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();

    let brief = w
        .shep
        .morning_brief()
        .unwrap()
        .expect("news since last time");
    let lines: Vec<(i64, &str)> = brief
        .items
        .iter()
        .map(|i| (i.task.id.0, i.summary.as_str()))
        .collect();
    assert_eq!(
        lines,
        [
            (2, "needs you: Which bucket?"),
            (1, "CI green · +1 -1 · screenshot")
        ]
    );
    assert_eq!((brief.done, brief.total), (1, 2));
    assert_eq!(brief.mergeable, 1);
    assert_eq!(brief.green, [TaskId(1)]);
    assert!(brief.overnight.is_some());

    assert_eq!(
        w.shep.morning_brief().unwrap(),
        None,
        "once, until there is news"
    );
    assert_eq!(w.shep.brief().unwrap().items.len(), 2, "always on request");
}

#[test]
fn the_brief_says_what_ci_did_while_you_slept() {
    let w = World::started();
    w.agent_finishes();
    w.engine.tick();
    w.f.forge
        .queue_checks(vec![check("lint", CheckState::Failed)]);
    w.f.forge
        .queue_checks(vec![check("lint", CheckState::Passed)]);
    w.engine.tick();
    w.agent_finishes();
    w.engine.tick();
    w.engine.tick();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    let brief = w.shep.brief().unwrap();
    assert_eq!(brief.items[0].summary, "CI green · +1 -1 · fixed 1 failure");
    assert_eq!(
        brief.while_you_slept.as_deref(),
        Some("CI failed once overnight; Shep fixed it.")
    );
}

#[test]
fn adding_by_label_queues_each_open_issue_once() {
    let w = world();
    w.f.forge.add_issue(8, "Add CSV export", "");
    w.f.forge.label(&[7, 8], "shep");
    w.shep.add("#7", None).unwrap();
    let added = w.shep.add_label("shep", None).unwrap();
    assert_eq!(
        added.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(),
        ["Add CSV export"]
    );
    assert_eq!(w.shep.board().unwrap().queued.len(), 2);
    let again = w.shep.add("#7", None).unwrap();
    assert_eq!(
        again.id,
        TaskId(1),
        "an issue already on the board is not added twice"
    );
}

#[test]
fn a_running_agent_can_be_watched_and_typed_to() {
    let w = World::started();
    let (id, _) = w.session();
    w.f.sessions.show(&id, None, "ready for input");
    let mut view = w.shep.watch_agent(TaskId(1)).unwrap();
    assert_eq!(view.screen(), b"ready for input");
    w.f.sessions.emit(&id, b"more output");
    assert_eq!(
        view.next_output(Duration::from_millis(10))
            .unwrap()
            .as_deref(),
        Some(&b"more output"[..])
    );
    w.shep.send_to_agent(TaskId(1), b"yes\r").unwrap();
    assert_eq!(w.f.sessions.typed(&id), b"yes\r");

    w.shep.add("not started", None).unwrap();
    assert!(matches!(
        w.shep.watch_agent(TaskId(2)),
        Err(AppError::NotReady(_))
    ));
}

#[test]
fn detail_carries_the_same_one_line_summary_as_the_brief() {
    let w = World::reviewing();
    w.f.files.put("/tasks/1/proof/login.png", "PNG");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    let d = w.shep.detail(TaskId(1)).unwrap();
    assert_eq!(d.summary, "CI green · +1 -1 · screenshot");
    assert_eq!(w.shep.brief().unwrap().items[0].summary, d.summary);
}

#[test]
fn setup_says_what_is_installed_signed_in_and_where_work_happens() {
    let w = world();
    w.f.agents.get(AgentKind::Codex).set_installed(false);
    w.f.forge.add_issue(8, "Add CSV export", "");
    w.f.forge.sign_in(Some("ariel"));
    let s = w.shep.setup(None).unwrap();
    let agents: Vec<(AgentKind, &str, bool, bool)> = s
        .agents
        .iter()
        .map(|a| (a.kind, a.name.as_str(), a.installed, a.chosen))
        .collect();
    assert_eq!(
        agents,
        [
            (AgentKind::ClaudeCode, "Claude Code", true, true),
            (AgentKind::Codex, "Codex", false, false),
            (AgentKind::Gemini, "Gemini CLI", true, false)
        ]
    );
    assert_eq!(s.github.as_deref(), Some("ariel"));
    let repo = s.repo.unwrap();
    assert_eq!(
        (repo.path.as_str(), repo.slug.as_deref(), repo.clean),
        (REPO, Some("acme/app"), true)
    );
    assert_eq!(
        s.suggestions.iter().map(|i| i.number).collect::<Vec<_>>(),
        [7, 8]
    );
    assert!(s.ready);

    w.f.forge.sign_in(None);
    let s = w.shep.setup(None).unwrap();
    assert_eq!((s.github, s.ready), (None, false));
}

#[test]
fn each_agent_says_how_to_install_it() {
    let w = world();
    let s = w.shep.setup(None).unwrap();
    assert!(s.agents.iter().all(|a| !a.install.is_empty()));
}
