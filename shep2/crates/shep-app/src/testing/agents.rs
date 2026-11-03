use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use shep_domain::{AgentKind, AgentStatus, SessionId};

use super::lock;
use crate::ports::{
    AgentCommand, AgentProvider, AgentProviders, AgentRequest, AgentSessions, SessionError,
    SessionSpec, SessionState,
};

/// The fake agent's program name, so tests can tell its sessions apart.
pub const FAKE_AGENT: &str = "fake-agent";

/// Runs `fake-agent <conversation> new|resume <prompt>`; reads a screen through rules a test
/// sets (text on screen → status).
pub struct FakeProvider {
    installed: AtomicBool,
    screen_rules: Mutex<Vec<(String, AgentStatus)>>,
}

impl Default for FakeProvider {
    fn default() -> Self {
        Self {
            installed: AtomicBool::new(true),
            screen_rules: Mutex::default(),
        }
    }
}

impl FakeProvider {
    pub fn set_installed(&self, installed: bool) {
        self.installed.store(installed, Ordering::SeqCst);
    }
    pub fn on_screen(&self, text: &str, status: AgentStatus) {
        lock(&self.screen_rules).push((text.to_owned(), status));
    }
}

impl AgentProvider for FakeProvider {
    fn command(&self, request: &AgentRequest<'_>) -> AgentCommand {
        let mode = if request.resume { "resume" } else { "new" };
        AgentCommand {
            program: FAKE_AGENT.into(),
            args: vec![
                request.conversation.to_owned(),
                mode.into(),
                request.prompt.to_owned(),
            ],
        }
    }
    fn read_screen(&self, screen: &str) -> Option<AgentStatus> {
        lock(&self.screen_rules)
            .iter()
            .find(|(text, _)| screen.contains(text.as_str()))
            .map(|(_, status)| status.clone())
    }
    fn installed(&self) -> bool {
        self.installed.load(Ordering::SeqCst)
    }
}

/// One fake provider per agent kind; records which kinds were asked for.
#[derive(Default)]
pub struct FakeAgents {
    providers: Mutex<HashMap<AgentKind, Arc<FakeProvider>>>,
    asked: Mutex<Vec<AgentKind>>,
}

impl FakeAgents {
    pub fn get(&self, kind: AgentKind) -> Arc<FakeProvider> {
        lock(&self.providers).entry(kind).or_default().clone()
    }
    pub fn asked(&self) -> Vec<AgentKind> {
        lock(&self.asked).clone()
    }
}

impl AgentProviders for FakeAgents {
    fn provider(&self, kind: AgentKind) -> Arc<dyn AgentProvider> {
        lock(&self.asked).push(kind);
        self.get(kind)
    }
}

#[derive(Default)]
struct Sessions {
    spawned: Vec<(SessionId, SessionSpec)>,
    states: HashMap<SessionId, SessionState>,
    killed: Vec<SessionId>,
    lost: bool,
}

/// Sessions a test drives by hand: each spawn starts `Running` until the test ends it.
#[derive(Default)]
pub struct FakeSessions(Mutex<Sessions>);

impl FakeSessions {
    pub fn spawned(&self) -> Vec<(SessionId, SessionSpec)> {
        lock(&self.0).spawned.clone()
    }
    /// The latest session started.
    ///
    /// # Panics
    ///
    /// When no session was started: the test expected one.
    pub fn last(&self) -> (SessionId, SessionSpec) {
        self.spawned()
            .last()
            .cloned()
            .expect("no session was started")
    }
    pub fn set(&self, id: &SessionId, state: SessionState) {
        lock(&self.0).states.insert(id.clone(), state);
    }
    /// Ends a session with this exit code and screen.
    pub fn exit(&self, id: &SessionId, code: i32, screen: &str) {
        self.set(
            id,
            SessionState::Exited {
                code: Some(code),
                status: None,
                screen: screen.to_owned(),
            },
        );
    }
    /// Shows `screen` on a running session, with an optional reported status.
    pub fn show(&self, id: &SessionId, status: Option<AgentStatus>, screen: &str) {
        self.set(
            id,
            SessionState::Running {
                status,
                screen: screen.to_owned(),
            },
        );
    }
    pub fn killed(&self) -> Vec<SessionId> {
        lock(&self.0).killed.clone()
    }
    /// Every session is forgotten, as when the holder restarts.
    pub fn lose_all(&self) {
        lock(&self.0).lost = true;
    }
}

impl AgentSessions for FakeSessions {
    fn spawn(&self, spec: &SessionSpec) -> Result<SessionId, SessionError> {
        let mut s = lock(&self.0);
        s.lost = false;
        let id = SessionId(format!("s{}", s.spawned.len() + 1));
        s.spawned.push((id.clone(), spec.clone()));
        s.states.insert(
            id.clone(),
            SessionState::Running {
                status: None,
                screen: String::new(),
            },
        );
        Ok(id)
    }
    fn poll(&self, session: &SessionId) -> Result<SessionState, SessionError> {
        let s = lock(&self.0);
        if s.lost {
            return Ok(SessionState::Lost);
        }
        Ok(s.states.get(session).cloned().unwrap_or(SessionState::Lost))
    }
    fn kill(&self, session: &SessionId) -> Result<(), SessionError> {
        let mut s = lock(&self.0);
        s.killed.push(session.clone());
        s.states.insert(
            session.clone(),
            SessionState::Exited {
                code: None,
                status: None,
                screen: String::new(),
            },
        );
        Ok(())
    }
}
