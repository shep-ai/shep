//! GitHub issues as a task source, against recorded REST API responses: the shared contract,
//! the requests it sends, and the token that stays with `gh`.

#[path = "../support/mod.rs"]
mod support;
mod world;

use shep_app::ports::{Reply, SourceProviders, Update};
use shep_domain::{ClockTime, SourceKind, TaskSourceRef, UnixTime};
use shep_infra::secrets::SecretStore;
use support::fixture_http::fixture;
use support::source_contract;
use world::{case, item, values, world, COMMENTS, MARKER, SINCE, TOKEN};

#[test]
fn the_contract_holds() {
    let world = world();
    source_contract::holds(&case(), &world.server, world.source().as_ref());
}

#[test]
fn a_revoked_token_fails_politely() {
    let world = world();
    let source = world.source();
    source_contract::fails_politely(&case(), &world.server, source.as_ref());
}

#[test]
fn connecting_proves_the_gh_token_and_keeps_no_secret() {
    let world = world();
    let form = world.registry.form(SourceKind::GitHub);
    assert!(form.fields.iter().all(|f| !f.secret), "{form:?}");
    assert!(form.fields.iter().any(|f| f.key == "repo"), "{form:?}");
    assert!(
        form.hand_over.iter().any(|h| h.contains("shep")),
        "{form:?}"
    );

    let (setting, _) = world.connect(&[("repo", "acme/app")]);
    assert_eq!(setting.kind, SourceKind::GitHub);
    assert_eq!(setting.account, "@octocat · acme/app");
    assert_eq!(setting.option("repo"), Some("acme/app"));
    assert_eq!(setting.option("label"), Some("shep"));
    assert!(setting.options.values().all(|v| !v.contains(TOKEN)));
    assert_eq!(world.store.get("github/token").unwrap(), None);
    assert!(
        world.gh.calls().iter().any(|c| c == "auth token"),
        "{:?}",
        world.gh.calls()
    );

    let requests = world.server.requests();
    let user = requests.iter().find(|r| r.path == "/user").unwrap();
    assert_eq!(
        user.header("authorization"),
        Some(format!("Bearer {TOKEN}").as_str())
    );
    assert_eq!(user.header("accept"), Some("application/vnd.github+json"));
    assert_eq!(user.header("x-github-api-version"), Some("2022-11-28"));
    assert!(requests.iter().any(|r| r.path == "/repos/acme/app"));
}

#[test]
fn connecting_needs_a_repository_and_a_signed_in_gh() {
    let world = world();
    for bad in [vec![], vec![("repo", "acme")], vec![("repo", "acme/app/x")]] {
        let err = world
            .registry
            .connect(SourceKind::GitHub, &values(&bad))
            .unwrap_err();
        assert!(err.0.contains("owner/name"), "{bad:?}: {err}");
    }

    world
        .gh
        .complain("auth_token", "no oauth token found for github.com", 1);
    let err = world
        .registry
        .connect(SourceKind::GitHub, &values(&[("repo", "acme/app")]))
        .unwrap_err();
    assert!(err.0.contains("gh auth login"), "{err}");
    assert!(!err.0.contains(TOKEN), "{err}");
}

#[test]
fn a_token_gh_prints_while_failing_never_reaches_the_error() {
    let world = world();
    world.gh.answer("auth_token", TOKEN, 1);
    let err = world
        .registry
        .connect(SourceKind::GitHub, &values(&[("repo", "acme/app")]))
        .unwrap_err();
    assert!(!err.0.contains(TOKEN), "{err}");
}

#[test]
fn poll_asks_for_open_labelled_issues_and_skips_pull_requests() {
    let world = world();
    let source = world.source();
    world.server.clear_requests();
    let polled = source.poll().unwrap();
    let refs: Vec<_> = polled.iter().map(|h| h.source.clone()).collect();
    assert_eq!(refs, vec![item()], "PR #413 and unlabelled #411 stay out");
    assert_eq!(polled[0].title, "Fix login redirect loop");
    assert_eq!(polled[0].url, "https://github.com/acme/app/issues/412");
    let request = &world.server.requests()[0];
    assert!(
        request.path.starts_with("/repos/acme/app/issues?"),
        "{request:?}"
    );
    assert!(request.path.contains("state=open"), "{request:?}");
    assert!(request.path.contains("labels=shep"), "{request:?}");

    let (setting, source) = world.connect(&[("repo", "acme/app"), ("label", "good first")]);
    assert_eq!(setting.option("label"), Some("good first"));
    world.server.clear_requests();
    assert_eq!(source.poll().unwrap(), Vec::new());
    let request = &world.server.requests()[0];
    assert!(request.path.contains("labels=good%20first"), "{request:?}");
}

#[test]
fn candidates_are_the_newest_open_issues() {
    let world = world();
    let source = world.source();
    world.server.clear_requests();
    let offered = source.candidates(5).unwrap();
    let numbers: Vec<_> = offered
        .iter()
        .map(|h| match &h.source {
            TaskSourceRef::GitHubIssue { number, .. } => *number,
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(numbers, vec![412, 411]);
    assert_eq!(offered[1].body, "", "a null body reads as empty");
    let request = &world.server.requests()[0];
    assert!(request.path.contains("sort=created"), "{request:?}");
    assert!(request.path.contains("direction=desc"), "{request:?}");
    assert_eq!(source.candidates(1).unwrap().len(), 1);
}

#[test]
fn every_update_is_one_marked_comment_on_the_issue() {
    let world = world();
    let source = world.source();
    for update in source_contract::updates() {
        world.server.clear_requests();
        source.report(&item(), &update).unwrap();
        let posted = world.comments_posted();
        assert_eq!(posted.len(), 1, "{update:?}");
        assert_eq!(world.server.writes().len(), 1, "{update:?}");
        let body = posted[0].json()["body"].as_str().unwrap().to_owned();
        assert!(body.trim_end().ends_with(MARKER), "{body}");
        let expected = match &update {
            Update::Queued { .. } => "Queued for tonight, 23:00 in acme/app",
            Update::Asked { .. } => "> Which zone when the customer has none?",
            Update::Ready { .. } => "CI green · +41 -12 · screenshot",
            Update::Merged { .. } => "Merged: https://github.com/acme/app/pull/101",
            Update::Stopped { .. } => "issue closed",
        };
        assert!(body.contains(expected), "{update:?}: {body}");
        assert_eq!(
            posted[0].header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
    }

    world.server.clear_requests();
    let manual = Update::Queued {
        starts: None,
        repo: None,
    };
    source.report(&item(), &manual).unwrap();
    let body = world.comments_posted()[0].json()["body"].to_string();
    assert!(body.contains("shep go"), "{body}");
    let tonight = Update::Queued {
        starts: Some(ClockTime::parse("01:30").unwrap()),
        repo: None,
    };
    world.server.clear_requests();
    source.report(&item(), &tonight).unwrap();
    let body = world.comments_posted()[0].json()["body"].to_string();
    assert!(body.contains("Queued for tonight, 01:30"), "{body}");
}

#[test]
fn replies_are_what_people_wrote_since_without_shep() {
    let world = world();
    let source = world.source();
    world.server.clear_requests();
    let replies = source.replies(&item(), SINCE).unwrap();
    assert_eq!(
        replies,
        vec![Reply::Said {
            at: UnixTime(1_794_639_780),
            author: "octocat".into(),
            text: "UTC. The zone is UTC when the customer has none.".into(),
        }]
    );
    let request = &world.server.requests()[0];
    assert!(request.path.starts_with(COMMENTS), "{request:?}");
    assert!(
        request.path.contains("since=2026-11-13T18%3A10%3A00Z"),
        "{request:?}"
    );
    assert!(request.path.contains("per_page=100"), "{request:?}");
}

#[test]
fn an_issue_elsewhere_is_read_there_and_a_missing_one_is_none() {
    let world = world();
    let source = world.source();
    world.server.on(
        "GET",
        "/repos/acme/web/issues/7",
        404,
        &fixture("github/not_found.json"),
    );
    let elsewhere = TaskSourceRef::GitHubIssue {
        repo: Some("acme/web".into()),
        number: 7,
    };
    assert_eq!(source.read(&elsewhere).unwrap(), None);
    assert!(world
        .server
        .requests()
        .iter()
        .any(|r| r.path == "/repos/acme/web/issues/7"));

    let linear = TaskSourceRef::Linear {
        key: "ENG-1".into(),
    };
    assert!(source
        .report(&linear, &source_contract::updates()[0])
        .is_err());
}

/// The marker is what tells Shep's comments apart (they are written as the person `gh` is
/// signed in as). Without it, the contract catches Shep's own words coming back.
#[test]
fn an_adapter_that_lost_its_marker_fails_the_contract() {
    let world = world();
    let unmarked = fixture("github/comments.json").replace(MARKER, "");
    world.server.on("GET", COMMENTS, 200, &unmarked);
    let source = world.source();
    let broken = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        source_contract::holds(&case(), &world.server, source.as_ref());
    }));
    assert!(
        broken.is_err(),
        "the contract should catch Shep's own words"
    );
}
