//! The registry: secrets to the keychain (never settings), one adapter per unchanged setting,
//! and an HTTP client that reports failures without the request's headers.

mod support;

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{
    FormField, HandOver, Reply, SourceError, SourceForm, SourceProviders, TaskSource, Update,
};
use shep_domain::{SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::{FileSecrets, SecretStore};
use shep_infra::sources::http::Http;
use shep_infra::sources::{Connected, Secrets, SourceFactory, SourceRegistry};
use support::fixture_http::FixtureServer;

const TOKEN: &str = "lin_api_123";

struct Echo(String);

impl TaskSource for Echo {
    fn kind(&self) -> SourceKind {
        SourceKind::Linear
    }
    fn connection(&self) -> Result<String, SourceError> {
        Ok(self.0.clone())
    }
    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        Ok(Vec::new())
    }
    fn read(&self, _: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        Ok(None)
    }
    fn report(&self, _: &TaskSourceRef, _: &Update) -> Result<(), SourceError> {
        Ok(())
    }
    fn replies(&self, _: &TaskSourceRef, _: UnixTime) -> Result<Vec<Reply>, SourceError> {
        Ok(Vec::new())
    }
    fn candidates(&self, _: usize) -> Result<Vec<HandOver>, SourceError> {
        Ok(Vec::new())
    }
}

/// A Linear factory whose adapter answers with the token it was built with.
struct EchoFactory;

impl SourceFactory for EchoFactory {
    fn kind(&self) -> SourceKind {
        SourceKind::Linear
    }
    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![FormField {
                key: "token".into(),
                label: "API key".into(),
                secret: true,
                hint: String::new(),
                optional: false,
                ..FormField::default()
            }],
            hand_over: vec!["Add the label shep".into()],
        }
    }
    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let token = values.get("token").cloned().unwrap_or_default();
        Ok(Connected {
            setting: SourceSetting::new(SourceKind::Linear, "Acme").with_option("team", "ENG"),
            secrets: BTreeMap::from([("token".to_owned(), token)]),
        })
    }
    fn build(
        &self,
        _: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        Ok(Arc::new(Echo(secrets.get("token")?)))
    }
}

fn registry(dir: &std::path::Path) -> (SourceRegistry, Arc<FileSecrets>) {
    let store = Arc::new(FileSecrets::new(dir.join("secrets.json")));
    (
        SourceRegistry::new(store.clone(), vec![Box::new(EchoFactory)]),
        store,
    )
}

#[test]
fn connecting_keeps_secrets_in_the_store_and_builds_from_them() {
    let dir = tempfile::tempdir().unwrap();
    let (registry, store) = registry(dir.path());
    let values = BTreeMap::from([("token".to_owned(), TOKEN.to_owned())]);
    let setting = registry.connect(SourceKind::Linear, &values).unwrap();
    assert_eq!(setting.option("team"), Some("ENG"));
    assert!(setting.options.values().all(|v| v != TOKEN));
    assert_eq!(store.get("linear/token").unwrap().as_deref(), Some(TOKEN));

    let first = registry.source(&setting).unwrap();
    assert_eq!(first.connection().unwrap(), TOKEN);
    let again = registry.source(&setting).unwrap();
    assert!(
        Arc::ptr_eq(&first, &again),
        "the same adapter while unchanged"
    );
    let changed = setting.clone().with_option("team", "WEB");
    assert!(!Arc::ptr_eq(&first, &registry.source(&changed).unwrap()));

    registry.disconnect(SourceKind::Linear).unwrap();
    assert_eq!(store.get("linear/token").unwrap(), None);
    let err = registry.source(&setting).err().unwrap();
    assert!(err.0.contains("shep config --connect linear"), "{err}");
}

#[test]
fn a_source_without_an_adapter_says_so() {
    let dir = tempfile::tempdir().unwrap();
    let (registry, _) = registry(dir.path());
    assert_eq!(registry.form(SourceKind::Monday).fields.len(), 0);
    let err = registry
        .connect(SourceKind::Monday, &BTreeMap::new())
        .unwrap_err();
    assert!(err.0.contains("Monday"), "{err}");
}

#[test]
fn http_reads_json_and_reports_failures_without_headers() {
    let server = FixtureServer::start();
    server.on("GET", "/viewer", 200, r#"{"name":"Acme"}"#);
    server.on("POST", "/comment", 200, "");
    server.on("GET", "/secret", 401, r#"{"message":"Bad credentials"}"#);
    let http = Http::new(server.url());
    let auth = [("Authorization", TOKEN)];
    assert_eq!(http.get("/viewer", &auth).unwrap()["name"], "Acme");
    assert_eq!(
        http.post("comment", &auth, &serde_json::json!({ "body": "hi" }))
            .unwrap(),
        serde_json::Value::Null
    );
    server.on("GET", "/deleted", 404, r#"{"message":"Not Found"}"#);
    server.on("GET", "/archived", 410, r#"{"message":"Gone"}"#);
    for gone in ["/deleted", "/archived"] {
        assert!(shep_infra::sources::http::is_gone(
            &http.get(gone, &auth).unwrap_err()
        ));
    }
    let err = http.get("/secret", &auth).unwrap_err();
    assert!(
        !shep_infra::sources::http::is_gone(&err),
        "a refused token is not a missing item"
    );
    assert!(err.0.contains("401"), "{err}");
    assert!(err.0.contains("Bad credentials"), "{err}");
    assert!(!err.0.contains(TOKEN), "{err}");
    let requests = server.requests();
    assert_eq!(requests[0].header("authorization"), Some(TOKEN));
    assert_eq!(requests[1].json()["body"], "hi");
}
