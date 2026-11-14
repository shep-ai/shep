//! A local HTTP server that answers with recorded API responses and remembers every request,
//! so source adapters are tested against what the real APIs send without reaching them.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

/// One request as the server received it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub method: String,
    /// The path with its query string.
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).unwrap_or(serde_json::Value::Null)
    }
    /// Anything but a read.
    pub fn writes(&self) -> bool {
        self.method != "GET"
    }
}

#[derive(Clone)]
struct Route {
    method: String,
    /// Matches when the request path (with query) starts with this.
    path: String,
    /// Matches only requests whose body contains this (GraphQL APIs share one path).
    body_contains: Option<String>,
    status: u16,
    body: String,
}

#[derive(Default)]
struct State {
    routes: Vec<Route>,
    requests: Vec<Request>,
}

/// Routes are tried newest first, so a test can override a default answer.
pub struct FixtureServer {
    url: String,
    state: Arc<Mutex<State>>,
}

impl FixtureServer {
    pub fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let state = Arc::new(Mutex::new(State::default()));
        let shared = state.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let shared = shared.clone();
                std::thread::spawn(move || serve(stream, &shared));
            }
        });
        Self { url, state }
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn on(&self, method: &str, path: &str, status: u16, body: &str) {
        self.route(method, path, None, status, body);
    }

    /// For GraphQL: answers requests to `path` whose body contains `contains`.
    pub fn on_body(&self, method: &str, path: &str, contains: &str, status: u16, body: &str) {
        self.route(method, path, Some(contains), status, body);
    }

    /// Every request is answered with this status from now on (an expired token, an outage).
    pub fn fail_all(&self, status: u16, body: &str) {
        for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] {
            self.route(method, "/", None, status, body);
        }
    }

    pub fn requests(&self) -> Vec<Request> {
        self.state.lock().unwrap().requests.clone()
    }

    pub fn writes(&self) -> Vec<Request> {
        self.requests()
            .into_iter()
            .filter(Request::writes)
            .collect()
    }

    pub fn clear_requests(&self) {
        self.state.lock().unwrap().requests.clear();
    }

    fn route(&self, method: &str, path: &str, contains: Option<&str>, status: u16, body: &str) {
        self.state.lock().unwrap().routes.push(Route {
            method: method.to_owned(),
            path: path.to_owned(),
            body_contains: contains.map(str::to_owned),
            status,
            body: body.to_owned(),
        });
    }
}

/// A recorded fixture file under `tests/fixtures/`.
pub fn fixture(path: &str) -> String {
    let full = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(path);
    std::fs::read_to_string(&full).unwrap_or_else(|e| panic!("{}: {e}", full.display()))
}

fn serve(stream: TcpStream, state: &Mutex<State>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_owned();
    let path = parts.next().unwrap_or_default().to_owned();
    let mut headers = Vec::new();
    let mut length = 0;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).unwrap_or(0) == 0 || header.trim().is_empty() {
            break;
        }
        if let Some((k, v)) = header.trim().split_once(':') {
            if k.eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0);
            }
            headers.push((k.trim().to_owned(), v.trim().to_owned()));
        }
    }
    let mut body = vec![0; length];
    let _ = reader.read_exact(&mut body);
    let request = Request {
        method,
        path,
        headers,
        body: String::from_utf8_lossy(&body).into_owned(),
    };
    let (status, answer) = {
        let mut s = state.lock().unwrap();
        s.requests.push(request.clone());
        s.routes
            .iter()
            .rev()
            .find(|r| {
                r.method == request.method
                    && request.path.starts_with(&r.path)
                    && r.body_contains
                        .as_ref()
                        .is_none_or(|c| request.body.contains(c.as_str()))
            })
            .map_or((404, String::from("{\"error\":\"no fixture\"}")), |r| {
                (r.status, r.body.clone())
            })
    };
    let mut out = stream;
    let _ = write!(
        out,
        "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}",
        answer.len()
    );
}
