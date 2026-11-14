//! Monday as a task source, against recorded GraphQL responses: the shared contract, then the
//! exact operations (token header, API version, the Tonight filter, updates and column changes).

mod support;

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::{json, Value};
use shep_app::ports::{Reply, SourceProviders, TaskSource, Update};
use shep_domain::{ClockTime, PullRequest, SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::{FileSecrets, SecretStore};
use shep_infra::sources::monday::MondayFactory;
use shep_infra::sources::tracker::SHEP_MARK;
use shep_infra::sources::{SourceFactory, SourceRegistry};
use support::fixture_http::{fixture, FixtureServer, Request};
use support::source_contract::{self, Case};

const TOKEN: &str = "eyJhbGciOiJIUzI1NiJ9.monday-test-token";
const BOARD: &str = "1234567890";
const API: &str = "/v2";
/// 2026-11-14 08:00 UTC: between Dana's two replies.
const SINCE: UnixTime = UnixTime(1_794_643_200);

fn item() -> TaskSourceRef {
    TaskSourceRef::Monday {
        url: "https://acme.monday.com/boards/1234567890/pulses/9876543210".into(),
    }
}

fn case() -> Case<'static> {
    Case {
        kind: SourceKind::Monday,
        item: item(),
        token: TOKEN,
        reply: "Use the store's zone",
        shep_said: "Ready for review",
        since: SINCE,
    }
}

fn served() -> FixtureServer {
    let server = FixtureServer::start();
    let answer = |operation: &str, file: &str| {
        server.on_body(
            "POST",
            API,
            operation,
            200,
            &fixture(&format!("monday/{file}.json")),
        );
    };
    answer("ShepAccount", "account");
    answer("ShepBoard", "board");
    answer("ShepTonight", "items_page");
    answer("ShepNewest", "items_page");
    answer("ShepRead", "item");
    answer("ShepUpdates", "updates");
    answer("ShepPost", "create_update");
    answer("ShepFill", "change_columns");
    server.on_body(
        "POST",
        API,
        "1111111111",
        200,
        &fixture("monday/item_missing.json"),
    );
    server
}

struct Connected {
    _dir: tempfile::TempDir,
    store: Arc<FileSecrets>,
    setting: SourceSetting,
    source: Arc<dyn TaskSource>,
}

fn connect(server: &FixtureServer) -> Connected {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let registry = SourceRegistry::new(
        store.clone(),
        vec![Box::new(MondayFactory::at(server.url()))],
    );
    let values = BTreeMap::from([
        ("token".to_owned(), TOKEN.to_owned()),
        (
            "board".to_owned(),
            format!("https://acme.monday.com/boards/{BOARD}"),
        ),
    ]);
    let setting = registry.connect(SourceKind::Monday, &values).unwrap();
    let source = registry.source(&setting).unwrap();
    server.clear_requests();
    Connected {
        _dir: dir,
        store,
        setting,
        source,
    }
}

fn pr() -> PullRequest {
    PullRequest {
        number: 101,
        url: "https://github.com/acme/app/pull/101".into(),
    }
}

/// The GraphQL operations sent whose text contains `name`.
fn operations(server: &FixtureServer, name: &str) -> Vec<Value> {
    server
        .requests()
        .iter()
        .map(Request::json)
        .filter(|body| body["query"].as_str().unwrap_or_default().contains(name))
        .collect()
}

#[test]
fn monday_holds_the_source_contract() {
    let server = served();
    let monday = connect(&server);
    source_contract::holds(&case(), &server, monday.source.as_ref());
}

#[test]
fn monday_fails_politely_without_showing_the_token() {
    let server = served();
    let monday = connect(&server);
    source_contract::fails_politely(&case(), &server, monday.source.as_ref());
}

#[test]
fn connecting_saves_the_board_and_keeps_the_token_secret() {
    let server = served();
    let monday = connect(&server);
    assert_eq!(monday.setting.option("board"), Some(BOARD));
    assert_eq!(monday.setting.account, "Acme · Sprint tasks");
    assert!(monday.setting.options.values().all(|v| !v.contains(TOKEN)));
    assert_eq!(
        monday.store.get("monday/token").unwrap().as_deref(),
        Some(TOKEN)
    );

    monday.source.poll().unwrap();
    let request = &server.requests()[0];
    assert_eq!(request.path, API);
    assert_eq!(request.header("authorization"), Some(TOKEN));
    assert_eq!(request.header("api-version"), Some("2026-10"));
}

#[test]
fn hand_over_is_the_tonight_label_by_its_id() {
    let server = served();
    let monday = connect(&server);
    let polled = monday.source.poll().unwrap();
    assert_eq!(polled.len(), 2);
    assert_eq!(polled[0].source, item());
    assert_eq!(polled[0].title, "Coupon field rejects lowercase codes");
    assert!(polled[0].body.contains("apply save10"), "{polled:?}");
    let tonight = &operations(&server, "ShepTonight")[0];
    assert_eq!(tonight["variables"]["board"], json!([BOARD]));
    assert_eq!(
        tonight["variables"]["query"],
        json!({ "rules": [{ "column_id": "status", "compare_value": [7], "operator": "any_of" }] })
    );
}

#[test]
fn queued_posts_an_update_with_the_mark() {
    let server = served();
    let monday = connect(&server);
    let queued = Update::Queued {
        starts: Some(ClockTime::parse("23:00").unwrap()),
        repo: Some("acme/app".into()),
    };
    monday.source.report(&item(), &queued).unwrap();
    let posted = operations(&server, "ShepPost");
    assert_eq!(posted.len(), 1);
    assert_eq!(posted[0]["variables"]["item"], "9876543210");
    let body = posted[0]["variables"]["body"].as_str().unwrap();
    assert!(
        body.starts_with(&format!("<p>{SHEP_MARK} Queued for tonight, 23:00")),
        "{body}"
    );
    assert_eq!(operations(&server, "ShepFill"), Vec::<Value>::new());
}

#[test]
fn ready_fills_the_pr_column_sets_in_review_and_posts_the_summary() {
    let server = served();
    let monday = connect(&server);
    let ready = Update::Ready {
        pr: pr(),
        summary: "CI green · +41 -12".into(),
        proof: Vec::new(),
    };
    monday.source.report(&item(), &ready).unwrap();
    let fill = &operations(&server, "ShepFill")[0]["variables"];
    assert_eq!(fill["board"], BOARD);
    assert_eq!(fill["item"], "9876543210");
    let columns: Value = serde_json::from_str(fill["columns"].as_str().unwrap()).unwrap();
    assert_eq!(
        columns,
        json!({
            "link_mkr4x2": { "url": pr().url, "text": "pull request #101" },
            "status": { "label": "In review" }
        })
    );
    let body = operations(&server, "ShepPost")[0]["variables"]["body"].clone();
    let body = body.as_str().unwrap();
    assert!(
        body.contains(r#"<a href="https://github.com/acme/app/pull/101">pull request #101</a>"#),
        "{body}"
    );
    assert!(body.contains("CI green · +41 -12"), "{body}");
    let names: Vec<String> = server
        .requests()
        .iter()
        .map(|r| r.json()["query"].as_str().unwrap_or_default().to_owned())
        .collect();
    assert!(
        names.last().unwrap().contains("ShepPost"),
        "say it last: {names:?}"
    );
}

#[test]
fn a_board_without_a_pr_column_or_in_review_label_only_gets_the_update() {
    let server = served();
    let monday = connect(&server);
    let plain = fixture("monday/board.json")
        .replace("\"In review\"", "\"Waiting\"")
        .replace("\"type\": \"link\"", "\"type\": \"text\"");
    server.on_body("POST", API, "ShepBoard", 200, &plain);
    let ready = Update::Ready {
        pr: pr(),
        summary: String::new(),
        proof: Vec::new(),
    };
    monday.source.report(&item(), &ready).unwrap();
    assert_eq!(operations(&server, "ShepFill"), Vec::<Value>::new());
    assert_eq!(operations(&server, "ShepPost").len(), 1);
}

#[test]
fn answers_are_replies_and_later_updates_oldest_first() {
    let server = served();
    let monday = connect(&server);
    let replies = monday
        .source
        .replies(&item(), UnixTime(SINCE.0 - 3_600))
        .unwrap();
    assert_eq!(
        replies,
        [
            Reply::Said {
                at: UnixTime(1_794_642_900),
                author: "Dana Whitfield".into(),
                text: "Looking into it".into(),
            },
            Reply::Said {
                at: UnixTime(1_794_643_800),
                author: "Dana Whitfield".into(),
                text: "Use the store's zone, like the invoices do".into(),
            },
        ]
    );
}

#[test]
fn graphql_errors_fail_the_call_and_a_deleted_item_reads_as_gone() {
    let server = served();
    let monday = connect(&server);
    let gone = TaskSourceRef::Monday {
        url: "https://acme.monday.com/boards/1234567890/pulses/1111111111".into(),
    };
    assert_eq!(monday.source.read(&gone).unwrap(), None);

    server.on_body(
        "POST",
        API,
        "ShepPost",
        200,
        &fixture("monday/unauthorized.json"),
    );
    let asked = Update::Asked {
        question: "Which zone?".into(),
    };
    let err = monday.source.report(&item(), &asked).unwrap_err();
    assert!(
        err.0.contains("User unauthorized to perform action"),
        "{err}"
    );
    assert!(!err.0.contains(TOKEN), "{err}");
}

#[test]
fn the_form_asks_for_a_token_and_a_board() {
    let form = MondayFactory::default().form();
    let keys: Vec<(&str, bool)> = form
        .fields
        .iter()
        .map(|f| (f.key.as_str(), f.secret))
        .collect();
    assert_eq!(keys, [("token", true), ("board", false)]);
    assert!(
        form.fields[0].hint.contains("Developers"),
        "{}",
        form.fields[0].hint
    );
    assert!(form.hand_over.iter().any(|h| h.contains("Tonight")));
}
