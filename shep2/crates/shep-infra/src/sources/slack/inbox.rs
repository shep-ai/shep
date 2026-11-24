//! What arrived over the socket and has not been read yet: messages handed over, Merge
//! presses, and how the socket is doing. Shared by the socket's thread and the adapter.

use std::collections::VecDeque;
use std::sync::{Mutex, MutexGuard};

/// Presses are kept for `replies(since)`; old ones fall off past this many.
const MAX_PRESSES: usize = 500;

/// A message someone handed to Shep.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Handed {
    pub channel: String,
    pub ts: String,
}

/// A Merge button pressed in a thread.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Press {
    pub channel: String,
    pub thread_ts: String,
    pub user: String,
    pub at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum SocketState {
    #[default]
    Connecting,
    Connected,
    /// The last attempt failed, and why (never with a token or the socket's URL).
    Failed(String),
}

#[derive(Default)]
struct State {
    handed: Vec<Handed>,
    merges: VecDeque<Press>,
    socket: SocketState,
}

#[derive(Default)]
pub struct Inbox {
    state: Mutex<State>,
}

impl Inbox {
    fn state(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub fn hand(&self, handed: Handed) {
        let mut state = self.state();
        if !state.handed.contains(&handed) {
            state.handed.push(handed);
        }
    }

    pub fn take_handed(&self) -> Vec<Handed> {
        std::mem::take(&mut self.state().handed)
    }

    /// Puts back what could not be read yet, ahead of anything newer.
    pub fn put_back(&self, items: Vec<Handed>) {
        let mut state = self.state();
        let newer = std::mem::replace(&mut state.handed, items);
        for item in newer {
            if !state.handed.contains(&item) {
                state.handed.push(item);
            }
        }
    }

    pub fn merge_pressed(&self, press: Press) {
        let mut state = self.state();
        state.merges.push_back(press);
        while state.merges.len() > MAX_PRESSES {
            state.merges.pop_front();
        }
    }

    /// Merge presses in a thread at or after `since`.
    pub fn merges(&self, channel: &str, thread_ts: &str, since: i64) -> Vec<Press> {
        self.state()
            .merges
            .iter()
            .filter(|p| p.channel == channel && p.thread_ts == thread_ts && p.at >= since)
            .cloned()
            .collect()
    }

    pub fn set_socket(&self, socket: SocketState) {
        self.state().socket = socket;
    }

    pub fn socket(&self) -> SocketState {
        self.state().socket.clone()
    }
}
