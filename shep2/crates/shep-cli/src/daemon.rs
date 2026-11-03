//! The daemon: owns the database, serves every surface over the socket, and runs the engine
//! that carries tasks from Working to Ready. Agents themselves run in the holder.

use std::sync::Arc;

use shep_app::{AppError, Engine, Shep, ShepApi};
use shep_infra::{ShepHome, SqliteStore};
use shep_rpc::RpcServer;

use crate::wiring;

pub fn run(home: &ShepHome) -> Result<(), AppError> {
    let failed = |e: std::io::Error| AppError::Remote(format!("daemon: {e}"));
    let store = Arc::new(SqliteStore::open(&home.database())?);
    let ports = wiring::ports(home, &store);
    let shep = Arc::new(Shep::new(ports.clone()));
    let listener = shep_jsonrpc::bind_private(&home.daemon_socket()).map_err(failed)?;
    std::fs::write(home.daemon_pid(), std::process::id().to_string()).map_err(failed)?;
    eprintln!(
        "shep daemon {} serving {}",
        std::process::id(),
        home.daemon_socket().display()
    );
    let engine = Engine::new(Arc::clone(&shep), ports, wiring::engine_config());
    let tick = wiring::tick();
    std::thread::spawn(move || loop {
        engine.tick();
        std::thread::sleep(tick);
    });
    RpcServer::new(shep as Arc<dyn ShepApi>).serve(&listener);
    Ok(())
}

/// The PTY holder process.
pub fn run_holder(home: &ShepHome) -> Result<(), AppError> {
    shep_infra::holder::run(home).map_err(|e| AppError::Remote(format!("holder: {e}")))
}
