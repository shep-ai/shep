use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::Serialize;
use shep_app::ports::{AgentSessions, SessionError, SessionSpec, SessionState};
use shep_domain::SessionId;
use shep_jsonrpc::{Client, ClientError};

use super::protocol::{
    AttachReply, HolderMethod, IdParams, OutputParams, PollReply, SpawnParams, WriteParams, OUTPUT,
};
use crate::process::wait_until;

/// The holder gets this long to open its socket after being started.
const START_LIMIT: Duration = Duration::from_secs(10);

/// Starts a holder process (or, in tests, a holder thread).
pub type Launcher = Box<dyn Fn() -> std::io::Result<()> + Send + Sync>;

/// Agent sessions, kept by the holder. Starts the holder when none answers, and reconnects
/// when it restarts (its old sessions then read as lost).
pub struct HolderSessions {
    socket: PathBuf,
    launch: Launcher,
    client: Mutex<Option<Client>>,
}

impl HolderSessions {
    pub fn new(socket: impl Into<PathBuf>, launch: Launcher) -> Self {
        Self {
            socket: socket.into(),
            launch,
            client: Mutex::new(None),
        }
    }

    fn connect(&self) -> Result<Client, SessionError> {
        if let Ok(client) = Client::connect(&self.socket) {
            return Ok(client);
        }
        (self.launch)().map_err(|e| SessionError(format!("could not start the holder: {e}")))?;
        let mut client = None;
        wait_until(START_LIMIT, || {
            client = Client::connect(&self.socket).ok();
            client.is_some()
        });
        client.ok_or_else(|| SessionError("the holder did not start".into()))
    }

    fn lock(&self) -> MutexGuard<'_, Option<Client>> {
        self.client
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// One retry on a broken connection, so a holder restart is invisible to the caller.
    fn call<P: Serialize, R: DeserializeOwned>(
        &self,
        method: HolderMethod,
        params: &P,
    ) -> Result<R, SessionError> {
        let mut guard = self.lock();
        let mut last = SessionError("not tried".into());
        for _ in 0..2 {
            let client = match guard.as_mut() {
                Some(client) => client,
                None => guard.insert(self.connect()?),
            };
            match client.call(method.name(), params) {
                Ok(reply) => return Ok(reply),
                Err(ClientError::Rpc(e)) => return Err(SessionError(e.message)),
                Err(e) => {
                    last = SessionError(e.to_string());
                    *guard = None;
                }
            }
        }
        Err(last)
    }
}

impl AgentSessions for HolderSessions {
    fn spawn(&self, spec: &SessionSpec) -> Result<SessionId, SessionError> {
        let params = SpawnParams {
            program: spec.program.clone(),
            args: spec.args.clone(),
            cwd: spec.cwd.display().to_string(),
            env: spec.env.clone(),
            log: spec.log.display().to_string(),
        };
        let IdParams { id } = self.call(HolderMethod::Spawn, &params)?;
        Ok(SessionId(id))
    }

    fn poll(&self, session: &SessionId) -> Result<SessionState, SessionError> {
        let reply: PollReply = self.call(
            HolderMethod::Poll,
            &IdParams {
                id: session.0.clone(),
            },
        )?;
        Ok(match reply {
            PollReply::Running { status, screen } => SessionState::Running { status, screen },
            PollReply::Exited {
                code,
                status,
                screen,
            } => SessionState::Exited {
                code,
                status,
                screen,
            },
            PollReply::Unknown => SessionState::Lost,
        })
    }

    fn kill(&self, session: &SessionId) -> Result<(), SessionError> {
        self.call(
            HolderMethod::Kill,
            &IdParams {
                id: session.0.clone(),
            },
        )
    }
}

/// A live view of one session: its screen now, everything it prints next, and a way to type
/// into it. The terminal UI's split view and `enter` build on this.
pub struct Attach {
    client: Client,
    id: String,
    screen: Vec<u8>,
}

impl Attach {
    pub fn open(socket: &Path, session: &SessionId) -> Result<Self, ClientError> {
        let mut client = Client::connect(socket)?;
        let id = session.0.clone();
        let reply: AttachReply =
            client.call(HolderMethod::Attach.name(), &IdParams { id: id.clone() })?;
        Ok(Self {
            client,
            id,
            screen: decode(&reply.screen),
        })
    }

    /// Bytes that redraw the screen as it was when attached.
    pub fn screen(&self) -> &[u8] {
        &self.screen
    }

    /// The next bytes the session prints, or `None` if nothing came within `timeout`.
    pub fn next_output(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, ClientError> {
        while let Some(note) = self.client.next_notification_within(timeout)? {
            if note.method != OUTPUT {
                continue;
            }
            let output: OutputParams = serde_json::from_value(note.params)?;
            if output.id == self.id {
                return Ok(Some(decode(&output.data)));
            }
        }
        Ok(None)
    }

    /// Types `bytes` into the session.
    pub fn send(&mut self, bytes: &[u8]) -> Result<(), ClientError> {
        self.client.call(
            HolderMethod::Write.name(),
            &WriteParams {
                id: self.id.clone(),
                data: STANDARD.encode(bytes),
            },
        )
    }
}

fn decode(data: &str) -> Vec<u8> {
    STANDARD.decode(data).unwrap_or_default()
}
