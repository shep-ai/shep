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

#[test]
fn events_of_one_kind_come_from_every_task_even_deleted_ones() {
    use shep_app::TaskRepository;
    use shep_domain::TaskSourceRef;
    let (_dir, store) = store();
    let task = store
        .create(TaskSourceRef::parse("#7").unwrap(), UnixTime(1))
        .unwrap();
    let event = |task: TaskId, at, kind, detail: &str| TaskEvent {
        task_id: task,
        at: UnixTime(at),
        kind,
        detail: detail.into(),
    };
    let stopped = event(task.id, 5, EventKind::Stopped, "Fix it — issue closed");
    store.record(&stopped).unwrap();
    store
        .record(&event(task.id, 6, EventKind::Ready, "x"))
        .unwrap();
    store.delete(task.id).unwrap();

    assert_eq!(store.get(task.id).unwrap(), None);
    assert_eq!(store.list().unwrap(), Vec::new());
    assert_eq!(store.events(task.id).unwrap().len(), 2, "events stay");
    let stopped = vec![stopped];
    assert_eq!(store.of_kind(EventKind::Stopped, None).unwrap(), stopped);
    assert_eq!(
        store
            .of_kind(EventKind::Stopped, Some(UnixTime(4)))
            .unwrap(),
        stopped
    );
    assert_eq!(
        store
            .of_kind(EventKind::Stopped, Some(UnixTime(5)))
            .unwrap(),
        Vec::new()
    );
    let next = store
        .create(TaskSourceRef::parse("#7").unwrap(), UnixTime(9))
        .unwrap();
    assert!(next.id > task.id, "a deleted task's id is never reused");
}

#[test]
fn marks_are_remembered_and_moved() {
    use shep_app::ports::{Mark, Marks};
    let (_dir, store) = store();
    assert_eq!(store.mark(Mark::BriefSeen).unwrap(), None);
    for at in [10, 20] {
        store.set_mark(Mark::BriefSeen, UnixTime(at)).unwrap();
        assert_eq!(store.mark(Mark::BriefSeen).unwrap(), Some(UnixTime(at)));
    }
    assert_eq!(store.mark(Mark::SplashSeen).unwrap(), None);
    assert_eq!(
        shep_app::SettingsRepository::load_settings(&store).unwrap(),
        shep_domain::Settings::default(),
        "marks never touch settings"
    );
}
