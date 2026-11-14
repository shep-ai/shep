//! Sources in memory: a test hands work over, writes replies, and reads what Shep reported.

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use shep_domain::{SourceKind, SourceSetting, TaskSourceRef, UnixTime};

use super::lock;
use crate::ports::{
    FormField, HandOver, Reply, SourceError, SourceForm, SourceProviders, TaskSource, Update,
};

/// The form every fake source shows: one secret token.
pub const FAKE_TOKEN_KEY: &str = "token";
/// What every fake source says it is connected as.
pub const FAKE_ACCOUNT: &str = "Acme";

#[derive(Default)]
struct SourceState {
    handed_over: Vec<HandOver>,
    items: HashMap<String, HandOver>,
    reports: Vec<(TaskSourceRef, Update)>,
    replies: Vec<(TaskSourceRef, Reply)>,
    candidates: Vec<HandOver>,
    failing: Option<String>,
    polls: u32,
}

/// One source in memory.
pub struct FakeSource {
    kind: SourceKind,
    state: Mutex<SourceState>,
}

impl FakeSource {
    pub fn new(kind: SourceKind) -> Self {
        Self {
            kind,
            state: Mutex::default(),
        }
    }

    /// Hands this item over to Shep (it stays handed over, like a label does).
    pub fn hand_over(&self, item: HandOver) {
        let mut s = lock(&self.state);
        s.items.insert(item.source.to_string(), item.clone());
        s.handed_over.push(item);
    }
    /// An item that exists in the source without being handed over.
    pub fn put(&self, item: HandOver) {
        lock(&self.state)
            .items
            .insert(item.source.to_string(), item);
    }
    pub fn reply(&self, source: &TaskSourceRef, reply: Reply) {
        lock(&self.state).replies.push((source.clone(), reply));
    }
    pub fn offer(&self, item: HandOver) {
        lock(&self.state).candidates.push(item);
    }
    /// Every call fails with `why` until it is `None` again.
    pub fn fail(&self, why: Option<&str>) {
        lock(&self.state).failing = why.map(str::to_owned);
    }
    pub fn reports(&self) -> Vec<(TaskSourceRef, Update)> {
        lock(&self.state).reports.clone()
    }
    pub fn polls(&self) -> u32 {
        lock(&self.state).polls
    }

    fn check(&self) -> Result<(), SourceError> {
        match &lock(&self.state).failing {
            Some(why) => Err(SourceError(why.clone())),
            None => Ok(()),
        }
    }
}

impl TaskSource for FakeSource {
    fn kind(&self) -> SourceKind {
        self.kind
    }
    fn connection(&self) -> Result<String, SourceError> {
        self.check()?;
        Ok(FAKE_ACCOUNT.into())
    }
    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        self.check()?;
        let mut s = lock(&self.state);
        s.polls += 1;
        Ok(s.handed_over.clone())
    }
    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        self.check()?;
        Ok(lock(&self.state).items.get(&source.to_string()).cloned())
    }
    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        self.check()?;
        lock(&self.state)
            .reports
            .push((source.clone(), update.clone()));
        Ok(())
    }
    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        self.check()?;
        Ok(lock(&self.state)
            .replies
            .iter()
            .filter(|(s, r)| s == source && r.at() >= since)
            .map(|(_, r)| r.clone())
            .collect())
    }
    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        self.check()?;
        Ok(lock(&self.state)
            .candidates
            .iter()
            .take(limit)
            .cloned()
            .collect())
    }
}

/// Every source kind, in memory, with the tokens it was given.
#[derive(Default)]
pub struct FakeSources {
    sources: Mutex<HashMap<SourceKind, Arc<FakeSource>>>,
    tokens: Mutex<HashMap<SourceKind, String>>,
}

impl FakeSources {
    /// The source of this kind (made on first use).
    pub fn get(&self, kind: SourceKind) -> Arc<FakeSource> {
        lock(&self.sources)
            .entry(kind)
            .or_insert_with(|| Arc::new(FakeSource::new(kind)))
            .clone()
    }
    /// The token kept for this kind, if connected.
    pub fn token(&self, kind: SourceKind) -> Option<String> {
        lock(&self.tokens).get(&kind).cloned()
    }
}

impl SourceProviders for FakeSources {
    fn form(&self, kind: SourceKind) -> SourceForm {
        SourceForm {
            fields: vec![FormField {
                key: FAKE_TOKEN_KEY.into(),
                label: format!("{} token", kind.display_name()),
                secret: true,
                hint: String::new(),
                optional: false,
            }],
            hand_over: vec![format!("Hand it to Shep in {}", kind.display_name())],
        }
    }
    fn connect(
        &self,
        kind: SourceKind,
        values: &BTreeMap<String, String>,
    ) -> Result<SourceSetting, SourceError> {
        let token = values
            .get(FAKE_TOKEN_KEY)
            .filter(|t| !t.trim().is_empty())
            .ok_or_else(|| SourceError("a token is needed".into()))?;
        let account = self.get(kind).connection()?;
        lock(&self.tokens).insert(kind, token.clone());
        let mut setting = SourceSetting::new(kind, &account);
        for (key, value) in values.iter().filter(|(k, _)| *k != FAKE_TOKEN_KEY) {
            setting = setting.with_option(key, value);
        }
        Ok(setting)
    }
    fn disconnect(&self, kind: SourceKind) -> Result<(), SourceError> {
        lock(&self.tokens).remove(&kind);
        Ok(())
    }
    fn source(&self, setting: &SourceSetting) -> Result<Arc<dyn TaskSource>, SourceError> {
        Ok(self.get(setting.kind))
    }
}
