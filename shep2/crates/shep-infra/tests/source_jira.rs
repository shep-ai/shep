//! Jira Cloud as a task source, against recorded REST v3 responses: the shared contract, then
//! the exact calls (JQL, Basic auth, ADF comments, transitions, the PR's remote link).

mod support;

use std::collections::BTreeMap;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use shep_app::ports::{Reply, SourceProviders, TaskSource, Update};
use shep_domain::{ClockTime, PullRequest, SourceKind, SourceSetting, TaskSourceRef, UnixTime};
use shep_infra::secrets::{FileSecrets, SecretStore};
use shep_infra::sources::jira::JiraFactory;
use shep_infra::sources::tracker::SHEP_MARK;
use shep_infra::sources::{SourceFactory, SourceRegistry};
use support::fixture_http::{fixture, FixtureServer, Request};
use support::source_contract::{self, Case};

const TOKEN: &str = "fake-jira-token-for-tests";
const EMAIL: &str = "mia@example.com";
const SITE: &str = "acme.atlassian.net";
const ISSUE: &str = "/rest/api/3/issue/STORE-218";
const SEARCH: &str = "/rest/api/3/search/jql";
/// 2026-11-14 08:00 UTC: between Dana's two comments.
const SINCE: UnixTime = UnixTime(1_794_643_200);

fn item() -> TaskSourceRef {
    TaskSourceRef::Jira {
        key: "STORE-218".into(),
    }
}

fn case() -> Case<'static> {
    Case {
        kind: SourceKind::Jira,
        item: item(),
        token: TOKEN,
        reply: "also trim spaces",
        shep_said: "Ready for review",
        since: SINCE,
    }
}

fn served() -> FixtureServer {
    let server = FixtureServer::start();
    server.on(
        "GET",
        "/rest/api/3/myself",
        200,
        &fixture("jira/myself.json"),
    );
    server.on(
        "GET",
        "/rest/api/3/status",
        200,
        &fixture("jira/statuses.json"),
    );
    server.on("POST", SEARCH, 200, &fixture("jira/search.json"));
    server.on("GET", ISSUE, 200, &fixture("jira/issue.json"));
    let missing = fixture("jira/issue_missing.json");
    server.on("GET", "/rest/api/3/issue/STORE-999", 404, &missing);
    let transitions = format!("{ISSUE}/transitions");
    server.on("GET", &transitions, 200, &fixture("jira/transitions.json"));
    server.on("POST", &transitions, 204, "");
    let comments = format!("{ISSUE}/comment");
    server.on("GET", &comments, 200, &fixture("jira/comments.json"));
    server.on(
        "POST",
        &comments,
        201,
        &fixture("jira/comment_created.json"),
    );
    let link = fixture("jira/remotelink_created.json");
    server.on("POST", &format!("{ISSUE}/remotelink"), 201, &link);
    server
}

struct Connected {
    _dir: tempfile::TempDir,
    store: Arc<FileSecrets>,
    setting: SourceSetting,
    source: Arc<dyn TaskSource>,
}

fn connect(server: &FixtureServer, project: Option<&str>) -> Connected {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let factory = JiraFactory::at(server.url());
    let registry = SourceRegistry::new(store.clone(), vec![Box::new(factory)]);
    let mut values = BTreeMap::from([
        ("site".to_owned(), format!("https://{SITE}/")),
        ("email".to_owned(), EMAIL.to_owned()),
        ("token".to_owned(), TOKEN.to_owned()),
    ]);
    if let Some(project) = project {
        values.insert("project".into(), project.into());
    }
    let setting = registry.connect(SourceKind::Jira, &values).unwrap();
    let source = registry.source(&setting).unwrap();
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

fn posted(server: &FixtureServer, path: &str) -> Vec<Request> {
    server
        .writes()
        .into_iter()
        .filter(|r| r.path.starts_with(path))
        .collect()
}

/// Every text node of an ADF document, in order.
fn adf_texts(doc: &serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(text) = doc["text"].as_str() {
        out.push(text.to_owned());
    }
    for child in doc["content"].as_array().into_iter().flatten() {
        out.extend(adf_texts(child));
    }
    out
}

#[test]
fn jira_holds_the_source_contract() {
    let server = served();
    let jira = connect(&server, Some("STORE"));
    source_contract::holds(&case(), &server, jira.source.as_ref());
}

#[test]
fn jira_fails_politely_without_showing_the_token() {
    let server = served();
    let jira = connect(&server, None);
    source_contract::fails_politely(&case(), &server, jira.source.as_ref());
}

#[test]
fn connecting_keeps_the_token_in_the_keychain_and_the_site_in_settings() {
    let server = served();
    let jira = connect(&server, Some("store"));
    assert_eq!(jira.setting.option("site"), Some(SITE));
    assert_eq!(jira.setting.option("email"), Some(EMAIL));
    assert_eq!(jira.setting.option("project"), Some("STORE"));
    assert!(
        jira.setting.account.contains("Mia Krystof"),
        "{:?}",
        jira.setting
    );
    assert!(jira.setting.options.values().all(|v| !v.contains(TOKEN)));
    assert!(!jira.setting.account.contains(TOKEN));
    assert_eq!(
        jira.store.get("jira/token").unwrap().as_deref(),
        Some(TOKEN)
    );

    let basic = format!("Basic {}", STANDARD.encode(format!("{EMAIL}:{TOKEN}")));
    let me = &server.requests()[0];
    assert_eq!(me.path, "/rest/api/3/myself");
    assert_eq!(me.header("authorization"), Some(basic.as_str()));
}

#[test]
fn hand_over_is_the_tonight_status_or_the_shep_label_by_jql() {
    let server = served();
    let jira = connect(&server, Some("STORE"));
    server.clear_requests();
    let polled = jira.source.poll().unwrap();
    let keys: Vec<String> = polled.iter().map(|h| h.source.to_string()).collect();
    assert_eq!(keys, ["STORE-218", "STORE-219"]);
    assert_eq!(polled[0].url, format!("https://{SITE}/browse/STORE-218"));
    assert!(
        polled[0].body.contains("apply save10, click Pay."),
        "{polled:?}"
    );

    let search = &posted(&server, SEARCH)[0];
    let jql = search.json()["jql"].as_str().unwrap().to_owned();
    assert!(jql.contains(r#"project = "STORE""#), "{jql}");
    assert!(jql.contains(r#"status = "Tonight""#), "{jql}");
    assert!(jql.contains(r#"labels = "shep""#), "{jql}");

    // A site without a Tonight status: the label alone, so the JQL stays valid.
    let statuses = r#"[{"id":"1","name":"To Do","statusCategory":{"key":"new"}}]"#;
    server.on("GET", "/rest/api/3/status", 200, statuses);
    server.clear_requests();
    jira.source.poll().unwrap();
    let jql = posted(&server, SEARCH)[0].json()["jql"].to_string();
    assert!(!jql.contains("Tonight"), "{jql}");
    assert!(jql.contains("labels"), "{jql}");
}

#[test]
fn queued_moves_the_issue_to_tonight_and_says_so_in_a_comment() {
    let server = served();
    let jira = connect(&server, None);
    server.clear_requests();
    let queued = Update::Queued {
        starts: Some(ClockTime::parse("23:00").unwrap()),
        repo: Some("acme/app".into()),
    };
    jira.source.report(&item(), &queued).unwrap();

    let moved = posted(&server, &format!("{ISSUE}/transitions"));
    assert_eq!(moved.len(), 1);
    assert_eq!(moved[0].json()["transition"]["id"], "21");
    let comments = posted(&server, &format!("{ISSUE}/comment"));
    assert_eq!(comments.len(), 1);
    let body = &comments[0].json()["body"];
    assert_eq!(body["type"], "doc");
    assert_eq!(body["version"], 1);
    let text = adf_texts(body).concat();
    assert!(text.starts_with(SHEP_MARK), "{text}");
    assert!(text.contains("Queued for tonight, 23:00"), "{text}");
    assert!(text.contains("acme/app"), "{text}");
    let order: Vec<String> = server.writes().iter().map(|r| r.path.clone()).collect();
    assert!(
        order.last().unwrap().ends_with("/comment"),
        "say it last: {order:?}"
    );
}

#[test]
fn ready_links_the_pr_moves_to_review_and_comments_with_the_summary() {
    let server = served();
    let jira = connect(&server, None);
    server.clear_requests();
    let ready = Update::Ready {
        pr: pr(),
        summary: "CI green · +41 -12".into(),
        proof: Vec::new(),
    };
    jira.source.report(&item(), &ready).unwrap();

    let link = &posted(&server, &format!("{ISSUE}/remotelink"))[0].json();
    assert_eq!(link["globalId"], pr().url);
    assert_eq!(link["object"]["url"], pr().url);
    assert!(link["object"]["title"].as_str().unwrap().contains("101"));
    let moved = posted(&server, &format!("{ISSUE}/transitions"));
    assert_eq!(moved[0].json()["transition"]["id"], "31", "In Review");
    let body = posted(&server, &format!("{ISSUE}/comment"))[0].json()["body"].clone();
    let text = adf_texts(&body).concat();
    assert!(text.starts_with(SHEP_MARK), "{text}");
    assert!(text.contains("CI green · +41 -12"), "{text}");
    assert!(body
        .to_string()
        .contains(r#""href":"https://github.com/acme/app/pull/101""#));
}

#[test]
fn a_status_change_that_needs_a_form_or_is_missing_is_not_attempted() {
    let server = served();
    let jira = connect(&server, None);
    // No review status in this workflow, and the move to Tonight asks for a field.
    let mut offered: serde_json::Value =
        serde_json::from_str(&fixture("jira/transitions.json")).unwrap();
    let transitions = offered["transitions"].as_array_mut().unwrap();
    transitions.retain(|t| t["to"]["name"] != "In Review");
    transitions[1]["fields"] = serde_json::json!({
        "customfield_10020": { "required": true, "hasDefaultValue": false, "name": "Sprint",
                               "key": "customfield_10020", "operations": ["set"] }
    });
    let offered = offered.to_string();
    server.on("GET", &format!("{ISSUE}/transitions"), 200, &offered);
    server.clear_requests();
    let ready = Update::Ready {
        pr: pr(),
        summary: "CI green".into(),
        proof: Vec::new(),
    };
    jira.source.report(&item(), &ready).unwrap();
    let queued = Update::Queued {
        starts: None,
        repo: None,
    };
    jira.source.report(&item(), &queued).unwrap();
    assert_eq!(
        posted(&server, &format!("{ISSUE}/transitions")),
        Vec::<Request>::new()
    );
    assert_eq!(posted(&server, &format!("{ISSUE}/comment")).len(), 2);
}

#[test]
fn questions_are_comments_and_answers_come_back_with_their_author() {
    let server = served();
    let jira = connect(&server, None);
    server.clear_requests();
    let asked = Update::Asked {
        question: "Which zone when the customer has none?".into(),
    };
    jira.source.report(&item(), &asked).unwrap();
    let body = posted(&server, &format!("{ISSUE}/comment"))[0].json()["body"].clone();
    assert!(adf_texts(&body).concat().contains("Which zone"));
    assert_eq!(
        posted(&server, &format!("{ISSUE}/transitions")),
        Vec::<Request>::new()
    );

    let replies = jira.source.replies(&item(), SINCE).unwrap();
    assert_eq!(
        replies,
        [Reply::Said {
            at: UnixTime(1_794_643_800),
            author: "Dana Whitfield".into(),
            text: "shep: also trim spaces around the code".into(),
        }]
    );
    let get = server
        .requests()
        .into_iter()
        .find(|r| r.method == "GET" && r.path.contains("/comment"))
        .unwrap();
    assert!(get.path.contains("orderBy=-created"), "{}", get.path);
}

#[test]
fn a_deleted_issue_reads_as_gone() {
    let server = served();
    let jira = connect(&server, None);
    let gone = TaskSourceRef::Jira {
        key: "STORE-999".into(),
    };
    assert_eq!(jira.source.read(&gone).unwrap(), None);
}

#[test]
fn the_form_asks_for_site_email_token_and_an_optional_project() {
    let form = JiraFactory::default().form();
    let keys: Vec<(&str, bool, bool)> = form
        .fields
        .iter()
        .map(|f| (f.key.as_str(), f.secret, f.optional))
        .collect();
    assert_eq!(
        keys,
        [
            ("site", false, false),
            ("email", false, false),
            ("token", true, false),
            ("project", false, true)
        ]
    );
    let token = &form.fields[2];
    assert!(token.hint.contains("id.atlassian.com"), "{}", token.hint);
    assert!(form.hand_over.iter().any(|h| h.contains("Tonight")));
}
