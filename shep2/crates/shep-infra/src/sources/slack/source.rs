//! The Slack adapter: the socket's thread fills an inbox; the engine's calls read it and the
//! Web API.

use std::sync::{Arc, Mutex, PoisonError};

use serde_json::Value;
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};

use super::api::{Api, Identity, POST_MESSAGE};
use super::inbox::{Handed, Inbox, SocketState};
use super::link::{ts_seconds, MessageLink};
use super::socket::Socket;
use super::{messages, proof, read};

pub struct SlackSource {
    api: Api,
    inbox: Arc<Inbox>,
    me: Mutex<Option<Identity>>,
    /// Dropped with the adapter, which stops its thread.
    _socket: Socket,
}

impl SlackSource {
    pub fn start(base: &str, bot_token: &str, app_token: &str) -> Self {
        let api = Api::new(base, bot_token);
        let inbox = Arc::new(Inbox::default());
        let socket = Socket::start(Api::new(base, app_token), api.clone(), inbox.clone());
        Self {
            api,
            inbox,
            me: Mutex::default(),
            _socket: socket,
        }
    }

    /// Who the bot token belongs to, asked afresh.
    fn whoami(&self) -> Result<Identity, SourceError> {
        let me = self.api.identity()?;
        *self.me.lock().unwrap_or_else(PoisonError::into_inner) = Some(me.clone());
        Ok(me)
    }

    fn me(&self) -> Result<Identity, SourceError> {
        let known = self
            .me
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone();
        known.map_or_else(|| self.whoami(), Ok)
    }

    fn handed(&self, item: &Handed, me: &Identity) -> Result<Option<HandOver>, SourceError> {
        let Some(message) = read::message(&self.api, &item.channel, &item.ts)? else {
            return Ok(None);
        };
        let url = read::permalink(&self.api, &item.channel, &item.ts)?;
        Ok(Some(read::hand_over(&url, &message, me)))
    }
}

impl TaskSource for SlackSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Slack
    }

    fn connection(&self) -> Result<String, SourceError> {
        let me = self.whoami()?;
        match self.inbox.socket() {
            SocketState::Failed(why) => Err(SourceError(format!(
                "Slack's live connection is down: {why}"
            ))),
            SocketState::Connecting | SocketState::Connected => Ok(me.team),
        }
    }

    /// Proves the bot token still works, then reads what was handed over since the last poll.
    /// What cannot be read yet stays for the next poll; a deleted message is dropped.
    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let me = self.whoami()?;
        let mut found = Vec::new();
        let mut later = Vec::new();
        let mut first_error = None;
        for item in self.inbox.take_handed() {
            match self.handed(&item, &me) {
                Ok(handed) => found.extend(handed),
                Err(e) => {
                    first_error.get_or_insert(e);
                    later.push(item);
                }
            }
        }
        self.inbox.put_back(later);
        match first_error {
            Some(e) if found.is_empty() => Err(e),
            _ => Ok(found),
        }
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let link = MessageLink::from_ref(source)?;
        let me = self.me()?;
        let message = read::message(&self.api, &link.channel, &link.ts)?;
        Ok(message.map(|m| read::hand_over(&source.to_string(), &m, &me)))
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let link = MessageLink::from_ref(source)?;
        if let Update::Ready { proof, .. } = update {
            proof::upload(&self.api, &link.channel, link.thread(), proof)?;
        }
        let mut body = messages::render(update, &link.channel, link.thread());
        body["channel"] = Value::from(link.channel.as_str());
        body["thread_ts"] = Value::from(link.thread());
        body["unfurl_links"] = Value::Bool(false);
        self.api.post(POST_MESSAGE, &body)?;
        Ok(())
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let link = MessageLink::from_ref(source)?;
        let me = self.me()?;
        let thread = read::thread_since(&self.api, &link.channel, link.thread(), since.0)?;
        let mut replies: Vec<Reply> = thread
            .iter()
            .filter(|m| m["ts"] != link.ts.as_str() && m["ts"] != link.thread())
            .filter(|m| read::from_person(m, &me))
            .filter_map(|m| {
                let at = ts_seconds(m["ts"].as_str()?)?;
                (at >= since.0).then(|| Reply::Said {
                    at: UnixTime(at),
                    author: m["user"].as_str().unwrap_or_default().to_owned(),
                    text: read::plain(m["text"].as_str().unwrap_or_default(), &me.user_id),
                })
            })
            .collect();
        let pressed = self.inbox.merges(&link.channel, link.thread(), since.0);
        replies.extend(pressed.into_iter().map(|p| Reply::Merge {
            at: UnixTime(p.at),
            author: p.user,
        }));
        replies.sort_by_key(|r| r.at().0);
        Ok(replies)
    }

    /// Recent messages from people in the channels Shep is in, not yet handed over. Slack has
    /// no "open" items, so these are only what people said lately; onboarding shows them as
    /// suggestions.
    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let me = self.me()?;
        read::candidates(&self.api, &me, limit)
    }
}
