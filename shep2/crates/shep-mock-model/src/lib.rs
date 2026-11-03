//! A scripted stand-in for the Anthropic Messages API. Point the real Claude Code CLI at it
//! (`ANTHROPIC_BASE_URL`, any `ANTHROPIC_API_KEY`) and it runs a whole task with no key and no
//! cost: Shep's prompts, the PTY, sessions, resume and exit codes are all real; only the model
//! is not. See [`script`] for what it answers.

mod http;
pub mod script;

use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex, PoisonError};

use serde_json::Value;

use script::Reply;

/// When set, every request is appended to this file, one JSON object per line.
pub const LOG_ENV: &str = "SHEP_MOCK_MODEL_LOG";

/// A running mock model on a local port.
pub struct MockModel {
    addr: SocketAddr,
    prompts: Arc<Mutex<Vec<String>>>,
}

impl MockModel {
    /// Serves on a free local port, on a thread of its own.
    pub fn start() -> std::io::Result<Self> {
        Self::start_on("127.0.0.1:0")
    }

    pub fn start_on(addr: &str) -> std::io::Result<Self> {
        let listener = TcpListener::bind(addr)?;
        let model = Self {
            addr: listener.local_addr()?,
            prompts: Arc::default(),
        };
        let prompts = Arc::clone(&model.prompts);
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let prompts = Arc::clone(&prompts);
                std::thread::spawn(move || {
                    let _ = answer(stream, &prompts);
                });
            }
        });
        Ok(model)
    }

    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// The value for `ANTHROPIC_BASE_URL`.
    pub fn url(&self) -> String {
        format!("http://{}", self.addr)
    }

    /// The task prompts received so far (side requests and tool results left out).
    pub fn prompts(&self) -> Vec<String> {
        self.prompts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

fn answer(mut stream: TcpStream, prompts: &Mutex<Vec<String>>) -> std::io::Result<()> {
    let http::Request { line, body } = http::read_request(&mut stream)?;
    if !line.starts_with(http::POST) {
        return stream.write_all(http::NOT_FOUND.as_bytes());
    }
    let request: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    if let Some(log) = std::env::var_os(LOG_ENV) {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log)?;
        let entry = serde_json::json!({ "line": line, "bytes": body.len(), "request": request });
        writeln!(file, "{entry}")?;
    }
    let reply = script::reply(&request);
    if let Reply::Command { prompt, .. } = &reply {
        prompts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(prompt.clone());
    }
    let model = request["model"].as_str().unwrap_or("mock");
    stream.write_all(http::STREAM_HEADER.as_bytes())?;
    for (event, data) in script::events(&reply, model) {
        write!(stream, "event: {event}\ndata: {data}\n\n")?;
    }
    stream.flush()
}
