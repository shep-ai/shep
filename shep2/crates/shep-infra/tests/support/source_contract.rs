//! The contract every source adapter meets, checked against its recorded fixtures: the same
//! checks for GitHub, Linear, Jira, Notion, Monday and Slack.

use shep_app::ports::{Reply, TaskSource, Update};
use shep_domain::{ClockTime, PullRequest, SourceKind, TaskSourceRef, UnixTime};

use super::fixture_http::FixtureServer;

pub struct Case<'a> {
    pub kind: SourceKind,
    /// The item the fixtures hand over to Shep.
    pub item: TaskSourceRef,
    /// The token the adapter was built with; no error may ever show it.
    pub token: &'a str,
    /// In the fixtures' replies on the item: words a person wrote at or after `since`...
    pub reply: &'a str,
    /// ...and words Shep itself posted, which must not come back as a reply.
    pub shep_said: &'a str,
    pub since: UnixTime,
}

fn pr() -> PullRequest {
    PullRequest {
        number: 101,
        url: "https://github.com/acme/app/pull/101".into(),
    }
}

/// One of each thing Shep says in a source.
pub fn updates() -> Vec<Update> {
    vec![
        Update::Queued {
            starts: Some(ClockTime::parse("23:00").unwrap()),
            repo: Some("acme/app".into()),
        },
        Update::Asked {
            question: "Which zone when the customer has none?".into(),
        },
        Update::Ready {
            pr: pr(),
            summary: "CI green · +41 -12 · screenshot".into(),
            proof: Vec::new(),
        },
        Update::Merged { pr: pr() },
        Update::Stopped {
            reason: "issue closed".into(),
        },
    ]
}

/// Everything a working adapter does, against fixtures that answer every call.
pub fn holds(case: &Case<'_>, server: &FixtureServer, source: &dyn TaskSource) {
    assert_eq!(source.kind(), case.kind);
    let account = source.connection().unwrap();
    assert!(!account.trim().is_empty(), "connected as someone");

    let polled = source.poll().unwrap();
    let item = polled
        .iter()
        .find(|h| h.source == case.item)
        .unwrap_or_else(|| panic!("{:?} not handed over in {polled:?}", case.item));
    assert_eq!(item.source.kind(), case.kind);
    assert!(!item.title.trim().is_empty(), "{item:?}");
    assert!(item.url.starts_with("http"), "{item:?}");

    let read = source.read(&case.item).unwrap().expect("the item reads");
    assert_eq!(read.source, case.item);
    assert_eq!(read.title, item.title);

    for update in updates() {
        server.clear_requests();
        source
            .report(&case.item, &update)
            .unwrap_or_else(|e| panic!("{update:?}: {e}"));
        assert!(!server.writes().is_empty(), "{update:?} said nothing");
    }

    let replies = source.replies(&case.item, case.since).unwrap();
    let said = |words: &str| {
        replies
            .iter()
            .any(|r| matches!(r, Reply::Said { text, .. } if text.contains(words)))
    };
    assert!(said(case.reply), "{replies:?}");
    assert!(
        !said(case.shep_said),
        "Shep's own words came back: {replies:?}"
    );
    assert!(replies.iter().all(|r| r.at() >= case.since), "{replies:?}");
    let later = source
        .replies(&case.item, UnixTime(case.since.0 + 100 * 365 * 86_400))
        .unwrap();
    assert!(later.is_empty(), "nothing is that new: {later:?}");

    let offered = source.candidates(2).unwrap();
    assert!(offered.len() <= 2, "{offered:?}");
    assert!(offered.iter().all(|h| h.source.kind() == case.kind));
}

/// The source refusing everything (a revoked token): every call fails, and says why without
/// showing the token.
pub fn fails_politely(case: &Case<'_>, server: &FixtureServer, source: &dyn TaskSource) {
    server.fail_all(401, r#"{"message":"Bad credentials"}"#);
    let errors = [
        source.connection().err(),
        source.poll().err(),
        source.read(&case.item).err(),
        source.report(&case.item, &updates()[0]).err(),
        source.replies(&case.item, case.since).err(),
        source.candidates(2).err(),
    ];
    for (i, error) in errors.iter().enumerate() {
        let error = error
            .as_ref()
            .unwrap_or_else(|| panic!("call {i} should fail"));
        assert!(
            !error.0.contains(case.token),
            "call {i} showed the token: {error}"
        );
        assert_ne!(error.0.trim(), "", "call {i} said nothing");
    }
}
