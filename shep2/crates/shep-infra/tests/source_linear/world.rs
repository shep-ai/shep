//! The fixture server, fake tools and registry every test here starts from.

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::Value;
use shep_app::ports::{SourceProviders, TaskSource};
use shep_domain::{SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::FileSecrets;
use shep_infra::sources::linear::LinearFactory;
use shep_infra::sources::SourceRegistry;

use crate::support::fixture_http::{fixture, FixtureServer, Request};
use crate::support::source_contract::Case;

pub const TOKEN: &str = "lin_api_7Qm2v9Xc4Rk1Tz8Lp3Wn6Yb5Hd0Sg";
pub const GRAPHQL: &str = "/graphql";
pub const SIGNATURE: &str = "— sent by Shep";
pub const ISSUE_ID: &str = "a3c1f6de-2b0e-4b8e-9b1a-6f2d1c9e0342";
pub const TONIGHT_ID: &str = "b1d4c7e0-1a2b-4c3d-8e9f-0a1b2c3d4e02";
pub const IN_REVIEW_ID: &str = "b1d4c7e0-1a2b-4c3d-8e9f-0a1b2c3d4e04";
/// 2026-11-13T18:10:00Z, when Shep asked its question in the fixtures.
pub const SINCE: UnixTime = UnixTime(1_794_593_400);

pub fn item() -> TaskSourceRef {
    TaskSourceRef::Linear {
        key: "ENG-342".into(),
    }
}

pub fn case() -> Case<'static> {
    Case {
        kind: SourceKind::Linear,
        item: item(),
        token: TOKEN,
        reply: "zone is UTC",
        shep_said: "Which zone",
        since: SINCE,
    }
}

pub struct World {
    pub server: FixtureServer,
    pub store: Arc<FileSecrets>,
    pub registry: SourceRegistry,
    _dir: tempfile::TempDir,
}

pub fn answer(server: &FixtureServer, operation: &str, file: &str) {
    server.on_body("POST", GRAPHQL, operation, 200, &fixture(file));
}

/// A fixture server answering every operation the adapter sends.
pub fn world() -> World {
    let server = FixtureServer::start();
    answer(&server, "query ShepViewer", "linear/viewer.json");
    answer(&server, "query ShepTeam", "linear/teams.json");
    answer(&server, "query ShepWaiting", "linear/issues.json");
    answer(&server, "query ShepOffer", "linear/issues.json");
    answer(&server, "query ShepRead", "linear/issue.json");
    answer(&server, "query ShepPlace", "linear/place.json");
    answer(&server, "query ShepReplies", "linear/comments.json");
    answer(
        &server,
        "mutation ShepComment",
        "linear/comment_created.json",
    );
    answer(&server, "mutation ShepMove", "linear/issue_updated.json");
    answer(
        &server,
        "mutation ShepAttach",
        "linear/attachment_created.json",
    );
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let factory = LinearFactory::new(server.url());
    let registry = SourceRegistry::new(store.clone(), vec![Box::new(factory)]);
    World {
        server,
        store,
        registry,
        _dir: dir,
    }
}

pub fn values(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect()
}

impl World {
    pub fn connect(&self, pairs: &[(&str, &str)]) -> (SourceSetting, Arc<dyn TaskSource>) {
        let setting = self
            .registry
            .connect(SourceKind::Linear, &values(pairs))
            .unwrap();
        let source = self.registry.source(&setting).unwrap();
        (setting, source)
    }

    pub fn source(&self) -> Arc<dyn TaskSource> {
        self.connect(&[("token", TOKEN), ("team", "ENG")]).1
    }

    /// The requests that sent this operation, oldest first.
    pub fn sent(&self, operation: &str) -> Vec<Request> {
        self.server
            .requests()
            .into_iter()
            .filter(|r| r.body.contains(operation))
            .collect()
    }

    pub fn variables(&self, operation: &str) -> Vec<Value> {
        self.sent(operation)
            .iter()
            .map(|r| r.json()["variables"].clone())
            .collect()
    }
}
