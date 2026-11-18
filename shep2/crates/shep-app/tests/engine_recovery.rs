//! The engine when things go wrong: questions, usage limits, lost sessions, crashes, restarts.

mod support;

use support::*;

#[test]
fn a_question_waits_for_the_answer_then_resumes_with_it() {
    let w = World::started();
    w.f.files
        .put("/tasks/1/question.md", "Which bucket, prod or staging?");
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    assert_eq!(
        task.question.as_deref(),
        Some("Which bucket, prod or staging?")
    );
    assert_eq!(
        w.f.files.get("/tasks/1/question.md"),
        None,
        "a question is asked once"
    );

    w.engine.tick();
    assert_eq!(
        w.f.sessions.spawned().len(),
        1,
        "nothing runs while it needs you"
    );

    w.shep
        .review(
            TaskId(1),
            ReviewAction::Answer {
                text: "prod".into(),
            },
        )
        .unwrap();
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 2);
    assert_eq!(w.mode(), "resume");
    let prompt = w.prompt();
    assert!(
        prompt.contains("Which bucket, prod or staging?"),
        "{prompt}"
    );
    assert!(prompt.contains("prod"), "{prompt}");
}

#[test]
fn a_usage_limit_parks_the_task_until_the_reset_then_resumes() {
    let w = World::started();
    w.f.agents.get(AgentKind::ClaudeCode).on_screen(
        "session limit",
        AgentStatus::UsageLimit {
            resets: ResetAt::InSeconds(600),
        },
    );
    let first = w.session().0;
    w.f.sessions.show(
        &first,
        None,
        "You've hit your session limit · resets 3:45pm",
    );
    w.engine.tick();
    assert_eq!(w.f.sessions.killed(), [first]);
    assert_eq!(
        w.state(1),
        TaskState::Working,
        "parked work is still Working"
    );
    assert!(w.kinds(1).contains(&EventKind::Parked));

    w.f.clock.advance(599);
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 1, "waits for the reset");
    w.f.clock.advance(2);
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 2);
    assert_eq!(w.mode(), "resume");
    assert!(w.prompt().contains("interrupted"), "{}", w.prompt());
}

#[test]
fn a_usage_limit_reported_over_osc_or_at_exit_parks_too() {
    let w = World::started();
    w.f.sessions.set(
        &w.session().0,
        shep_app::ports::SessionState::Exited {
            code: Some(1),
            status: Some(AgentStatus::UsageLimit {
                resets: ResetAt::TimeOfDay(ClockTime {
                    hour: 0,
                    minute: 30,
                }),
            }),
            screen: String::new(),
        },
    );
    w.engine.tick();
    assert!(w.kinds(1).contains(&EventKind::Parked));
    // START is 1970-01-12 13:46:40 UTC, so 00:30 comes 10h43m20s later.
    w.f.clock.advance(10 * 3600 + 43 * 60 + 19);
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 1);
    w.f.clock.advance(2);
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 2);
}

#[test]
fn a_lost_session_is_resumed_where_it_stopped() {
    let w = World::started();
    w.f.sessions.lose_all();
    w.engine.tick();
    assert_eq!(w.f.sessions.spawned().len(), 2);
    assert_eq!(w.mode(), "resume");
    assert!(w.kinds(1).contains(&EventKind::Interrupted));
}

#[test]
fn an_agent_that_keeps_crashing_ends_up_needing_you() {
    let w = World::started();
    for _ in 0..3 {
        w.f.sessions
            .exit(&w.session().0, 1, "Error: something broke\nat line 3");
        w.engine.tick();
    }
    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    assert!(task.question.unwrap().contains("something broke"));
    assert_eq!(
        w.f.sessions.spawned().len(),
        3,
        "two retries, then a person"
    );
}

#[test]
fn an_agent_that_changes_nothing_needs_you() {
    let w = World::started();
    w.f.sessions.exit(&w.session().0, 0, "all good");
    w.engine.tick();
    let task = w.task(1);
    assert_eq!(task.state, TaskState::NeedsYou);
    assert!(task.question.unwrap().contains("without changing"));
    assert_eq!(w.f.git.pushes().len(), 0);
}

#[test]
fn a_restarted_engine_carries_on_with_the_same_session() {
    let w = World::started();
    let again = Engine::new(w.shep.clone(), w.f.ports(), config());
    again.tick();
    assert_eq!(
        w.f.sessions.spawned().len(),
        1,
        "the running agent is not started twice"
    );
    w.agent_finishes();
    again.tick();
    assert_eq!(w.f.git.pushes().len(), 1);
}
