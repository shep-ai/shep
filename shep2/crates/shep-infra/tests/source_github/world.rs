//! The fixture server, fake tools and registry every test here starts from.

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{SourceProviders, TaskSource};
use shep_domain::{SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::FileSecrets;
use shep_infra::sources::github::GitHubFactory;
use shep_infra::sources::SourceRegistry;

use crate::support::fake_gh::FakeGh;
use crate::support::fixture_http::{fixture, FixtureServer, Request};
use crate::support::source_contract::Case;

pub const TOKEN: &str = "gho_fake_token_for_shep_tests";
pub const MARKER: &str = "<!-- shep:update -->";
pub const COMMENTS: &str = "/repos/acme/app/issues/412/comments";
/// 2026-11-13T18:10:00Z, when Shep asked its question in the fixtures.
pub const SINCE: UnixTime = UnixTime(1_794_593_400);

pub fn item() -> TaskSourceRef {
    TaskSourceRef::GitHubIssue {
        repo: None,
        number: 412,
    }
}

pub fn case() -> Case<'static> {
    Case {
        kind: SourceKind::GitHub,
        item: item(),
        token: TOKEN,
        reply: "zone is UTC",
        shep_said: "Which zone",
        since: SINCE,
    }
}

pub struct World {
    pub server: FixtureServer,
    pub gh: FakeGh,
    pub store: Arc<FileSecrets>,
    pub registry: SourceRegistry,
    _dir: tempfile::TempDir,
}

/// A fixture server answering every call the adapter makes, and `gh` signed in.
pub fn world() -> World {
    let server = FixtureServer::start();
    server.on("GET", "/user", 200, &fixture("github/user.json"));
    server.on("GET", "/repos/acme/app", 200, &fixture("github/repo.json"));
    server.on(
        "GET",
        "/repos/acme/app/issues?",
        200,
        &fixture("github/issues.json"),
    );
    server.on(
        "GET",
        "/repos/acme/app/issues/412",
        200,
        &fixture("github/issue.json"),
    );
    server.on("GET", COMMENTS, 200, &fixture("github/comments.json"));
    server.on(
        "POST",
        COMMENTS,
        201,
        &fixture("github/comment_created.json"),
    );
    let gh = FakeGh::new();
    gh.answer("auth_token", TOKEN, 0);
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let program = gh.here().join("gh").display().to_string();
    let factory = GitHubFactory::new(program, server.url());
    let registry = SourceRegistry::new(store.clone(), vec![Box::new(factory)]);
    World {
        server,
        gh,
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
            .connect(SourceKind::GitHub, &values(pairs))
            .unwrap();
        let source = self.registry.source(&setting).unwrap();
        (setting, source)
    }

    pub fn source(&self) -> Arc<dyn TaskSource> {
        self.connect(&[("repo", "acme/app")]).1
    }

    pub fn comments_posted(&self) -> Vec<Request> {
        self.server
            .writes()
            .into_iter()
            .filter(|r| r.method == "POST" && r.path == COMMENTS)
            .collect()
    }
}
