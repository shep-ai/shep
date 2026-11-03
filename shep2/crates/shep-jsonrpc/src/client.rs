use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::message::{Incoming, Request, VERSION};
use crate::{Notification, RpcError};

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Rpc(RpcError),
    #[error("unexpected reply: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("the server closed the connection")]
    Closed,
}

/// One connection to a server. Calls are answered in order; notifications that arrive while
/// waiting for an answer are kept for [`Client::next_notification`].
pub struct Client {
    reader: BufReader<UnixStream>,
    writer: UnixStream,
    next_id: u64,
    pending: VecDeque<Notification>,
    /// A line read only in part when a timed wait ran out; the rest arrives on the next read.
    partial: String,
}

impl Client {
    pub fn connect(path: &Path) -> std::io::Result<Self> {
        let stream = UnixStream::connect(path)?;
        Ok(Self {
            writer: stream.try_clone()?,
            reader: BufReader::new(stream),
            next_id: 1,
            pending: VecDeque::new(),
            partial: String::new(),
        })
    }

    pub fn call<P: Serialize, R: DeserializeOwned>(
        &mut self,
        method: &str,
        params: &P,
    ) -> Result<R, ClientError> {
        let id = self.next_id;
        self.next_id += 1;
        let mut line = serde_json::to_vec(&Request {
            jsonrpc: VERSION,
            id,
            method,
            params,
        })?;
        line.push(b'\n');
        self.writer.write_all(&line)?;
        self.writer.flush()?;
        loop {
            let message = self.read()?;
            match message {
                Incoming {
                    method: Some(method),
                    id: None,
                    params,
                    ..
                } => self.pending.push_back(Notification { method, params }),
                Incoming {
                    id: Some(got),
                    error,
                    result,
                    ..
                } if got == id => {
                    if let Some(e) = error {
                        return Err(ClientError::Rpc(e));
                    }
                    return Ok(serde_json::from_value(result.unwrap_or(Value::Null))?);
                }
                _ => {}
            }
        }
    }

    /// Blocks until the server pushes a notification.
    pub fn next_notification(&mut self) -> Result<Notification, ClientError> {
        if let Some(n) = self.pending.pop_front() {
            return Ok(n);
        }
        loop {
            if let Incoming {
                method: Some(method),
                id: None,
                params,
                ..
            } = self.read()?
            {
                return Ok(Notification { method, params });
            }
        }
    }

    /// Like [`Client::next_notification`], but gives up after `timeout` with `Ok(None)`.
    pub fn next_notification_within(
        &mut self,
        timeout: Duration,
    ) -> Result<Option<Notification>, ClientError> {
        if let Some(n) = self.pending.pop_front() {
            return Ok(Some(n));
        }
        self.reader.get_ref().set_read_timeout(Some(timeout))?;
        let outcome = self.next_notification();
        self.reader.get_ref().set_read_timeout(None)?;
        match outcome {
            Ok(n) => Ok(Some(n)),
            Err(ClientError::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    fn read(&mut self) -> Result<Incoming, ClientError> {
        loop {
            if self.reader.read_line(&mut self.partial)? == 0 {
                return Err(ClientError::Closed);
            }
            if !self.partial.ends_with('\n') {
                continue;
            }
            let line = std::mem::take(&mut self.partial);
            if !line.trim().is_empty() {
                return Ok(serde_json::from_str(&line)?);
            }
        }
    }
}
