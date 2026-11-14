//! Notion as a task source, against recorded API responses: the shared contract, then the exact
//! calls (version header, the Status filter, the Shep and PR properties, comments, blocks).

mod support;

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::{json, Value};
use shep_app::ports::{Reply, SourceProviders, TaskSource, Update};
use shep_domain::{ClockTime, PullRequest, SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::{FileSecrets, SecretStore};
use shep_infra::sources::notion::NotionFactory;
use shep_infra::sources::tracker::SHEP_MARK;
use shep_infra::sources::{SourceFactory, SourceRegistry};
use support::fixture_http::{fixture, FixtureServer, Request};
use support::source_contract::{self, Case};

const TOKEN: &str = "ntn_fake_notion_token_for_tests";
const DATABASE: &str = "1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b";
const DATA_SOURCE: &str = "/v1/data_sources/2a3b4c5d-6e7f-4801-9a2b-3c4d5e6f7a8b";
const PAGE: &str = "/v1/pages/3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0";
const CHILDREN: &str = "/v1/blocks/3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0/children";
const COMMENTS: &str = "/v1/comments";
/// 2026-11-14 08:00 UTC: between Dana's two comments.
const SINCE: UnixTime = UnixTime(1_794_643_200);

fn item() -> TaskSourceRef {
    TaskSourceRef::Notion {
        url: "https://www.notion.so/3b4c5d6e7f804912a3b4c5d6e7f8a9b0".into(),
    }
}

fn case() -> Case<'static> {
    Case {
        kind: SourceKind::Notion,
        item: item(),
        token: TOKEN,
        reply: "Use the store's zone",
        shep_said: "Which zone when",
        since: SINCE,
    }
}

fn served() -> FixtureServer {
    let server = FixtureServer::start();
    server.on("GET", "/v1/users/me", 200, &fixture("notion/users_me.json"));
    let database = format!("/v1/databases/{DATABASE}");
    server.on("GET", &database, 200, &fixture("notion/database.json"));
    server.on("GET", DATA_SOURCE, 200, &fixture("notion/data_source.json"));
    let query = format!("{DATA_SOURCE}/query");
    server.on("POST", &query, 200, &fixture("notion/query.json"));
    server.on("GET", PAGE, 200, &fixture("notion/page.json"));
    server.on("PATCH", PAGE, 200, &fixture("notion/page.json"));
    let markdown = format!("{PAGE}/markdown");
    server.on("GET", &markdown, 200, &fixture("notion/page_markdown.json"));
    let other = "/v1/pages/4c5d6e7f-8091-4a23-b4c5-d6e7f8a9b0c1/markdown";
    server.on("GET", other, 200, &fixture("notion/page_markdown.json"));
    let missing = fixture("notion/page_missing.json");
    server.on("GET", "/v1/pages/6e7f8091", 404, &missing);
    server.on("GET", COMMENTS, 200, &fixture("notion/comments.json"));
    server.on(
        "POST",
        COMMENTS,
        200,
        &fixture("notion/comment_created.json"),
    );
    server.on(
        "PATCH",
        CHILDREN,
        200,
        &fixture("notion/blocks_appended.json"),
    );
    server
}

/// Serves the database's schema and the page with `edit` applied to their properties.
fn reshaped(server: &FixtureServer, edit: impl Fn(&mut serde_json::Map<String, Value>)) {
    let mut schema: Value = serde_json::from_str(&fixture("notion/data_source.json")).unwrap();
    edit(schema["properties"].as_object_mut().unwrap());
    server.on("GET", DATA_SOURCE, 200, &schema.to_string());
    let mut page: Value = serde_json::from_str(&fixture("notion/page.json")).unwrap();
    edit(page["properties"].as_object_mut().unwrap());
    server.on("GET", PAGE, 200, &page.to_string());
    server.on(
        "GET",
        &format!("{PAGE}/markdown"),
        200,
        &fixture("notion/page_markdown.json"),
    );
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
        vec![Box::new(NotionFactory::at(server.url()))],
    );
    let values = BTreeMap::from([
        ("token".to_owned(), TOKEN.to_owned()),
        (
            "database".to_owned(),
            "https://app.notion.com/p/1f2e3d4c5b6a47988a9b0c1d2e3f4a5b?v=7f8e9d0c".to_owned(),
        ),
    ]);
    let setting = registry.connect(SourceKind::Notion, &values).unwrap();
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

fn queued() -> Update {
    Update::Queued {
        starts: Some(ClockTime::parse("23:00").unwrap()),
        repo: Some("acme/app".into()),
    }
}

fn sent(server: &FixtureServer, method: &str, path: &str) -> Vec<Request> {
    server
        .requests()
        .into_iter()
        .filter(|r| r.method == method && r.path.starts_with(path))
        .collect()
}

fn plain(rich_text: &Value) -> String {
    rich_text
        .as_array()
        .into_iter()
        .flatten()
        .map(|t| t["text"]["content"].as_str().unwrap_or_default())
        .collect()
}

#[test]
fn notion_holds_the_source_contract() {
    let server = served();
    let notion = connect(&server);
    source_contract::holds(&case(), &server, notion.source.as_ref());
}

#[test]
fn notion_fails_politely_without_showing_the_token() {
    let server = served();
    let notion = connect(&server);
    source_contract::fails_politely(&case(), &server, notion.source.as_ref());
}

#[test]
fn connecting_saves_the_database_id_and_keeps_the_token_secret() {
    let server = served();
    let notion = connect(&server);
    assert_eq!(notion.setting.option("database"), Some(DATABASE));
    assert_eq!(notion.setting.account, "Acme · Tasks");
    assert!(notion.setting.options.values().all(|v| !v.contains(TOKEN)));
    assert_eq!(
        notion.store.get("notion/token").unwrap().as_deref(),
        Some(TOKEN)
    );

    notion.source.poll().unwrap();
    let request = &server.requests()[0];
    assert_eq!(
        request.header("authorization"),
        Some(format!("Bearer {TOKEN}").as_str())
    );
    assert_eq!(request.header("notion-version"), Some("2026-03-11"));
}

#[test]
fn hand_over_is_status_tonight_as_a_status_or_a_select() {
    let server = served();
    let notion = connect(&server);
    let polled = notion.source.poll().unwrap();
    assert_eq!(polled.len(), 2);
    assert_eq!(polled[0].source, item());
    assert_eq!(polled[0].title, "Coupon field rejects lowercase codes");
    assert_eq!(
        polled[0].url,
        "https://app.notion.com/p/3b4c5d6e7f804912a3b4c5d6e7f8a9b0"
    );
    let query = &sent(&server, "POST", &format!("{DATA_SOURCE}/query"))[0];
    assert_eq!(
        query.json()["filter"],
        json!({ "property": "Status", "status": { "equals": "Tonight" } })
    );

    reshaped(&server, |props| {
        props["Status"]["type"] = json!("select");
        let options = props["Status"]["status"].clone();
        props["Status"]["select"] = options;
    });
    server.clear_requests();
    notion.source.poll().unwrap();
    let query = &sent(&server, "POST", &format!("{DATA_SOURCE}/query"))[0];
    assert_eq!(query.json()["filter"]["select"]["equals"], "Tonight");
}

#[test]
fn queued_sets_the_shep_property_or_comments_when_there_is_none() {
    let server = served();
    let notion = connect(&server);
    notion.source.report(&item(), &queued()).unwrap();
    let patch = &sent(&server, "PATCH", PAGE)[0].json();
    assert_eq!(
        plain(&patch["properties"]["Shep"]["rich_text"]),
        "queued for 23:00"
    );
    assert_eq!(patch["properties"].as_object().unwrap().len(), 1, "{patch}");
    assert_eq!(sent(&server, "POST", COMMENTS), Vec::<Request>::new());

    reshaped(&server, |props| {
        props.remove("Shep");
    });
    server.clear_requests();
    notion.source.report(&item(), &queued()).unwrap();
    assert_eq!(
        sent(&server, "PATCH", PAGE),
        Vec::<Request>::new(),
        "creates nothing"
    );
    let comment = sent(&server, "POST", COMMENTS)[0].json();
    assert_eq!(
        comment["parent"]["page_id"],
        "3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0"
    );
    let text = plain(&comment["rich_text"]);
    assert!(text.starts_with(SHEP_MARK), "{text}");
    assert!(
        text.contains("Queued for tonight, 23:00 · acme/app"),
        "{text}"
    );
}

#[test]
fn a_select_shep_property_only_takes_options_the_person_made() {
    let server = served();
    let notion = connect(&server);
    reshaped(&server, |props| {
        props["Shep"] = if props["Shep"].get("name").is_some() {
            json!({ "id": "Xk%3Cd", "name": "Shep", "type": "select", "select": { "options": [
                { "id": "q1", "name": "Queued", "color": "purple", "description": null },
                { "id": "r1", "name": "Ready for review", "color": "green", "description": null }
            ] } })
        } else {
            json!({ "id": "Xk%3Cd", "type": "select", "select": null })
        };
    });
    notion.source.report(&item(), &queued()).unwrap();
    let patch = &sent(&server, "PATCH", PAGE)[0].json();
    assert_eq!(
        patch["properties"]["Shep"],
        json!({ "select": { "name": "Queued" } })
    );

    server.clear_requests();
    let asked = Update::Asked {
        question: "Which zone?".into(),
    };
    notion.source.report(&item(), &asked).unwrap();
    assert_eq!(
        sent(&server, "PATCH", PAGE),
        Vec::<Request>::new(),
        "no Asked option"
    );
    assert!(plain(&sent(&server, "POST", COMMENTS)[0].json()["rich_text"]).contains("Which zone?"));
}

#[test]
fn ready_fills_the_pr_property_and_appends_the_link_and_summary() {
    let server = served();
    let notion = connect(&server);
    let ready = Update::Ready {
        pr: pr(),
        summary: "CI green · +41 -12".into(),
        proof: Vec::new(),
    };
    notion.source.report(&item(), &ready).unwrap();
    let patch = &sent(&server, "PATCH", PAGE)[0].json();
    assert_eq!(patch["properties"]["PR"], json!({ "url": pr().url }));
    assert_eq!(
        plain(&patch["properties"]["Shep"]["rich_text"]),
        "ready for review"
    );
    let children = sent(&server, "PATCH", CHILDREN)[0].json();
    let first = &children["children"][0];
    assert_eq!(first["type"], "paragraph");
    let words = plain(&first["paragraph"]["rich_text"]);
    assert!(
        words.starts_with(SHEP_MARK) && words.contains("CI green · +41 -12"),
        "{words}"
    );
    assert!(children
        .to_string()
        .contains(r#""link":{"url":"https://github.com/acme/app/pull/101"}"#));
}

#[test]
fn answers_come_back_with_their_author_and_read_brings_the_page_text() {
    let server = served();
    let notion = connect(&server);
    let replies = notion.source.replies(&item(), SINCE).unwrap();
    assert_eq!(
        replies,
        [Reply::Said {
            at: UnixTime(1_794_643_800),
            author: "Dana Whitfield".into(),
            text: "Use the store's zone, like the invoices do".into(),
        }]
    );
    let listed = &sent(&server, "GET", COMMENTS)[0];
    assert!(
        listed
            .path
            .contains("block_id=3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0"),
        "{}",
        listed.path
    );

    let read = notion.source.read(&item()).unwrap().unwrap();
    assert!(read.body.contains("apply `save10`, click Pay."), "{read:?}");
    let gone = TaskSourceRef::Notion {
        url: "https://www.notion.so/Old-task-6e7f8091a2b34c45d6e7f8a9b0c1d2e3".into(),
    };
    assert_eq!(notion.source.read(&gone).unwrap(), None);
}

#[test]
fn the_form_asks_for_a_token_and_a_database() {
    let form = NotionFactory::default().form();
    let keys: Vec<(&str, bool)> = form
        .fields
        .iter()
        .map(|f| (f.key.as_str(), f.secret))
        .collect();
    assert_eq!(keys, [("token", true), ("database", false)]);
    assert!(
        form.fields[0].hint.contains("share the database"),
        "{}",
        form.fields[0].hint
    );
    assert!(form.hand_over.iter().any(|h| h.contains("Tonight")));
}
