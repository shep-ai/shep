use std::path::PathBuf;
use std::sync::Arc;

use shep_domain::{AgentKind, AgentStatus, SessionId};

/// What Shep asks of an agent CLI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentRequest<'a> {
    pub prompt: &'a str,
    /// A UUID naming the conversation, for agents that let Shep choose it.
    pub conversation: &'a str,
    /// Carry on that conversation instead of starting it.
    pub resume: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentCommand {
    pub program: String,
    pub args: Vec<String>,
}

/// One coding agent CLI: how to run it unattended, and how to read its screen when it does
/// not report its status itself.
pub trait AgentProvider: Send + Sync {
    fn command(&self, request: &AgentRequest<'_>) -> AgentCommand;
    /// The status the screen shows, if it shows one (the fallback to OSC 7501).
    fn read_screen(&self, screen: &str) -> Option<AgentStatus>;
    /// Whether the CLI is installed.
    fn installed(&self) -> bool;
}

/// Resolves the agent the settings name. No component names an agent itself.
pub trait AgentProviders: Send + Sync {
    fn provider(&self, kind: AgentKind) -> Arc<dyn AgentProvider>;
}

/// A program to run in its own terminal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    /// Everything the session prints is appended here.
    pub log: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionState {
    Running {
        /// The latest status the agent reported over OSC 7501.
        status: Option<AgentStatus>,
        /// The visible screen, for reading when the agent reports nothing.
        screen: String,
    },
    Exited {
        code: Option<i32>,
        status: Option<AgentStatus>,
        screen: String,
    },
    /// The holder does not know the session (it restarted, the machine rebooted).
    Lost,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("agent session: {0}")]
pub struct SessionError(pub String);

/// The PTY holder: runs agent sessions in their own terminals, outside the daemon, so they
/// survive a daemon restart.
pub trait AgentSessions: Send + Sync {
    fn spawn(&self, spec: &SessionSpec) -> Result<SessionId, SessionError>;
    fn poll(&self, session: &SessionId) -> Result<SessionState, SessionError>;
    fn kill(&self, session: &SessionId) -> Result<(), SessionError>;
}
