//! What surfaces ask about sources: which are connected, connecting one, and good first tasks.

mod support;

use std::collections::BTreeMap;

use shep_app::ports::HandOver;
use shep_app::testing::{FAKE_ACCOUNT, FAKE_TOKEN_KEY};
use shep_domain::{SourceKind, TaskSourceRef};
use support::*;

fn values(token: &str) -> BTreeMap<String, String> {
    BTreeMap::from([
        (FAKE_TOKEN_KEY.to_owned(), token.to_owned()),
        ("team".to_owned(), "ENG".to_owned()),
    ])
}

fn ticket(key: &str, title: &str, body: &str) -> HandOver {
    HandOver {
        source: TaskSourceRef::Linear { key: key.into() },
        title: title.into(),
        body: body.into(),
        url: format!("https://linear.app/acme/issue/{key}"),
    }
}

#[test]
fn every_source_is_listed_with_its_form_and_none_is_connected_at_first() {
    let w = world();
    let sources = w.shep.sources().unwrap();
    let kinds: Vec<SourceKind> = sources.iter().map(|s| s.kind).collect();
    assert_eq!(kinds, SourceKind::CONNECTABLE);
    assert!(sources.iter().all(|s| !s.connected && s.problem.is_none()));
    assert!(sources.iter().all(|s| !s.form.hand_over.is_empty()));
}

#[test]
fn connecting_keeps_the_token_out_of_settings() {
    let w = world();
    let status = w
        .shep
        .connect_source(SourceKind::Linear, &values("lin_api_123"))
        .unwrap();
    assert!(status.connected);
    assert_eq!(status.account, FAKE_ACCOUNT);
    assert_eq!(
        w.f.sources.token(SourceKind::Linear).as_deref(),
        Some("lin_api_123")
    );
    let settings = w.shep.settings().unwrap();
    let linear = settings.source(SourceKind::Linear).unwrap();
    assert_eq!(linear.option("team"), Some("ENG"));
    assert_eq!(linear.option(FAKE_TOKEN_KEY), None, "never in settings");
    assert!(!serde_json::to_string(&settings)
        .unwrap()
        .contains("lin_api_123"));

    w.shep.disconnect_source(SourceKind::Linear).unwrap();
    assert_eq!(w.shep.settings().unwrap().sources.len(), 0);
    assert_eq!(w.f.sources.token(SourceKind::Linear), None);
}

#[test]
fn a_failed_connection_saves_nothing_and_a_broken_one_says_why() {
    let w = world();
    assert!(w
        .shep
        .connect_source(SourceKind::Linear, &values(" "))
        .is_err());
    assert_eq!(w.shep.settings().unwrap().sources.len(), 0);

    w.shep
        .connect_source(SourceKind::Linear, &values("lin_api_123"))
        .unwrap();
    w.f.sources
        .get(SourceKind::Linear)
        .fail(Some("401: the API key was revoked"));
    let linear = w
        .shep
        .sources()
        .unwrap()
        .into_iter()
        .find(|s| s.kind == SourceKind::Linear)
        .unwrap();
    assert!(linear.connected);
    assert_eq!(
        linear.problem.as_deref(),
        Some("401: the API key was revoked")
    );
}

#[test]
fn candidates_come_from_connected_sources_and_vague_ones_are_marked() {
    let w = world();
    let linear = w.f.sources.get(SourceKind::Linear);
    linear.offer(ticket(
        "ENG-342",
        "Invoice dates use the wrong timezone",
        "Dates on invoices show UTC; they should use the customer's zone from their account.",
    ));
    linear.offer(ticket("ENG-360", "Rethink onboarding", ""));
    assert!(
        w.shep.candidates(5).unwrap().is_empty(),
        "not connected yet"
    );

    w.shep
        .connect_source(SourceKind::Linear, &values("lin_api_123"))
        .unwrap();
    let found = w.shep.candidates(5).unwrap();
    let marks: Vec<(&str, bool)> = found
        .iter()
        .map(|c| (c.item.title.as_str(), c.vague))
        .collect();
    assert_eq!(
        marks,
        [
            ("Invoice dates use the wrong timezone", false),
            ("Rethink onboarding", true)
        ]
    );
}

#[test]
fn setup_carries_the_sources_and_what_they_offer() {
    let w = world();
    let s = w.shep.setup(None).unwrap();
    assert_eq!(s.sources.len(), SourceKind::CONNECTABLE.len());
    assert_eq!(s.candidates.len(), 0);

    w.f.sources.get(SourceKind::Linear).offer(ticket(
        "ENG-351",
        "Export reports to CSV",
        "Finance needs the monthly report as CSV with the same columns as the table on screen.",
    ));
    w.shep
        .connect_source(SourceKind::Linear, &values("lin_api_123"))
        .unwrap();
    let s = w.shep.setup(None).unwrap();
    assert!(s
        .sources
        .iter()
        .any(|x| x.kind == SourceKind::Linear && x.connected));
    assert_eq!(s.candidates[0].item.title, "Export reports to CSV");
}
