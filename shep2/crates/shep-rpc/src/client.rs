use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::Serialize;
use shep_app::ports::{AgentView, SessionError};
use shep_app::{
    AppError, Board, Brief, SettingsChange, ShepApi, StartOutcome, StartWhen, TaskDetail,
};
use shep_domain::{ReviewAction, Settings, Task, TaskId};
use shep_jsonrpc::{Client, ClientError};

use crate::method::{
    AddLabelParams, AddParams, AgentOutput, IdParams, Method, NoParams, ReviewParams, SendParams,
    StartParams, UpdateSettingsParams, WatchReply,
};
use crate::{AGENT_OUTPUT, BOARD_CHANGED};

/// The four core actions, answered by the daemon. Surfaces use it exactly like an in-process
/// [`shep_app::Shep`].
pub struct RemoteShep {
    client: Mutex<Client>,
    socket: PathBuf,
}

impl RemoteShep {
    pub fn connect(socket: &Path) -> std::io::Result<Self> {
        Ok(Self {
            client: Mutex::new(Client::connect(socket)?),
            socket: socket.to_path_buf(),
        })
    }

    /// Opens a second connection that receives the board after every change.
    pub fn subscribe(socket: &Path) -> Result<BoardChanges, AppError> {
        let mut client = Client::connect(socket).map_err(|e| remote(e.into()))?;
        let current = client
            .call(Method::Subscribe.name(), &NoParams {})
            .map_err(remote)?;
        Ok(BoardChanges { client, current })
    }

    fn call<P: Serialize, R: DeserializeOwned>(
        &self,
        method: Method,
        params: &P,
    ) -> Result<R, AppError> {
        self.lock()?.call(method.name(), params).map_err(remote)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Client>, AppError> {
        self.client
            .lock()
            .map_err(|_| AppError::Remote("the daemon connection broke; try again".into()))
    }
}

impl ShepApi for RemoteShep {
    fn add(&self, input: &str, from_dir: Option<&Path>) -> Result<Task, AppError> {
        self.call(
            Method::Add,
            &AddParams {
                input: input.to_owned(),
                from_dir: from_dir.map(|d| d.display().to_string()),
            },
        )
    }
    fn start(&self, when: StartWhen) -> Result<StartOutcome, AppError> {
        self.call(Method::Start, &StartParams { when })
    }
    fn board(&self) -> Result<Board, AppError> {
        self.call(Method::Board, &NoParams {})
    }
    fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError> {
        self.call(Method::Review, &ReviewParams { id, action })
    }
    fn settings(&self) -> Result<Settings, AppError> {
        self.call(Method::SettingsGet, &NoParams {})
    }
    fn update_settings(&self, change: SettingsChange) -> Result<Settings, AppError> {
        self.call(Method::SettingsUpdate, &UpdateSettingsParams { change })
    }
    fn detail(&self, id: TaskId) -> Result<TaskDetail, AppError> {
        self.call(Method::Detail, &IdParams { id })
    }
    fn brief(&self) -> Result<Brief, AppError> {
        self.call(Method::Brief, &NoParams {})
    }
    fn morning_brief(&self) -> Result<Option<Brief>, AppError> {
        self.call(Method::MorningBrief, &NoParams {})
    }
    fn first_run_today(&self) -> Result<bool, AppError> {
        self.call(Method::FirstRunToday, &NoParams {})
    }
    fn add_label(&self, label: &str, from_dir: Option<&Path>) -> Result<Vec<Task>, AppError> {
        self.call(
            Method::AddLabel,
            &AddLabelParams {
                label: label.to_owned(),
                from_dir: from_dir.map(|d| d.display().to_string()),
            },
        )
    }
    /// Opens a connection of its own, so the agent's output never mixes with other answers.
    fn watch_agent(&self, id: TaskId) -> Result<Box<dyn AgentView>, AppError> {
        let mut client = Client::connect(&self.socket).map_err(|e| remote(e.into()))?;
        let reply: WatchReply = client
            .call(Method::WatchAgent.name(), &IdParams { id })
            .map_err(remote)?;
        Ok(Box::new(RemoteAgentView {
            client,
            id,
            screen: STANDARD.decode(reply.screen).unwrap_or_default(),
        }))
    }
    fn send_to_agent(&self, id: TaskId, bytes: &[u8]) -> Result<(), AppError> {
        self.call(
            Method::SendToAgent,
            &SendParams {
                id,
                data: STANDARD.encode(bytes),
            },
        )
    }
}

/// An agent's terminal, streamed from the daemon.
struct RemoteAgentView {
    client: Client,
    id: TaskId,
    screen: Vec<u8>,
}

impl AgentView for RemoteAgentView {
    fn screen(&self) -> &[u8] {
        &self.screen
    }
    fn next_output(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, SessionError> {
        let failed = |e: ClientError| SessionError(e.to_string());
        while let Some(note) = self
            .client
            .next_notification_within(timeout)
            .map_err(failed)?
        {
            if note.method != AGENT_OUTPUT {
                continue;
            }
            let output: AgentOutput =
                serde_json::from_value(note.params).map_err(|e| failed(e.into()))?;
            if output.id == self.id {
                return Ok(Some(STANDARD.decode(output.data).unwrap_or_default()));
            }
        }
        Ok(None)
    }
}

/// The board as the daemon pushes it.
pub struct BoardChanges {
    client: Client,
    current: Board,
}

impl BoardChanges {
    /// The board when the subscription started, or the latest one received.
    pub fn current(&self) -> &Board {
        &self.current
    }

    /// Blocks until the board changes.
    pub fn wait(&mut self) -> Result<Board, AppError> {
        loop {
            let note = self.client.next_notification().map_err(remote)?;
            if let Some(board) = self.accept(note)? {
                return Ok(board);
            }
        }
    }

    /// Like [`BoardChanges::wait`], but gives up after `timeout` with `Ok(None)`.
    pub fn wait_within(&mut self, timeout: Duration) -> Result<Option<Board>, AppError> {
        match self
            .client
            .next_notification_within(timeout)
            .map_err(remote)?
        {
            Some(note) => self.accept(note),
            None => Ok(None),
        }
    }

    fn accept(&mut self, note: shep_jsonrpc::Notification) -> Result<Option<Board>, AppError> {
        if note.method != BOARD_CHANGED {
            return Ok(None);
        }
        let board: Board = serde_json::from_value(note.params).map_err(|e| remote(e.into()))?;
        self.current = board.clone();
        Ok(Some(board))
    }
}

fn remote(e: ClientError) -> AppError {
    AppError::Remote(match e {
        ClientError::Rpc(rpc) => rpc.message,
        other => format!("the Shep daemon did not answer: {other}"),
    })
}
