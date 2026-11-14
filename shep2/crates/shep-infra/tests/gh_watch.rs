//! What the engine watches on GitHub through `gh`: who is signed in, pull request comments,
//! whether an issue is still open, and closing a draft.

mod support;

use shep_app::ports::{Forge, IssueState, PrComment};
use shep_domain::{TaskSourceRef, UnixTime};
use support::fake_gh::{pr, FakeGh};

#[test]
fn the_viewer_is_the_login_gh_is_signed_in_as() {
    let fake = FakeGh::new();
    fake.answer("api_user", "night-owl\n", 0);
    assert_eq!(fake.gh().viewer(&fake.here()).unwrap(), "night-owl");
    assert_eq!(fake.calls(), ["api user --jq .login"]);

    let fake = FakeGh::new();
    fake.complain("api_user", "gh auth login", 4);
    assert!(fake.gh().viewer(&fake.here()).is_err());
}

#[test]
fn comments_come_with_their_author_and_time() {
    let fake = FakeGh::new();
    fake.answer(
        "pr_view",
        r#"{"comments":[
            {"author":{"login":"night-owl"},"body":"shep: also /signup","createdAt":"2026-11-14T03:00:05Z"},
            {"author":{"login":"ci-bot"},"body":"Coverage 91%","createdAt":"2026-11-14T03:01:00Z"}
        ]}"#,
        0,
    );
    let comments = fake.gh().comments(&fake.here(), &pr()).unwrap();
    assert_eq!(
        comments,
        [
            PrComment {
                author: "night-owl".into(),
                body: "shep: also /signup".into(),
                at: UnixTime(1_794_625_205),
            },
            PrComment {
                author: "ci-bot".into(),
                body: "Coverage 91%".into(),
                at: UnixTime(1_794_625_260),
            },
        ]
    );
    assert_eq!(fake.calls(), ["pr view 7 --json comments"]);
}

#[test]
fn a_comment_without_an_author_is_nobodys() {
    let fake = FakeGh::new();
    fake.answer(
        "pr_view",
        r#"{"comments":[{"author":null,"body":"shep: x","createdAt":"2026-11-14T03:00:05Z"}]}"#,
        0,
    );
    let comments = fake.gh().comments(&fake.here(), &pr()).unwrap();
    assert_eq!(comments[0].author, "");
}

#[test]
fn an_issue_says_whether_it_is_still_open() {
    let fake = FakeGh::new();
    fake.answer("issue_view", r#"{"state":"CLOSED"}"#, 0);
    let gh = fake.gh();
    let here = TaskSourceRef::parse("#4").unwrap();
    assert_eq!(
        gh.issue_state(&fake.here(), &here).unwrap(),
        Some(IssueState::Closed)
    );
    fake.answer("issue_view", r#"{"state":"OPEN"}"#, 0);
    let other = TaskSourceRef::parse("acme/api#9").unwrap();
    assert_eq!(
        gh.issue_state(&fake.here(), &other).unwrap(),
        Some(IssueState::Open)
    );
    let sentence = TaskSourceRef::parse("Do a thing").unwrap();
    assert_eq!(gh.issue_state(&fake.here(), &sentence).unwrap(), None);
    assert_eq!(
        fake.calls(),
        [
            "issue view 4 --json state",
            "issue view 9 --json state -R acme/api"
        ]
    );
}

#[test]
fn a_draft_is_closed_with_a_comment() {
    let fake = FakeGh::new();
    fake.gh()
        .close(&fake.here(), &pr(), "Shep stopped: the issue was closed.")
        .unwrap();
    assert_eq!(
        fake.calls(),
        ["pr close 7 --comment Shep stopped: the issue was closed."]
    );
}
