//! Socket Mode, held on a background thread for the adapter's lifetime: `apps.connections.open`
//! with the app-level token, then the websocket. Every envelope is kept (when it matters) and
//! acknowledged; a `disconnect` reconnects at once, an error after a pause that doubles up to a
//! minute. Dropping the [`Socket`] stops and joins the thread.

use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde_json::json;
use tungstenite::Message;

use super::api::{Api, Failure, CONNECTIONS_OPEN, POST_EPHEMERAL};
use super::events::{self, Frame, Inbound};
use super::inbox::{Inbox, SocketState};
use super::messages::{send_back_hint, MERGE_HEARD};
use super::wire::{self, Ws};

/// How long a read waits before the thread checks whether it should stop.
const TICK: Duration = Duration::from_millis(200);
const FIRST_PAUSE: Duration = Duration::from_secs(1);
const LONGEST_PAUSE: Duration = Duration::from_secs(60);
/// Shep pings this often, and gives up on a connection that says nothing for longer.
const PING_EVERY: Duration = Duration::from_secs(30);
const SILENCE_LIMIT: Duration = Duration::from_secs(90);
const THREAD_NAME: &str = "shep-slack-socket";

/// Says why the app-level token did not open a socket.
pub fn app_token_problem(failure: Failure) -> String {
    match failure {
        Failure::Refused { code, .. } => format!(
            "Slack refused the app-level token ({code}); make one with connections:write under \
             Basic Information → App-Level Tokens"
        ),
        Failure::Unreachable(e) => e.0,
    }
}

#[derive(Default)]
struct Stop {
    stopped: Mutex<bool>,
    wake: Condvar,
}

impl Stop {
    fn set(&self) {
        *self.stopped.lock().unwrap_or_else(PoisonError::into_inner) = true;
        self.wake.notify_all();
    }

    fn is_set(&self) -> bool {
        *self.stopped.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Waits `pause` unless told to stop first; true when stopped.
    fn wait(&self, pause: Duration) -> bool {
        let stopped = self.stopped.lock().unwrap_or_else(PoisonError::into_inner);
        let (stopped, _) = self
            .wake
            .wait_timeout_while(stopped, pause, |stopped| !*stopped)
            .unwrap_or_else(PoisonError::into_inner);
        *stopped
    }
}

pub struct Socket {
    stop: Arc<Stop>,
    thread: Option<JoinHandle<()>>,
}

impl Socket {
    /// `app` holds the app-level token, `bot` the bot token (for private answers to presses).
    pub fn start(app: Api, bot: Api, inbox: Arc<Inbox>) -> Self {
        let stop = Arc::new(Stop::default());
        let running = stop.clone();
        let shared = inbox.clone();
        let thread = std::thread::Builder::new()
            .name(THREAD_NAME.to_owned())
            .spawn(move || run(&app, &bot, &inbox, &running));
        if let Err(e) = &thread {
            let why = format!("could not start Slack's connection: {e}");
            shared.set_socket(SocketState::Failed(why));
        }
        Self {
            stop,
            thread: thread.ok(),
        }
    }
}

impl Drop for Socket {
    fn drop(&mut self) {
        self.stop.set();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

enum Ended {
    Stopped,
    /// Slack asked for a new connection.
    Refreshed,
    Failed {
        why: String,
        /// It had said hello, so the next attempt starts from a short pause.
        connected: bool,
    },
}

fn run(app: &Api, bot: &Api, inbox: &Inbox, stop: &Stop) {
    let mut pause = FIRST_PAUSE;
    while !stop.is_set() {
        match attempt(app, bot, inbox, stop) {
            Ended::Stopped => return,
            Ended::Refreshed => {
                pause = FIRST_PAUSE;
                inbox.set_socket(SocketState::Connecting);
            }
            Ended::Failed { why, connected } => {
                if connected {
                    pause = FIRST_PAUSE;
                }
                inbox.set_socket(SocketState::Failed(why));
                if stop.wait(pause) {
                    return;
                }
                pause = (pause * 2).min(LONGEST_PAUSE);
            }
        }
    }
}

fn attempt(app: &Api, bot: &Api, inbox: &Inbox, stop: &Stop) -> Ended {
    let failed = |why: String| Ended::Failed {
        why,
        connected: false,
    };
    let opened = match app.post_form(CONNECTIONS_OPEN, &[]) {
        Ok(opened) => opened,
        Err(failure) => return failed(app_token_problem(failure)),
    };
    let Some(url) = opened["url"].as_str() else {
        return failed("Slack opened no socket".to_owned());
    };
    if stop.is_set() {
        return Ended::Stopped;
    }
    let mut ws = match wire::connect(url, TICK) {
        Ok(ws) => ws,
        Err(why) => return failed(why),
    };
    let ended = session(&mut ws, bot, inbox, stop);
    let _ = ws.close(None);
    let _ = ws.flush();
    ended
}

fn session(ws: &mut Ws, bot: &Api, inbox: &Inbox, stop: &Stop) -> Ended {
    let mut connected = false;
    let mut heard = Instant::now();
    let mut pinged = Instant::now();
    loop {
        if stop.is_set() {
            return Ended::Stopped;
        }
        let broke = |why: String| Ended::Failed { why, connected };
        match ws.read() {
            Ok(Message::Text(text)) => {
                heard = Instant::now();
                match events::read(&text) {
                    Frame::Hello => {
                        connected = true;
                        inbox.set_socket(SocketState::Connected);
                    }
                    Frame::Disconnect if connected => return Ended::Refreshed,
                    Frame::Disconnect => return broke("Slack hung up before saying hello".into()),
                    Frame::Envelope { id, inbound } => {
                        if let Some(inbound) = &inbound {
                            keep(inbox, inbound);
                        }
                        let ack = Message::text(json!({ "envelope_id": id }).to_string());
                        if let Err(e) = ws.send(ack) {
                            return broke(format!("could not acknowledge: {e}"));
                        }
                        if let Some(inbound) = inbound {
                            answer(bot, &inbound);
                        }
                    }
                    Frame::Other => {}
                }
            }
            Ok(Message::Close(_)) => return broke("Slack closed the connection".into()),
            Ok(_) => heard = Instant::now(),
            Err(tungstenite::Error::Io(e)) if is_tick(&e) => {
                if heard.elapsed() > SILENCE_LIMIT {
                    return broke("Slack went quiet".into());
                }
                if pinged.elapsed() > PING_EVERY {
                    pinged = Instant::now();
                    if let Err(e) = ws.send(Message::Ping(Vec::new().into())) {
                        return broke(format!("the connection broke: {e}"));
                    }
                }
            }
            Err(e) => return broke(format!("the connection broke: {e}")),
        }
    }
}

fn is_tick(e: &std::io::Error) -> bool {
    matches!(
        e.kind(),
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
    )
}

fn keep(inbox: &Inbox, inbound: &Inbound) {
    match inbound {
        Inbound::HandOver(handed) => inbox.hand(handed.clone()),
        Inbound::Merge(press) => inbox.merge_pressed(press.clone()),
        Inbound::SendBack(_) => {}
    }
}

/// Tells whoever pressed a button, privately, what happens next. Best effort: the press itself
/// is already kept, and the engine acts on it whether or not this arrives.
fn answer(bot: &Api, inbound: &Inbound) {
    let (press, words) = match inbound {
        Inbound::Merge(press) => (press, MERGE_HEARD.to_owned()),
        Inbound::SendBack(press) => (press, send_back_hint()),
        Inbound::HandOver(_) => return,
    };
    let body = json!({
        "channel": press.channel,
        "user": press.user,
        "thread_ts": press.thread_ts,
        "text": words,
    });
    let _ = bot.post(POST_EPHEMERAL, &body);
}
