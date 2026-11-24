use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;

use crate::message::{Incoming, OutgoingNotification, Response, VERSION};
use crate::RpcError;

/// Answers calls. Runs on one thread per connection, so it must be shareable.
pub trait Handler: Send + Sync {
    fn handle(&self, method: &str, params: Value, peer: &Peer) -> Result<Value, RpcError>;
}

/// The other end of one connection. Clone it to push notifications later (subscriptions).
#[derive(Clone)]
pub struct Peer {
    writer: Arc<Mutex<UnixStream>>,
}

impl Peer {
    /// Sends a notification; an error means the peer has gone away.
    pub fn notify<P: Serialize>(&self, method: &str, params: &P) -> std::io::Result<()> {
        self.send(&OutgoingNotification {
            jsonrpc: VERSION,
            method,
            params,
        })
    }

    fn send<M: Serialize>(&self, message: &M) -> std::io::Result<()> {
        let mut line = serde_json::to_vec(message)?;
        line.push(b'\n');
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| std::io::Error::other("connection lock poisoned"))?;
        writer.write_all(&line)?;
        writer.flush()
    }
}

/// Serves every connection on its own thread until the listener fails.
pub fn serve<H: Handler + 'static>(listener: &UnixListener, handler: &Arc<H>) {
    for stream in listener.incoming().flatten() {
        let handler = Arc::clone(handler);
        std::thread::spawn(move || {
            let _ = serve_connection(stream, handler.as_ref());
        });
    }
}

fn serve_connection(stream: UnixStream, handler: &dyn Handler) -> std::io::Result<()> {
    let peer = Peer {
        writer: Arc::new(Mutex::new(stream.try_clone()?)),
    };
    for line in BufReader::new(stream).lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let (id, outcome) = match serde_json::from_str::<Incoming>(&line) {
            Ok(Incoming {
                id,
                method: Some(method),
                params,
                ..
            }) => (id, handler.handle(&method, params, &peer)),
            Ok(_) => (
                None,
                Err(RpcError::new(RpcError::INVALID_REQUEST, "missing method")),
            ),
            Err(e) => (
                None,
                Err(RpcError::new(RpcError::PARSE_ERROR, e.to_string())),
            ),
        };
        // A call without an id is a notification from the client: nothing to answer.
        let Some(id) = id else { continue };
        let (result, error) = match outcome {
            Ok(value) => (Some(value), None),
            Err(e) => (None, Some(e)),
        };
        peer.send(&Response {
            jsonrpc: VERSION,
            id,
            result,
            error,
        })?;
    }
    Ok(())
}
