//! A Shep and its engine on fakes, shared by the engine tests.

#![allow(dead_code, unused_imports)]

pub use std::path::Path;
pub use std::sync::Arc;

pub use shep_app::testing::{Fakes, ManualClock};
pub use shep_app::{
    Engine, EngineConfig, SettingsChange, Shep, ShepApi, StartWhen, AGENT_ENV_PROOF_DIR,
    AGENT_ENV_QUESTION_FILE, AGENT_ENV_REVIEW_FILE,
};
pub use shep_domain::{
    AgentKind, AgentStatus, CheckState, CiCheck, ClockTime, EventKind, ResetAt, ReviewAction,
    SessionId, TaskId, TaskState,
};

pub const REPO: &str = "/code/app";
pub const START: i64 = 1_000_000;

pub struct World {
    pub f: Fakes,
    pub shep: Arc<Shep>,
    pub engine: Engine,
}

pub fn config() -> EngineConfig {
    EngineConfig {
        ci_poll_secs: 0,
        ..EngineConfig::default()
    }
}

pub fn world() -> World {
    let f = Fakes {
        clock: Arc::new(ManualClock::fixed(START)),
        ..Fakes::default()
    };
    f.git.add_repo(REPO);
    f.forge
        .add_issue(7, "Fix login redirect loop", "Users land on /login again.");
    let shep = Arc::new(Shep::new(f.ports()));
    shep.update_settings(SettingsChange {
        agent: Some(AgentKind::ClaudeCode),
        repo: Some(REPO.into()),
        ..Default::default()
    })
    .unwrap();
    let engine = Engine::new(shep.clone(), f.ports(), config());
    World { f, shep, engine }
}

impl World {
    pub fn task(&self, id: i64) -> shep_domain::Task {
        let board = self.shep.board().unwrap();
        let found = board
            .groups()
            .flat_map(|(_, tasks)| tasks.iter().cloned())
            .find(|t| t.id == TaskId(id));
        found.unwrap()
    }
    pub fn state(&self, id: i64) -> TaskState {
        self.task(id).state
    }
    pub fn session(&self) -> (SessionId, shep_app::ports::SessionSpec) {
        self.f.sessions.last()
    }
    pub fn prompt(&self) -> String {
        self.session().1.args.last().cloned().unwrap()
    }
    pub fn mode(&self) -> String {
        self.session().1.args[1].clone()
    }
    pub fn env(&self, key: &str) -> Option<String> {
        self.session()
            .1
            .env
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    }
    /// The agent changed files and exited cleanly.
    pub fn agent_finishes(&self) {
        let wt = self.f.git.worktrees().last().cloned().unwrap();
        self.f.git.touch(&wt);
        self.f.sessions.exit(&self.session().0, 0, "done");
    }
    pub fn kinds(&self, id: i64) -> Vec<EventKind> {
        use shep_app::ports::EventLog;
        self.f
            .events
            .events(TaskId(id))
            .unwrap()
            .into_iter()
            .map(|e| e.kind)
            .collect()
    }
    /// Queued #7, started, and the coder already running.
    pub fn started() -> Self {
        let w = world();
        w.shep.add("#7", None).unwrap();
        w.shep.start(StartWhen::Now).unwrap();
        w.engine.tick();
        w
    }
    /// Through the coder and a green CI, with the reviewer running.
    pub fn reviewing() -> Self {
        let w = Self::started();
        w.agent_finishes();
        w.engine.tick();
        w.f.forge
            .queue_checks(vec![check("build", CheckState::Passed)]);
        w.engine.tick();
        w
    }
}

pub fn check(name: &str, state: CheckState) -> CiCheck {
    CiCheck {
        name: name.into(),
        state,
        link: None,
    }
}
