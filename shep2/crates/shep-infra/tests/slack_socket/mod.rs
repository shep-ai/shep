//! A local Socket Mode server: each connection gets the next script of frames (the last script
//! repeats), and the server remembers every acknowledgement and every closed connection. It
//! stops its threads when dropped.

use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tungstenite::{Message, WebSocket};

/// A script step that drops the TCP connection without a close frame (a network error).
pub const DROP: &str = "DROP";
const TICK: Duration = Duration::from_millis(20);
const WAIT: Duration = Duration::from_secs(10);

#[derive(Default, Debug, Clone)]
pub struct Seen {
    pub connections: usize,
    /// Envelope ids, in the order they were acknowledged.
    pub acks: Vec<String>,
    /// Connections that ended because the client closed them.
    pub closed: usize,
}

pub struct SocketServer {
    url: String,
    seen: Arc<Mutex<Seen>>,
    stop: Arc<AtomicBool>,
    accept: Option<JoinHandle<()>>,
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

impl SocketServer {
    pub fn start(scripts: Vec<Vec<String>>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("ws://{}/link/?ticket=test", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Seen::default()));
        let stop = Arc::new(AtomicBool::new(false));
        let workers = Arc::new(Mutex::new(Vec::new()));
        let accept = {
            let (seen, stop, workers) = (seen.clone(), stop.clone(), workers.clone());
            std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    let Ok((stream, _)) = listener.accept() else {
                        std::thread::sleep(TICK);
                        continue;
                    };
                    let script = {
                        let mut s = seen.lock().unwrap();
                        s.connections += 1;
                        scripts[(s.connections - 1).min(scripts.len() - 1)].clone()
                    };
                    let (seen, stop) = (seen.clone(), stop.clone());
                    let worker = std::thread::spawn(move || serve(stream, &script, &seen, &stop));
                    workers.lock().unwrap().push(worker);
                }
            })
        };
        Self {
            url,
            seen,
            stop,
            accept: Some(accept),
            workers,
        }
    }

    /// What `apps.connections.open` answers with.
    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn seen(&self) -> Seen {
        self.seen.lock().unwrap().clone()
    }

    /// Waits until `done` holds; panics with what was seen when it never does.
    pub fn wait_until(&self, what: &str, done: impl Fn(&Seen) -> bool) -> Seen {
        let deadline = Instant::now() + WAIT;
        loop {
            let seen = self.seen();
            if done(&seen) {
                return seen;
            }
            assert!(Instant::now() < deadline, "never saw {what}: {seen:?}");
            std::thread::sleep(TICK);
        }
    }
}

impl Drop for SocketServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(accept) = self.accept.take() {
            let _ = accept.join();
        }
        for worker in self.workers.lock().unwrap().drain(..) {
            let _ = worker.join();
        }
    }
}

fn serve(stream: TcpStream, script: &[String], seen: &Mutex<Seen>, stop: &AtomicBool) {
    stream.set_nonblocking(false).unwrap();
    let Ok(mut ws) = tungstenite::accept(stream) else {
        return;
    };
    ws.get_ref().set_read_timeout(Some(TICK)).unwrap();
    for frame in script {
        if frame == DROP {
            let _ = ws.get_ref().shutdown(std::net::Shutdown::Both);
            return;
        }
        if ws.send(Message::text(frame.clone())).is_err() {
            return;
        }
    }
    read_acks(&mut ws, seen, stop);
}

fn read_acks(ws: &mut WebSocket<TcpStream>, seen: &Mutex<Seen>, stop: &AtomicBool) {
    while !stop.load(Ordering::SeqCst) {
        match ws.read() {
            Ok(Message::Text(text)) => {
                let ack: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
                if let Some(id) = ack["envelope_id"].as_str() {
                    seen.lock().unwrap().acks.push(id.to_owned());
                }
            }
            Ok(Message::Close(_)) => {
                seen.lock().unwrap().closed += 1;
                let _ = ws.flush();
                return;
            }
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(_) => {
                seen.lock().unwrap().closed += 1;
                return;
            }
        }
    }
}
