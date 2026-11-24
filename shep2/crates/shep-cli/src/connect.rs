//! Which Shep a command talks to: the daemon when it runs, otherwise the database directly.

use std::sync::Arc;
use std::time::Duration;

use shep_app::{AppError, Shep, ShepApi};
use shep_infra::{wait_until, ShepHome, SqliteStore};
use shep_rpc::RemoteShep;

use crate::build;
use crate::wiring::{self, DAEMON_COMMAND};

/// The daemon gets this long to open its socket after `shep go` starts it.
const DAEMON_START_LIMIT: Duration = Duration::from_secs(10);
/// Asks a process to stop (SIGTERM).
const KILL: &str = "kill";

/// The daemon if it answers; otherwise Shep in this process, on the same database.
pub fn any(home: &ShepHome) -> Result<Box<dyn ShepApi>, AppError> {
    match current_daemon(home) {
        Some(remote) => Ok(Box::new(remote)),
        None => Ok(Box::new(local(home)?)),
    }
}

/// The running daemon, if it is this build; one left from another build is stopped (agents
/// keep running in the holder) so the next start runs this build's code.
fn current_daemon(home: &ShepHome) -> Option<RemoteShep> {
    let remote = RemoteShep::connect(&home.daemon_socket()).ok()?;
    let running = std::fs::read_to_string(home.daemon_build()).unwrap_or_default();
    if running.trim() == build::this_build() {
        return Some(remote);
    }
    drop(remote);
    stop_daemon(home);
    None
}

fn stop_daemon(home: &ShepHome) {
    let Ok(pid) = std::fs::read_to_string(home.daemon_pid()) else {
        return;
    };
    let _ = std::process::Command::new(KILL)
        .arg(pid.trim())
        .stderr(std::process::Stdio::null())
        .status();
    wait_until(DAEMON_START_LIMIT, || {
        RemoteShep::connect(&home.daemon_socket()).is_err()
    });
}

/// The daemon, started first if it is not running. Work only happens in the daemon.
pub fn daemon(home: &ShepHome) -> Result<Box<dyn ShepApi>, AppError> {
    let socket = home.daemon_socket();
    if let Some(remote) = current_daemon(home) {
        return Ok(Box::new(remote));
    }
    let failed = |why: String| {
        AppError::Remote(format!(
            "could not start the Shep daemon ({why}); see {}",
            home.daemon_log().display()
        ))
    };
    wiring::launch(home, DAEMON_COMMAND, &home.daemon_log()).map_err(|e| failed(e.to_string()))?;
    let mut remote = None;
    wait_until(DAEMON_START_LIMIT, || {
        remote = RemoteShep::connect(&socket).ok();
        remote.is_some()
    });
    remote
        .map(|r| Box::new(r) as Box<dyn ShepApi>)
        .ok_or_else(|| failed("it did not answer".into()))
}

/// Shep on the database, in this process.
pub fn local(home: &ShepHome) -> Result<Shep, AppError> {
    let store = Arc::new(SqliteStore::open(&home.database())?);
    Ok(Shep::new(wiring::ports(home, &store)))
}
