//! One agent in one terminal.

use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use shep_domain::AgentStatus;
use shep_jsonrpc::Peer;

use super::protocol::{OutputParams, PollReply, SpawnParams, OUTPUT};
use crate::osc::{OscScanner, Report};

const ROWS: u16 = 50;
const COLS: u16 = 200;
const READ_CHUNK: usize = 8192;
const TERM: (&str, &str) = ("TERM", "xterm-256color");
/// After the process exits, its last output may still be in the terminal; it gets this long
/// to arrive before the session counts as ended.
const OUTPUT_GRACE: Duration = Duration::from_millis(500);

struct Inner {
    screen: vt100::Parser,
    osc: OscScanner,
    status: Option<AgentStatus>,
    exit: Option<(Option<i32>, Instant)>,
    output_done: bool,
    watchers: Vec<Peer>,
}

pub struct Session {
    id: String,
    inner: Arc<Mutex<Inner>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    writer: Mutex<Box<dyn Write + Send>>,
    /// Kept so the terminal stays open while the session lives.
    _master: Mutex<Box<dyn MasterPty + Send>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn other(e: impl std::fmt::Display) -> std::io::Error {
    std::io::Error::other(e.to_string())
}

impl Session {
    pub fn spawn(id: String, spec: &SpawnParams) -> std::io::Result<Arc<Self>> {
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: ROWS,
                cols: COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(other)?;
        let mut command = CommandBuilder::new(&spec.program);
        command.args(&spec.args);
        command.cwd(&spec.cwd);
        command.env(TERM.0, TERM.1);
        for (key, value) in &spec.env {
            command.env(key, value);
        }
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| other(format!("could not start {}: {e}", spec.program)))?;
        drop(pair.slave);
        let reader = pair.master.try_clone_reader().map_err(other)?;
        let writer = pair.master.take_writer().map_err(other)?;
        if let Some(dir) = std::path::Path::new(&spec.log).parent() {
            std::fs::create_dir_all(dir)?;
        }
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&spec.log)?;
        let session = Arc::new(Self {
            id,
            inner: Arc::new(Mutex::new(Inner {
                screen: vt100::Parser::new(ROWS, COLS, 0),
                osc: OscScanner::default(),
                status: None,
                exit: None,
                output_done: false,
                watchers: Vec::new(),
            })),
            killer: Mutex::new(child.clone_killer()),
            writer: Mutex::new(writer),
            _master: Mutex::new(pair.master),
        });
        let reading = Arc::clone(&session);
        std::thread::spawn(move || reading.read_output(reader, log));
        let waiting = Arc::clone(&session.inner);
        std::thread::spawn(move || {
            let code = child.wait().ok().and_then(|status| {
                status
                    .signal()
                    .is_none()
                    .then(|| i32::try_from(status.exit_code()).unwrap_or(i32::MAX))
            });
            lock(&waiting).exit = Some((code, Instant::now()));
        });
        Ok(session)
    }

    fn read_output(&self, mut reader: Box<dyn Read + Send>, mut log: std::fs::File) {
        let mut buf = vec![0; READ_CHUNK];
        loop {
            let n = match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            let bytes = &buf[..n];
            let _ = log.write_all(bytes);
            let mut inner = lock(&self.inner);
            inner.screen.process(bytes);
            for report in inner.osc.feed(bytes) {
                inner.status = match report {
                    Report::Status(status) => Some(status),
                    Report::Clear => None,
                };
            }
            let output = OutputParams {
                id: self.id.clone(),
                data: STANDARD.encode(bytes),
            };
            inner
                .watchers
                .retain(|peer| peer.notify(OUTPUT, &output).is_ok());
        }
        lock(&self.inner).output_done = true;
    }

    pub fn poll(&self) -> PollReply {
        let inner = lock(&self.inner);
        let screen = inner.screen.screen().contents();
        let status = inner.status.clone();
        match inner.exit {
            Some((code, at)) if inner.output_done || at.elapsed() >= OUTPUT_GRACE => {
                PollReply::Exited {
                    code,
                    status,
                    screen,
                }
            }
            _ => PollReply::Running { status, screen },
        }
    }

    pub fn kill(&self) -> std::io::Result<()> {
        if lock(&self.inner).exit.is_some() {
            return Ok(());
        }
        lock(&self.killer).kill()
    }

    pub fn write(&self, bytes: &[u8]) -> std::io::Result<()> {
        let mut writer = lock(&self.writer);
        writer.write_all(bytes)?;
        writer.flush()
    }

    /// Adds a watcher and returns the bytes that redraw the screen as it is now.
    pub fn attach(&self, peer: &Peer) -> Vec<u8> {
        let mut inner = lock(&self.inner);
        inner.watchers.push(peer.clone());
        inner.screen.screen().contents_formatted()
    }
}
