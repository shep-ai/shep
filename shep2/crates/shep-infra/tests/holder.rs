//! The PTY holder with real processes in real terminals.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use shep_app::ports::{AgentSessions, SessionSpec, SessionState};
use shep_domain::{AgentStatus, BlockKind, SessionId};
use shep_infra::holder::{self, Attach};
use shep_infra::HolderSessions;

const WAIT: Duration = Duration::from_secs(10);

struct Holder {
    dir: tempfile::TempDir,
    sessions: HolderSessions,
    launches: Arc<Mutex<u32>>,
}

/// A holder served from a thread of this test, started by the client on first use.
fn holder() -> Holder {
    let dir = tempfile::tempdir().unwrap();
    let socket = dir.path().join("run").join("holder.sock");
    let launches = Arc::new(Mutex::new(0));
    let (s, l) = (socket.clone(), launches.clone());
    let sessions = HolderSessions::new(
        socket,
        Box::new(move || {
            *l.lock().unwrap() += 1;
            let listener = shep_jsonrpc::bind_private(&s)?;
            std::thread::spawn(move || holder::serve(&listener));
            Ok(())
        }),
    );
    Holder {
        dir,
        sessions,
        launches,
    }
}

impl Holder {
    fn spawn(&self, script: &str) -> SessionId {
        self.sessions
            .spawn(&SessionSpec {
                program: "sh".into(),
                args: vec!["-c".into(), script.into()],
                cwd: self.dir.path().to_path_buf(),
                env: vec![("GREETING".into(), "hello from env".into())],
                log: self.log(),
            })
            .unwrap()
    }
    fn log(&self) -> PathBuf {
        self.dir.path().join("logs").join("agent.log")
    }
    fn wait_for(&self, id: &SessionId, ok: impl Fn(&SessionState) -> bool) -> SessionState {
        let deadline = Instant::now() + WAIT;
        loop {
            let state = self.sessions.poll(id).unwrap();
            if ok(&state) {
                return state;
            }
            assert!(
                Instant::now() < deadline,
                "gave up waiting; last: {state:?}"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    fn socket(&self) -> PathBuf {
        self.dir.path().join("run").join("holder.sock")
    }
}

fn screen(state: &SessionState) -> &str {
    match state {
        SessionState::Running { screen, .. } | SessionState::Exited { screen, .. } => screen,
        SessionState::Lost => "",
    }
}

#[test]
fn a_session_reports_over_osc_and_shows_its_screen() {
    let h = holder();
    let id = h.spawn(
        "echo \"$GREETING\"; printf '\\033]7501;state=working\\033\\\\'; \
         printf '\\033]7501;state=blocked:kind=question:msg=V2hpY2g/\\007'; sleep 30",
    );
    let state = h.wait_for(&id, |s| {
        matches!(
            s,
            SessionState::Running {
                status: Some(AgentStatus::Blocked { .. }),
                ..
            }
        )
    });
    assert_eq!(
        state,
        SessionState::Running {
            status: Some(AgentStatus::Blocked {
                kind: Some(BlockKind::Question),
                message: Some("Which?".into())
            }),
            screen: screen(&state).to_owned(),
        }
    );
    assert!(screen(&state).contains("hello from env"), "{state:?}");
    assert_eq!(
        *h.launches.lock().unwrap(),
        1,
        "the client started the holder"
    );

    h.sessions.kill(&id).unwrap();
    let ended = h.wait_for(&id, |s| matches!(s, SessionState::Exited { .. }));
    assert!(matches!(ended, SessionState::Exited { .. }));
}

#[test]
fn an_exit_code_and_everything_printed_are_kept() {
    let h = holder();
    let id = h.spawn("echo working on it; echo done now; exit 3");
    let state = h.wait_for(&id, |s| matches!(s, SessionState::Exited { .. }));
    let SessionState::Exited { code, screen, .. } = state else {
        unreachable!()
    };
    assert_eq!(code, Some(3));
    assert!(screen.contains("done now"), "{screen}");
    let log = std::fs::read_to_string(h.log()).unwrap();
    assert!(
        log.contains("working on it") && log.contains("done now"),
        "{log}"
    );
}

#[test]
fn a_session_the_holder_does_not_know_is_lost() {
    let h = holder();
    h.spawn("true");
    assert_eq!(
        h.sessions.poll(&SessionId("nope".into())).unwrap(),
        SessionState::Lost
    );
}

#[test]
fn attaching_shows_the_screen_streams_output_and_takes_input() {
    let h = holder();
    let id = h.spawn("echo ready; read line; echo \"got:$line\"; sleep 1");
    h.wait_for(&id, |s| screen(s).contains("ready"));

    let mut attach = Attach::open(&h.socket(), &id).unwrap();
    assert!(String::from_utf8_lossy(attach.screen()).contains("ready"));
    attach.send(b"typed\r").unwrap();
    let mut seen = String::new();
    let deadline = Instant::now() + WAIT;
    while !seen.contains("got:typed") {
        assert!(Instant::now() < deadline, "no echo; saw {seen:?}");
        if let Some(bytes) = attach.next_output(Duration::from_millis(200)).unwrap() {
            seen.push_str(&String::from_utf8_lossy(&bytes));
        }
    }
}

#[test]
fn spawning_a_missing_program_is_an_error_not_a_crash() {
    let h = holder();
    let err = h
        .sessions
        .spawn(&SessionSpec {
            program: "/no/such/agent".into(),
            args: vec![],
            cwd: h.dir.path().to_path_buf(),
            env: vec![],
            log: h.log(),
        })
        .unwrap_err();
    assert!(err.to_string().contains("/no/such/agent"), "{err}");
    let id = h.spawn("true");
    h.wait_for(&id, |s| {
        matches!(s, SessionState::Exited { code: Some(0), .. })
    });
}
