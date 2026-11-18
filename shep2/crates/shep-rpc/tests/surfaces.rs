//! The surface calls beyond the four actions, over the socket.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use shep_app::ports::{AgentSessions, RunRepository, SessionSpec};
use shep_app::testing::Fakes;
use shep_app::{SettingsChange, Shep, ShepApi, StepView};
use shep_domain::{AgentJob, Run, RunStep, TaskId, UnixTime};
use shep_rpc::{RemoteShep, RpcServer};

struct Daemon {
    _dir: tempfile::TempDir,
    socket: PathBuf,
    fakes: Fakes,
}

fn daemon() -> Daemon {
    let dir = tempfile::tempdir().unwrap();
    let socket = dir.path().join("run").join("shep.sock");
    let fakes = Fakes::default();
    fakes.git.add_repo("/code/app");
    let shep = Arc::new(Shep::new(fakes.ports()));
    shep.update_settings(SettingsChange {
        repo: Some("/code/app".into()),
        ..Default::default()
    })
    .unwrap();
    let server = RpcServer::new(shep as Arc<dyn ShepApi>);
    let listener = shep_jsonrpc::bind_private(&socket).unwrap();
    std::thread::spawn(move || server.serve(&listener));
    Daemon {
        _dir: dir,
        socket,
        fakes,
    }
}

#[test]
fn detail_brief_first_run_and_add_by_label_round_trip() {
    let d = daemon();
    let remote = RemoteShep::connect(&d.socket).unwrap();
    d.fakes.forge.add_issue(4, "Fix login", "");
    d.fakes.forge.label(&[4], "shep");

    let added = remote.add_label("shep", None).unwrap();
    assert_eq!(added[0].title, "Fix login");
    let detail = remote.detail(added[0].id).unwrap();
    assert_eq!(
        (detail.step, detail.activity.as_str()),
        (StepView::Queued, "queued")
    );
    assert_eq!(remote.brief().unwrap().total, 0);
    assert_eq!(remote.morning_brief().unwrap(), None);
    assert!(remote.first_run_today().unwrap());
    assert!(!remote.first_run_today().unwrap());
    assert_eq!(
        remote.detail(TaskId(9)).unwrap_err().to_string(),
        "no task 9"
    );
}

#[test]
fn an_agent_is_watched_and_typed_to_through_the_daemon() {
    let d = daemon();
    let remote = RemoteShep::connect(&d.socket).unwrap();
    let task = remote.add("Fix it", None).unwrap();
    let session = d
        .fakes
        .sessions
        .spawn(&SessionSpec {
            program: "agent".into(),
            args: vec![],
            cwd: "/".into(),
            env: vec![],
            log: "/log".into(),
        })
        .unwrap();
    d.fakes
        .sessions
        .show(&session, None, "hello from the agent");
    let mut run = Run::new(task.id, UnixTime(1));
    run.step = RunStep::Agent {
        job: AgentJob::Code,
        session: Some(session.clone()),
        interrupted: false,
    };
    d.fakes.runs.save_run(&run).unwrap();

    let mut view = remote.watch_agent(task.id).unwrap();
    assert_eq!(view.screen(), b"hello from the agent");
    d.fakes.sessions.emit(&session, b"\x1b[1mmore\x1b[0m");
    let mut seen = None;
    for _ in 0..50 {
        seen = view.next_output(Duration::from_millis(100)).unwrap();
        if seen.is_some() {
            break;
        }
    }
    assert_eq!(seen.as_deref(), Some(&b"\x1b[1mmore\x1b[0m"[..]));

    remote.send_to_agent(task.id, b"yes\r").unwrap();
    assert_eq!(d.fakes.sessions.typed(&session), b"yes\r");

    let other = remote.add("Not started", None).unwrap();
    let err = remote.watch_agent(other.id).err().unwrap();
    assert!(err.to_string().contains("no agent running"), "{err}");
}

#[test]
fn sources_connect_list_offer_and_disconnect_through_the_daemon() {
    use std::collections::BTreeMap;

    use shep_app::ports::HandOver;
    use shep_app::testing::FAKE_TOKEN_KEY;
    use shep_domain::{SourceKind, TaskSourceRef};

    let d = daemon();
    let remote = RemoteShep::connect(&d.socket).unwrap();
    assert!(remote.sources().unwrap().iter().all(|s| !s.connected));

    let values = BTreeMap::from([(FAKE_TOKEN_KEY.to_owned(), "lin_api_123".to_owned())]);
    let status = remote.connect_source(SourceKind::Linear, &values).unwrap();
    assert!(status.connected);
    assert_eq!(
        d.fakes.sources.token(SourceKind::Linear).as_deref(),
        Some("lin_api_123")
    );
    d.fakes.sources.get(SourceKind::Linear).offer(HandOver {
        source: TaskSourceRef::Linear {
            key: "ENG-351".into(),
        },
        title: "Export reports to CSV".into(),
        body: String::new(),
        url: "https://linear.app/acme/issue/ENG-351".into(),
    });
    let offered = remote.candidates(5).unwrap();
    assert_eq!(offered[0].item.title, "Export reports to CSV");

    remote.disconnect_source(SourceKind::Linear).unwrap();
    assert_eq!(d.fakes.sources.token(SourceKind::Linear), None);
    let err = remote
        .connect_source(SourceKind::Linear, &BTreeMap::new())
        .unwrap_err();
    assert!(err.to_string().contains("token"), "{err}");
}
