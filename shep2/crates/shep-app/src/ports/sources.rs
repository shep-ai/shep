//! Where work is handed over besides Shep itself: GitHub, Linear, Jira, Notion, Monday, Slack.
//! Every source is an adapter behind [`TaskSource`]; Shep answers in the same place.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{ClockTime, PullRequest, SourceKind, SourceSetting, TaskSourceRef, UnixTime};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct SourceError(pub String);

/// Work as its source describes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct HandOver {
    pub source: TaskSourceRef,
    pub title: String,
    /// The ticket's description or the message's text.
    pub body: String,
    /// Where a person opens it.
    pub url: String,
}

/// What Shep says in the source as the task moves.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Update {
    /// Right away: "Queued for tonight, 23:00" (status Tonight, a thread reply, …).
    Queued {
        /// `None`: it waits for `shep go`.
        starts: Option<ClockTime>,
        /// `owner/name`, when known.
        repo: Option<String>,
    },
    /// The agent needs an answer, asked where the task came from.
    Asked {
        question: String,
    },
    /// A draft pull request is ready for review.
    Ready {
        pr: PullRequest,
        /// One line like "CI green · +41 -12 · screenshot".
        summary: String,
        /// Screenshots and other proof files to attach where the source allows it.
        proof: Vec<PathBuf>,
    },
    Merged {
        pr: PullRequest,
    },
    /// Shep took the task off the board.
    Stopped {
        reason: String,
    },
}

/// Something a person did in the source after Shep last spoke there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    /// A comment or thread reply (never one of Shep's own).
    Said {
        at: UnixTime,
        author: String,
        text: String,
    },
    /// A Merge button in the source (Slack).
    Merge { at: UnixTime, author: String },
}

impl Reply {
    pub fn at(&self) -> UnixTime {
        match self {
            Self::Said { at, .. } | Self::Merge { at, .. } => *at,
        }
    }
}

/// One source, connected.
pub trait TaskSource: Send + Sync {
    fn kind(&self) -> SourceKind;
    /// What it is connected as ("Acme · team ENG"); an error when the token no longer works.
    fn connection(&self) -> Result<String, SourceError>;
    /// Everything handed over to Shep right now (a label, a status, a reaction, an assignee).
    /// Shep skips what it already has, so returning an item again is harmless.
    fn poll(&self) -> Result<Vec<HandOver>, SourceError>;
    /// One item, read fresh before work starts. `None` when it is gone.
    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError>;
    /// Says where the task stands, in place: a comment, a status change, a thread reply.
    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError>;
    /// What people said or pressed on the item at or after `since` (when Shep last spoke
    /// there), oldest first. Never Shep's own posts.
    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError>;
    /// Open items worth handing over first (onboarding), newest first, up to `limit`.
    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError>;
}

/// Where Shep can find a field's value itself, so nobody types what Shep already knows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum Prefill {
    /// `owner/name` of the repository Shep works in.
    RepositorySlug,
}

/// One thing a person fills in to connect a source.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct FormField {
    pub key: String,
    pub label: String,
    /// Kept in the OS keychain, never in settings; typed without echo.
    pub secret: bool,
    /// Where to find it, like "Linear → Settings → API → Personal API keys".
    pub hint: String,
    pub optional: bool,
    /// Where Shep can find the value itself (the adapter says).
    #[serde(default)]
    pub prefill: Option<Prefill>,
    /// The value Shep found; used when the person leaves the field empty.
    #[serde(default)]
    pub value: Option<String>,
}

/// How a source is connected and how work is handed over in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SourceForm {
    pub fields: Vec<FormField>,
    /// The moves a person already makes there, like "Add the label shep".
    pub hand_over: Vec<String>,
}

/// Makes adapters. Owns the tokens: it keeps them in the OS keychain on `connect` and reads
/// them when it builds an adapter, so the rest of Shep never holds a secret.
pub trait SourceProviders: Send + Sync {
    fn form(&self, kind: SourceKind) -> SourceForm;
    /// Checks the values against the source, keeps the secret ones, and returns the setting
    /// to save (non-secret options and what it is connected as).
    fn connect(
        &self,
        kind: SourceKind,
        values: &BTreeMap<String, String>,
    ) -> Result<SourceSetting, SourceError>;
    /// Forgets the source's tokens.
    fn disconnect(&self, kind: SourceKind) -> Result<(), SourceError>;
    /// The adapter for a connected source. The same adapter comes back while the setting is
    /// unchanged, so one that holds a connection (Slack's socket) keeps it.
    fn source(&self, setting: &SourceSetting) -> Result<Arc<dyn TaskSource>, SourceError>;
}
