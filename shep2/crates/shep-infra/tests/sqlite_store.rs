use shep_app::{SettingsRepository, TaskRepository};
use shep_domain::{
    AgentKind, ClockTime, ReviewAction, Settings, TaskId, TaskSourceRef, TaskState, UnixTime,
};
use shep_infra::SqliteStore;

fn temp_store() -> (tempfile::TempDir, SqliteStore) {
    let dir = tempfile::tempdir().unwrap();
    let store = SqliteStore::open(&dir.path().join("shep2.db")).unwrap();
    (dir, store)
}

#[test]
fn created_tasks_get_increasing_ids_and_read_back_whole() {
    let (_dir, store) = temp_store();
    let a = store
        .create(TaskSourceRef::parse("acme/web#12").unwrap(), UnixTime(10))
        .unwrap();
    let b = store
        .create(
            TaskSourceRef::parse("https://linear.app/acme/issue/ENG-1/x").unwrap(),
            UnixTime(11),
        )
        .unwrap();
    assert!(b.id > a.id);
    assert_eq!(store.get(a.id).unwrap(), Some(a.clone()));
    assert_eq!(store.list().unwrap(), vec![a, b]);
    assert_eq!(store.get(TaskId(99)).unwrap(), None);
}

#[test]
fn saved_changes_round_trip_every_field() {
    let (_dir, store) = temp_store();
    let mut t = store
        .create(
            TaskSourceRef::parse("Fix the coupon bug").unwrap(),
            UnixTime(10),
        )
        .unwrap();
    t.move_to(TaskState::Working, UnixTime(20)).unwrap();
    t.ask("Which bucket?", UnixTime(30)).unwrap();
    store.save(&t).unwrap();
    assert_eq!(store.get(t.id).unwrap().unwrap(), t);
    t.review(
        ReviewAction::Answer {
            text: "prod".into(),
        },
        UnixTime(40),
    )
    .unwrap();
    t.title = "Fix coupon checkout on Safari".into();
    store.save(&t).unwrap();
    assert_eq!(store.get(t.id).unwrap().unwrap(), t);
}

#[test]
fn every_state_is_stored_and_read_back() {
    let (_dir, store) = temp_store();
    let mut t = store
        .create(TaskSourceRef::parse("x").unwrap(), UnixTime(1))
        .unwrap();
    for state in TaskState::ALL {
        t.state = state;
        store.save(&t).unwrap();
        assert_eq!(store.get(t.id).unwrap().unwrap().state, state);
    }
}

#[test]
fn settings_default_until_saved_then_persist() {
    let (_dir, store) = temp_store();
    assert_eq!(store.load_settings().unwrap(), Settings::default());
    let s = Settings {
        agent: Some(AgentKind::ClaudeCode),
        shift_start: ClockTime::parse("22:15").unwrap(),
        parallelism: 4,
    };
    store.save_settings(&s).unwrap();
    assert_eq!(store.load_settings().unwrap(), s);
}

#[test]
fn reopening_keeps_everything() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("shep2.db");
    let t = {
        let store = SqliteStore::open(&path).unwrap();
        store
            .save_settings(&Settings {
                parallelism: 6,
                ..Settings::default()
            })
            .unwrap();
        store
            .create(TaskSourceRef::parse("#7").unwrap(), UnixTime(5))
            .unwrap()
    };
    let store = SqliteStore::open(&path).unwrap();
    assert_eq!(store.list().unwrap(), vec![t]);
    assert_eq!(store.load_settings().unwrap().parallelism, 6);
}
