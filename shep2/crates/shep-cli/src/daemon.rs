//! The daemon: owns the database and serves every surface over the socket.

use std::sync::Arc;

use shep_app::{AppError, ShepApi};
use shep_infra::ShepHome;
use shep_rpc::RpcServer;

use crate::connect;

pub fn run(home: &ShepHome) -> Result<(), AppError> {
    let failed = |e: std::io::Error| AppError::Remote(format!("daemon: {e}"));
    let shep: Arc<dyn ShepApi> = Arc::new(connect::local(home)?);
    let listener = shep_jsonrpc::bind_private(&home.daemon_socket()).map_err(failed)?;
    std::fs::write(home.daemon_pid(), std::process::id().to_string()).map_err(failed)?;
    eprintln!(
        "shep daemon {} serving {}",
        std::process::id(),
        home.daemon_socket().display()
    );
    RpcServer::new(shep).serve(&listener);
    Ok(())
}
