//! Shifts: filling free slots, the scheduled start, and what starting needs.

mod support;

use support::*;

#[test]
fn free_slots_fill_from_the_queue_during_a_shift() {
    let w = world();
    w.shep
        .update_settings(SettingsChange {
            parallelism: Some(1),
            ..Default::default()
        })
        .unwrap();
    w.shep.add("First thing", None).unwrap();
    w.shep.add("Second thing", None).unwrap();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    assert_eq!(
        (w.state(1), w.state(2)),
        (TaskState::Working, TaskState::Queued)
    );
    w.agent_finishes();
    w.engine.tick();
    w.f.forge
        .queue_checks(vec![check("build", CheckState::Passed)]);
    w.engine.tick();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Ready);
    w.engine.tick();
    assert_eq!(
        w.state(2),
        TaskState::Working,
        "the next one starts by itself"
    );
    assert_eq!(
        w.f.git.worktrees().last().unwrap().branch.as_str(),
        "shep/2-second-thing"
    );
}

#[test]
fn queued_work_waits_for_a_shift() {
    let w = world();
    w.shep.add("a", None).unwrap();
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Queued);
    assert_eq!(w.f.sessions.spawned().len(), 0);
    assert!(!w.f.awake.is_held());
}

#[test]
fn the_shift_starts_by_itself_at_the_set_local_time() {
    let w = world();
    // START is 13:46:40 UTC; at UTC+2 the local time is 15:46:40.
    w.f.clock.set_utc_offset(2 * 3600);
    w.shep.add("a", None).unwrap();
    w.shep
        .start(StartWhen::At(ClockTime {
            hour: 15,
            minute: 47,
        }))
        .unwrap();
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Queued);
    w.f.clock.advance(20);
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Working);
}

#[test]
fn starting_needs_a_repository_and_an_agent() {
    let f = Fakes::default();
    let shep = Shep::new(f.ports());
    shep.add("a", None).unwrap();
    let err = shep.start(StartWhen::Now).unwrap_err();
    assert!(err.to_string().contains("shep config --repo"), "{err}");

    shep.update_settings(SettingsChange {
        repo: Some(REPO.into()),
        ..Default::default()
    })
    .unwrap();
    for kind in AgentKind::ALL {
        f.agents.get(kind).set_installed(false);
    }
    let err = shep.start(StartWhen::Now).unwrap_err();
    assert!(err.to_string().contains("claude-code"), "{err}");

    f.agents.get(AgentKind::Codex).set_installed(true);
    shep.start(StartWhen::Now).unwrap();
    assert_eq!(shep.settings().unwrap().agent, Some(AgentKind::Codex));
}

#[test]
fn adding_from_inside_a_repository_points_shep_at_it() {
    let f = Fakes::default();
    f.git.add_repo(REPO);
    let shep = Shep::new(f.ports());
    shep.add("a", Some(Path::new("/elsewhere"))).unwrap();
    assert_eq!(shep.settings().unwrap().repo, None);
    shep.add("b", Some(Path::new("/code/app/src"))).unwrap();
    assert_eq!(shep.settings().unwrap().repo.as_deref(), Some(REPO));
    f.git.add_repo("/code/other");
    shep.add("c", Some(Path::new("/code/other"))).unwrap();
    assert_eq!(
        shep.settings().unwrap().repo.as_deref(),
        Some(REPO),
        "a chosen repository stays"
    );
}
