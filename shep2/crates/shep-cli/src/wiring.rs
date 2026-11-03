//! The one place real adapters are chosen for each port.

use std::sync::Arc;
use std::time::Duration;

use shep_app::{EngineConfig, Ports};
use shep_infra::{
    spawn_detached, CliAgents, FsTaskFiles, GhForge, GitCli, HolderSessions, ShepHome, SqliteStore,
    SystemClock, SystemKeepAwake,
};

pub const DAEMON_COMMAND: &str = "__daemon";
pub const HOLDER_COMMAND: &str = "__holder";
const GH: &str = "gh";

/// How often the engine looks at every task (overridable for tests).
const TICK_ENV: &str = "SHEP_ENGINE_TICK_MS";
const DEFAULT_TICK: Duration = Duration::from_secs(2);
const CI_POLL_ENV: &str = "SHEP_CI_POLL_SECS";
const CI_GRACE_ENV: &str = "SHEP_CI_GRACE_SECS";

pub fn ports(home: &ShepHome, store: &Arc<SqliteStore>) -> Ports {
    let holder_home = home.clone();
    Ports {
        tasks: store.clone(),
        settings: store.clone(),
        runs: store.clone(),
        events: store.clone(),
        clock: Arc::new(SystemClock),
        git: Arc::new(GitCli::new(home.worktrees_dir())),
        forge: Arc::new(GhForge::new(GH)),
        agents: Arc::new(CliAgents::from_env()),
        sessions: Arc::new(HolderSessions::new(
            home.holder_socket(),
            Box::new(move || launch(&holder_home, HOLDER_COMMAND, &holder_home.holder_log())),
        )),
        files: Arc::new(FsTaskFiles::new(home.tasks_dir())),
        awake: Arc::new(SystemKeepAwake::for_this_machine()),
    }
}

/// Starts `shep <command>` in the background, logging to `log`.
pub fn launch(_home: &ShepHome, command: &str, log: &std::path::Path) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    spawn_detached(&exe, &[command], log).map(drop)
}

pub fn tick() -> Duration {
    env_number(TICK_ENV).map_or(DEFAULT_TICK, |ms| Duration::from_millis(ms.unsigned_abs()))
}

pub fn engine_config() -> EngineConfig {
    let defaults = EngineConfig::default();
    EngineConfig {
        ci_poll_secs: env_number(CI_POLL_ENV).unwrap_or(defaults.ci_poll_secs),
        ci_no_checks_grace_secs: env_number(CI_GRACE_ENV)
            .unwrap_or(defaults.ci_no_checks_grace_secs),
        ..defaults
    }
}

fn env_number(key: &str) -> Option<i64> {
    std::env::var(key).ok().and_then(|v| v.trim().parse().ok())
}
