//! Which Shep a command talks to: the daemon when it runs, otherwise the database directly.

use std::sync::Arc;
use std::time::Duration;

use shep_app::{AppError, Ports, Shep, ShepApi};
use shep_infra::{spawn_detached, wait_until, ShepHome, SqliteStore, SystemClock};
use shep_rpc::RemoteShep;

/// The daemon gets this long to open its socket after `shep go` starts it.
const DAEMON_START_LIMIT: Duration = Duration::from_secs(10);
pub const DAEMON_COMMAND: &str = "__daemon";

/// The daemon if it answers; otherwise Shep in this process, on the same database.
pub fn any(home: &ShepHome) -> Result<Box<dyn ShepApi>, AppError> {
    match RemoteShep::connect(&home.daemon_socket()) {
        Ok(remote) => Ok(Box::new(remote)),
        Err(_) => Ok(Box::new(local(home)?)),
    }
}

/// The daemon, started first if it is not running. Work only happens in the daemon.
pub fn daemon(home: &ShepHome) -> Result<Box<dyn ShepApi>, AppError> {
    let socket = home.daemon_socket();
    if let Ok(remote) = RemoteShep::connect(&socket) {
        return Ok(Box::new(remote));
    }
    let failed = |why: String| {
        AppError::Remote(format!(
            "could not start the Shep daemon ({why}); see {}",
            home.daemon_log().display()
        ))
    };
    let exe = std::env::current_exe().map_err(|e| failed(e.to_string()))?;
    spawn_detached(&exe, &[DAEMON_COMMAND], &home.daemon_log())
        .map_err(|e| failed(e.to_string()))?;
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
    Ok(Shep::new(Ports {
        tasks: store.clone(),
        settings: store,
        clock: Arc::new(SystemClock),
    }))
}
