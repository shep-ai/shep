use std::os::unix::net::UnixListener;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use shep_app::{AppError, Board, ShepApi};
use shep_jsonrpc::{Handler, Peer, RpcError};

use crate::method::{AddParams, Method, ReviewParams, StartParams, UpdateSettingsParams};
use crate::BOARD_CHANGED;

/// How often the board is compared with what subscribers last saw, to catch changes made
/// outside a request (the engine).
const BOARD_WATCH_INTERVAL: Duration = Duration::from_millis(250);

/// Answers every [`Method`] by calling the same [`ShepApi`] the in-process surfaces use, and
/// keeps subscribers' boards current.
pub struct RpcServer {
    api: Arc<dyn ShepApi>,
    subscribers: Mutex<Vec<Peer>>,
    last_board: Mutex<Option<Board>>,
}

impl RpcServer {
    pub fn new(api: Arc<dyn ShepApi>) -> Arc<Self> {
        Arc::new(Self {
            api,
            subscribers: Mutex::new(Vec::new()),
            last_board: Mutex::new(None),
        })
    }

    /// Serves connections until the listener fails, watching the board in the background.
    pub fn serve(self: &Arc<Self>, listener: &UnixListener) {
        let watcher = Arc::clone(self);
        std::thread::spawn(move || loop {
            std::thread::sleep(BOARD_WATCH_INTERVAL);
            watcher.publish();
        });
        shep_jsonrpc::serve(listener, self);
    }

    /// Sends the board to every subscriber if it changed since they last saw it.
    pub fn publish(&self) {
        let Ok(board) = self.api.board() else { return };
        let (Ok(mut last), Ok(mut subscribers)) = (self.last_board.lock(), self.subscribers.lock())
        else {
            return;
        };
        if last.as_ref() == Some(&board) {
            return;
        }
        subscribers.retain(|peer| peer.notify(BOARD_CHANGED, &board).is_ok());
        *last = Some(board);
    }

    fn subscribe(&self, peer: &Peer) -> Result<Board, AppError> {
        let board = self.api.board()?;
        if let (Ok(mut subscribers), Ok(mut last)) =
            (self.subscribers.lock(), self.last_board.lock())
        {
            // Everyone already holds this board (or is about to), so only newer ones are sent.
            if last.as_ref() != Some(&board) {
                subscribers.retain(|p| p.notify(BOARD_CHANGED, &board).is_ok());
                *last = Some(board.clone());
            }
            subscribers.push(peer.clone());
        }
        Ok(board)
    }

    fn dispatch(&self, method: Method, params: Value, peer: &Peer) -> Result<Value, RpcError> {
        let api = self.api.as_ref();
        match method {
            Method::Add => {
                let p: AddParams = parse(params)?;
                reply(api.add(&p.input, p.from_dir.as_deref().map(Path::new)))
            }
            Method::Start => reply(api.start(parse::<StartParams>(params)?.when)),
            Method::Board => reply(api.board()),
            Method::Review => {
                let p: ReviewParams = parse(params)?;
                reply(api.review(p.id, p.action))
            }
            Method::SettingsGet => reply(api.settings()),
            Method::SettingsUpdate => {
                reply(api.update_settings(parse::<UpdateSettingsParams>(params)?.change))
            }
            Method::Subscribe => reply(self.subscribe(peer)),
        }
    }
}

impl Handler for RpcServer {
    fn handle(&self, method: &str, params: Value, peer: &Peer) -> Result<Value, RpcError> {
        let method = Method::parse(method).ok_or_else(|| RpcError::method_not_found(method))?;
        let answer = self.dispatch(method, params, peer);
        if method != Method::Subscribe {
            self.publish();
        }
        answer
    }
}

fn parse<P: DeserializeOwned>(params: Value) -> Result<P, RpcError> {
    serde_json::from_value(params).map_err(RpcError::invalid_params)
}

fn reply<T: Serialize>(outcome: Result<T, AppError>) -> Result<Value, RpcError> {
    let value = outcome.map_err(|e| RpcError::application(e.to_string()))?;
    serde_json::to_value(value).map_err(|e| RpcError::application(e.to_string()))
}
