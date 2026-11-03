use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use shep_app::testing::Fakes;
use shep_app::{SettingsChange, Shep, ShepApi, StartOutcome, StartWhen};
use shep_domain::{AgentKind, ClockTime, ReviewAction, TaskId, TaskState};
use shep_rpc::{RemoteShep, RpcServer};

struct Daemon {
    _dir: tempfile::TempDir,
    socket: PathBuf,
    shep: Arc<Shep>,
}

fn daemon() -> Daemon {
    let dir = tempfile::tempdir().unwrap();
    let socket = dir.path().join("run").join("shep.sock");
    let shep = Arc::new(Shep::new(Fakes::default().ports()));
    shep.update_settings(SettingsChange {
        repo: Some("/code/app".into()),
        ..Default::default()
    })
    .unwrap();
    let server = RpcServer::new(shep.clone() as Arc<dyn ShepApi>);
    let listener = shep_jsonrpc::bind_private(&socket).unwrap();
    std::thread::spawn(move || server.serve(&listener));
    Daemon {
        _dir: dir,
        socket,
        shep,
    }
}

#[test]
fn each_action_round_trips_over_the_socket() {
    let d = daemon();
    let remote = RemoteShep::connect(&d.socket).unwrap();

    let added = remote
        .add("#412", Some(std::path::Path::new("/not/a/repo")))
        .unwrap();
    assert_eq!((added.id, added.state), (TaskId(1), TaskState::Queued));
    remote.add("Rate-limit /api/search", None).unwrap();

    let at = ClockTime::parse("22:30").unwrap();
    assert_eq!(
        remote.start(StartWhen::At(at)).unwrap(),
        StartOutcome::Scheduled { at, queued: 2 }
    );
    let StartOutcome::Started(started) = remote.start(StartWhen::Now).unwrap() else {
        panic!("expected Started");
    };
    assert_eq!(started.len(), 2);

    d.shep.finish(TaskId(1)).unwrap();
    let board = remote.board().unwrap();
    assert_eq!(board.ready.len(), 1);
    assert_eq!(
        board,
        d.shep.board().unwrap(),
        "the same board in and out of process"
    );

    let merged = remote.review(TaskId(1), ReviewAction::Merge).unwrap();
    assert_eq!(merged.state, TaskState::Merged);

    let settings = remote
        .update_settings(SettingsChange {
            agent: Some(AgentKind::Codex),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(settings.agent, Some(AgentKind::Codex));
    assert_eq!(remote.settings().unwrap(), settings);
}

#[test]
fn errors_reach_the_caller_with_the_daemons_words() {
    let d = daemon();
    let remote = RemoteShep::connect(&d.socket).unwrap();
    let err = remote.review(TaskId(9), ReviewAction::Merge).unwrap_err();
    assert_eq!(err.to_string(), "no task 9");
    let err = remote.add("   ", None).unwrap_err();
    assert_eq!(err.to_string(), "a task needs a reference or a sentence");
}

#[test]
fn a_subscriber_gets_the_board_now_and_after_every_change() {
    let d = daemon();
    let mut changes = RemoteShep::subscribe(&d.socket).unwrap();
    assert_eq!(changes.current().queued.len(), 0);

    let remote = RemoteShep::connect(&d.socket).unwrap();
    remote.add("a", None).unwrap();
    assert_eq!(changes.wait().unwrap().queued.len(), 1);

    // A change made outside any request (the engine) arrives through the watcher.
    d.shep.add("b", None).unwrap();
    let board = changes.wait_within(Duration::from_secs(5)).unwrap();
    assert_eq!(board.map(|b| b.queued.len()), Some(2));
}
