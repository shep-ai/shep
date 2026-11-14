//! Linear as a task source, against recorded GraphQL responses: the shared contract, the
//! queries and mutations it sends, and the API key that stays in the keychain.

#[path = "../support/mod.rs"]
mod support;
mod world;

use shep_app::ports::{Reply, SourceProviders, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};
use shep_infra::secrets::SecretStore;
use support::fixture_http::fixture;
use support::source_contract;
use world::{
    answer, case, item, values, world, GRAPHQL, IN_REVIEW_ID, ISSUE_ID, SIGNATURE, SINCE, TOKEN,
    TONIGHT_ID,
};

#[test]
fn the_contract_holds() {
    let world = world();
    source_contract::holds(&case(), &world.server, world.source().as_ref());
}

#[test]
fn a_revoked_key_fails_politely() {
    let world = world();
    let source = world.source();
    source_contract::fails_politely(&case(), &world.server, source.as_ref());
}

#[test]
fn graphql_errors_in_a_200_answer_fail_too() {
    let world = world();
    let source = world.source();
    world.server.on(
        "POST",
        GRAPHQL,
        200,
        &fixture("linear/unauthenticated.json"),
    );
    let err = source.poll().unwrap_err();
    assert!(err.0.contains("Authentication required"), "{err}");
    assert!(!err.0.contains(TOKEN), "{err}");
}

#[test]
fn connecting_keeps_the_key_secret_and_names_the_workspace_and_team() {
    let world = world();
    let form = world.registry.form(SourceKind::Linear);
    let token = form.fields.iter().find(|f| f.key == "token").unwrap();
    assert!(token.secret && !token.optional, "{form:?}");
    assert!(token.hint.contains("API"), "{form:?}");
    let team = form.fields.iter().find(|f| f.key == "team").unwrap();
    assert!(!team.secret && team.optional, "{form:?}");

    let (setting, _) = world.connect(&[("token", TOKEN), ("team", "eng")]);
    assert_eq!(setting.kind, SourceKind::Linear);
    assert_eq!(setting.account, "Acme · team ENG");
    assert_eq!(setting.option("team"), Some("ENG"));
    assert!(setting.options.values().all(|v| !v.contains(TOKEN)));
    assert_eq!(
        world.store.get("linear/token").unwrap().as_deref(),
        Some(TOKEN)
    );

    let viewer = &world.sent("query ShepViewer")[0];
    assert_eq!(
        viewer.header("authorization"),
        Some(TOKEN),
        "no Bearer prefix"
    );
    assert_eq!(viewer.header("content-type"), Some("application/json"));
    assert_eq!(world.variables("query ShepTeam")[0]["key"], "ENG");

    world.server.clear_requests();
    let (plain, _) = world.connect(&[("token", TOKEN)]);
    assert_eq!(plain.account, "Acme");
    assert_eq!(plain.option("team"), None);
    assert_eq!(world.sent("query ShepTeam").len(), 0);
}

#[test]
fn connecting_refuses_a_missing_key_or_an_unknown_team() {
    let world = world();
    let err = world
        .registry
        .connect(SourceKind::Linear, &values(&[("team", "ENG")]))
        .unwrap_err();
    assert!(err.0.contains("API key"), "{err}");

    answer(&world.server, "query ShepTeam", "linear/teams_none.json");
    let err = world
        .registry
        .connect(
            SourceKind::Linear,
            &values(&[("token", TOKEN), ("team", "OPS")]),
        )
        .unwrap_err();
    assert!(err.0.contains("OPS"), "{err}");
    assert_eq!(
        world.store.get("linear/token").unwrap(),
        None,
        "nothing kept"
    );
}

#[test]
fn poll_asks_for_the_label_or_the_tonight_state_in_the_team() {
    let world = world();
    let source = world.source();
    let polled = source.poll().unwrap();
    let keys: Vec<String> = polled.iter().map(|h| h.source.to_string()).collect();
    assert_eq!(keys, vec!["ENG-342", "ENG-345"], "ENG-351 is neither");
    assert_eq!(
        polled[0].url,
        "https://linear.app/acme/issue/ENG-342/invoice-dates-use-the-wrong-timezone"
    );
    assert!(polled[0].body.contains("Tokyo"));

    let filter = &world.variables("query ShepWaiting")[0]["filter"];
    assert_eq!(filter["or"][0]["labels"]["name"]["eqIgnoreCase"], "shep");
    assert_eq!(filter["or"][1]["state"]["name"]["eqIgnoreCase"], "Tonight");
    assert_eq!(filter["team"]["key"]["eq"], "ENG");
    let closed = filter["state"]["type"]["nin"].to_string();
    assert!(
        closed.contains("completed") && closed.contains("canceled"),
        "{filter}"
    );
}

#[test]
fn candidates_are_the_newest_open_issues() {
    let world = world();
    let source = world.source();
    let offered = source.candidates(2).unwrap();
    let keys: Vec<String> = offered.iter().map(|h| h.source.to_string()).collect();
    assert_eq!(keys, vec!["ENG-351", "ENG-345"]);
    assert_eq!(offered[0].body, "", "a null description reads as empty");
    let variables = &world.variables("query ShepOffer")[0];
    let open = variables["filter"]["state"]["type"]["in"].to_string();
    assert!(
        open.contains("unstarted") && open.contains("backlog"),
        "{variables}"
    );
    assert_eq!(variables["filter"]["team"]["key"]["eq"], "ENG");
}

#[test]
fn queued_comments_and_moves_the_issue_to_tonight() {
    let world = world();
    let source = world.source();
    world.server.clear_requests();
    source
        .report(&item(), &source_contract::updates()[0])
        .unwrap();
    assert_eq!(world.variables("query ShepPlace")[0]["id"], "ENG-342");
    let comment = &world.variables("mutation ShepComment")[0]["input"];
    assert_eq!(comment["issueId"], ISSUE_ID);
    let body = comment["body"].as_str().unwrap();
    assert!(
        body.starts_with("Queued for tonight, 23:00 in acme/app"),
        "{body}"
    );
    assert!(body.trim_end().ends_with(SIGNATURE), "{body}");
    let moved = &world.variables("mutation ShepMove")[0];
    assert_eq!(moved["id"], ISSUE_ID);
    assert_eq!(moved["input"]["stateId"], TONIGHT_ID);

    answer(
        &world.server,
        "query ShepPlace",
        "linear/place_plain_team.json",
    );
    world.server.clear_requests();
    source
        .report(&item(), &source_contract::updates()[0])
        .unwrap();
    assert_eq!(world.sent("mutation ShepComment").len(), 1);
    assert_eq!(world.sent("mutation ShepMove").len(), 0, "no Tonight state");
}

#[test]
fn ready_links_the_pr_comments_the_summary_and_moves_to_in_review() {
    let world = world();
    let source = world.source();
    world.server.clear_requests();
    source
        .report(&item(), &source_contract::updates()[2])
        .unwrap();
    let attached = &world.variables("mutation ShepAttach")[0]["input"];
    assert_eq!(attached["issueId"], ISSUE_ID);
    assert_eq!(attached["url"], "https://github.com/acme/app/pull/101");
    assert_eq!(attached["title"], "Pull request #101");
    assert_eq!(attached["subtitle"], "CI green · +41 -12 · screenshot");
    let body = world.variables("mutation ShepComment")[0]["input"]["body"].to_string();
    assert!(body.contains("CI green · +41 -12 · screenshot"), "{body}");
    assert!(
        body.contains("https://github.com/acme/app/pull/101"),
        "{body}"
    );
    assert_eq!(
        world.variables("mutation ShepMove")[0]["input"]["stateId"],
        IN_REVIEW_ID
    );
}

#[test]
fn questions_merges_and_stops_are_comments_only() {
    let world = world();
    let source = world.source();
    for update in &source_contract::updates()[1..] {
        if matches!(update, Update::Ready { .. }) {
            continue;
        }
        world.server.clear_requests();
        source.report(&item(), update).unwrap();
        let comments = world.variables("mutation ShepComment");
        assert_eq!(comments.len(), 1, "{update:?}");
        let body = comments[0]["input"]["body"].as_str().unwrap();
        assert!(body.trim_end().ends_with(SIGNATURE), "{update:?}: {body}");
        assert_eq!(world.sent("mutation ShepMove").len(), 0, "{update:?}");
        assert_eq!(world.sent("mutation ShepAttach").len(), 0, "{update:?}");
    }
}

#[test]
fn replies_are_what_people_wrote_since_oldest_first_without_shep() {
    let world = world();
    let source = world.source();
    let replies = source.replies(&item(), UnixTime(SINCE.0 - 120)).unwrap();
    assert_eq!(
        replies,
        vec![
            Reply::Said {
                at: UnixTime(SINCE.0 - 60),
                author: "Fox Mulder".into(),
                text: "Probably the date formatter; it started after the i18n change.".into(),
            },
            Reply::Said {
                at: UnixTime(1_794_639_780),
                author: "Dana Scully".into(),
                text: "UTC. The zone is UTC when the customer has none.".into(),
            },
        ]
    );
    let variables = &world.variables("query ShepReplies")[0];
    assert_eq!(variables["id"], "ENG-342");
    assert_eq!(
        variables["filter"]["createdAt"]["gte"],
        "2026-11-13T18:08:00Z"
    );
}

#[test]
fn a_missing_issue_reads_as_none_whichever_way_linear_says_it() {
    let world = world();
    let source = world.source();
    let gone = TaskSourceRef::Linear {
        key: "ENG-999".into(),
    };
    for status in [200, 400] {
        world.server.on_body(
            "POST",
            GRAPHQL,
            "query ShepRead",
            status,
            &fixture("linear/not_found.json"),
        );
        assert_eq!(source.read(&gone).unwrap(), None, "status {status}");
    }
    let github = TaskSourceRef::GitHubIssue {
        repo: None,
        number: 1,
    };
    assert!(source.read(&github).is_err());
}

/// Shep's comments are written as the person who made the API key; the signature is all that
/// tells them apart. Without it, the contract catches Shep's own words coming back.
#[test]
fn an_adapter_that_lost_its_signature_fails_the_contract() {
    let world = world();
    let unsigned = fixture("linear/comments.json").replace(SIGNATURE, "");
    world
        .server
        .on_body("POST", GRAPHQL, "query ShepReplies", 200, &unsigned);
    let source = world.source();
    let broken = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        source_contract::holds(&case(), &world.server, source.as_ref());
    }));
    assert!(
        broken.is_err(),
        "the contract should catch Shep's own words"
    );
}
