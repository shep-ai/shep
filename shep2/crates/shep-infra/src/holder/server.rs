use std::collections::HashMap;
use std::os::unix::net::UnixListener;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use shep_jsonrpc::{Handler, Peer, RpcError};

use super::protocol::{AttachReply, HolderMethod, IdParams, PollReply, SpawnParams, WriteParams};
use super::session::Session;
use crate::ShepHome;

#[derive(Default)]
struct HolderServer {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    next: AtomicU64,
}

impl HolderServer {
    fn session(&self, id: &str) -> Option<Arc<Session>> {
        self.sessions.lock().ok().and_then(|s| s.get(id).cloned())
    }

    fn known(&self, id: &str) -> Result<Arc<Session>, RpcError> {
        self.session(id)
            .ok_or_else(|| RpcError::application(format!("no session {id}")))
    }

    fn dispatch(
        &self,
        method: HolderMethod,
        params: Value,
        peer: &Peer,
    ) -> Result<Value, RpcError> {
        match method {
            HolderMethod::Spawn => {
                let spec: SpawnParams = parse(params)?;
                // Ids carry the holder's pid, so a restarted holder never answers for a
                // session it did not start.
                let n = self.next.fetch_add(1, Ordering::SeqCst);
                let id = format!("{}-{n}", std::process::id());
                let session = Session::spawn(id.clone(), &spec)
                    .map_err(|e| RpcError::application(e.to_string()))?;
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.insert(id.clone(), session);
                }
                reply(&IdParams { id })
            }
            HolderMethod::Poll => {
                let IdParams { id } = parse(params)?;
                reply(&self.session(&id).map_or(PollReply::Unknown, |s| s.poll()))
            }
            HolderMethod::Kill => {
                let IdParams { id } = parse(params)?;
                self.known(&id)?
                    .kill()
                    .map_err(|e| RpcError::application(e.to_string()))?;
                reply(&())
            }
            HolderMethod::Write => {
                let WriteParams { id, data } = parse(params)?;
                let bytes = STANDARD.decode(data).map_err(RpcError::invalid_params)?;
                self.known(&id)?
                    .write(&bytes)
                    .map_err(|e| RpcError::application(e.to_string()))?;
                reply(&())
            }
            HolderMethod::Attach => {
                let IdParams { id } = parse(params)?;
                let screen = self.known(&id)?.attach(peer);
                reply(&AttachReply {
                    screen: STANDARD.encode(screen),
                })
            }
        }
    }
}

impl Handler for HolderServer {
    fn handle(&self, method: &str, params: Value, peer: &Peer) -> Result<Value, RpcError> {
        let method =
            HolderMethod::parse(method).ok_or_else(|| RpcError::method_not_found(method))?;
        self.dispatch(method, params, peer)
    }
}

fn parse<P: DeserializeOwned>(params: Value) -> Result<P, RpcError> {
    serde_json::from_value(params).map_err(RpcError::invalid_params)
}

fn reply<T: Serialize>(value: &T) -> Result<Value, RpcError> {
    serde_json::to_value(value).map_err(|e| RpcError::application(e.to_string()))
}

/// Serves sessions until the listener fails.
pub fn serve(listener: &UnixListener) {
    shep_jsonrpc::serve(listener, &Arc::new(HolderServer::default()));
}

/// The holder process: binds its socket under `home`, records its pid, serves forever.
pub fn run(home: &ShepHome) -> std::io::Result<()> {
    let listener = shep_jsonrpc::bind_private(&home.holder_socket())?;
    std::fs::write(home.holder_pid(), std::process::id().to_string())?;
    eprintln!(
        "shep holder {} serving {}",
        std::process::id(),
        home.holder_socket().display()
    );
    serve(&listener);
    Ok(())
}
