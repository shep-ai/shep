use shep_app::ports::{EventLog, RunRepository};
use shep_domain::{
    AgentJob, EventKind, Run, RunStep, SessionId, TaskBranch, TaskEvent, TaskId, UnixTime, Worktree,
};
use shep_infra::SqliteStore;

fn store() -> (tempfile::TempDir, SqliteStore) {
    let dir = tempfile::tempdir().unwrap();
    let store = SqliteStore::open(&dir.path().join("shep2.db")).unwrap();
    (dir, store)
}

#[test]
fn a_run_round_trips_and_updates() {
    let (_dir, store) = store();
    assert_eq!(store.load_run(TaskId(1)).unwrap(), None);
    let mut run = Run::new(TaskId(1), UnixTime(10));
    store.save_run(&run).unwrap();
    assert_eq!(store.load_run(TaskId(1)).unwrap(), Some(run.clone()));

    run.worktree = Some(Worktree {
        path: "/wt/1".into(),
        branch: TaskBranch::for_task(TaskId(1), "Fix it"),
        base: "main".into(),
    });
    run.step = RunStep::Agent {
        job: AgentJob::FixCi {
            attempt: 2,
            checks: vec!["lint".into()],
        },
        session: Some(SessionId("s9".into())),
        interrupted: true,
    };
    run.ci_fixes = 2;
    run.not_before = Some(UnixTime(99));
    run.asked = Some("Which bucket?".into());
    run.review = Some("Fine.".into());
    store.save_run(&run).unwrap();
    assert_eq!(store.load_run(TaskId(1)).unwrap(), Some(run.clone()));
    run.step = RunStep::Done;
    store.save_run(&run).unwrap();
    assert_eq!(
        store.load_run(TaskId(1)).unwrap().unwrap().step,
        RunStep::Done
    );
}

#[test]
fn events_come_back_in_order_per_task() {
    let (_dir, store) = store();
    let event = |task, at, kind, detail: &str| TaskEvent {
        task_id: TaskId(task),
        at: UnixTime(at),
        kind,
        detail: detail.into(),
    };
    store
        .record(&event(1, 5, EventKind::CiFailed, "lint failed"))
        .unwrap();
    store.record(&event(2, 6, EventKind::Ready, "x")).unwrap();
    store
        .record(&event(1, 7, EventKind::CiGreen, "all checks pass"))
        .unwrap();
    assert_eq!(
        store.events(TaskId(1)).unwrap(),
        [
            event(1, 5, EventKind::CiFailed, "lint failed"),
            event(1, 7, EventKind::CiGreen, "all checks pass")
        ]
    );
}
