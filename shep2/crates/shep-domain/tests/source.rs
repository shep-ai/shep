use shep_domain::{SourceKind, SourceRefError, TaskSourceRef};

#[test]
fn hash_number_is_a_github_issue_in_the_current_repo() {
    let r = TaskSourceRef::parse("#412").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::GitHubIssue {
            repo: None,
            number: 412
        }
    );
    assert_eq!(r.kind(), SourceKind::GitHub);
}

#[test]
fn owner_repo_hash_number_is_a_github_issue() {
    let r = TaskSourceRef::parse("acme/storefront#12").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::GitHubIssue {
            repo: Some("acme/storefront".into()),
            number: 12
        }
    );
}

#[test]
fn github_issue_url_is_parsed() {
    let r = TaskSourceRef::parse("https://github.com/acme/storefront/issues/218").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::GitHubIssue {
            repo: Some("acme/storefront".into()),
            number: 218
        }
    );
}

#[test]
fn linear_issue_url_keeps_the_issue_key() {
    let r = TaskSourceRef::parse("https://linear.app/acme/issue/ENG-342/invoice-dates").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::Linear {
            key: "ENG-342".into()
        }
    );
    assert_eq!(r.kind(), SourceKind::Linear);
}

#[test]
fn jira_browse_url_keeps_the_issue_key() {
    let r = TaskSourceRef::parse("https://acme.atlassian.net/browse/STORE-218").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::Jira {
            key: "STORE-218".into()
        }
    );
}

#[test]
fn notion_monday_and_slack_links_keep_the_url() {
    let cases = [
        (
            "https://www.notion.so/acme/Fix-export-8f2c",
            SourceKind::Notion,
        ),
        (
            "https://acme.monday.com/boards/1/pulses/2",
            SourceKind::Monday,
        ),
        (
            "https://acme.slack.com/archives/C01/p1730400000",
            SourceKind::Slack,
        ),
    ];
    for (url, kind) in cases {
        let r = TaskSourceRef::parse(url).unwrap();
        assert_eq!(r.kind(), kind, "{url}");
        assert_eq!(r.to_string(), url);
    }
}

#[test]
fn anything_else_is_a_sentence() {
    let r = TaskSourceRef::parse("  Rate-limit /api/search  ").unwrap();
    assert_eq!(
        r,
        TaskSourceRef::Sentence {
            text: "Rate-limit /api/search".into()
        }
    );
    assert_eq!(r.kind(), SourceKind::Shep);
}

#[test]
fn empty_input_is_refused() {
    assert_eq!(TaskSourceRef::parse("   "), Err(SourceRefError::Empty));
}

#[test]
fn github_refs_display_compactly() {
    assert_eq!(TaskSourceRef::parse("#412").unwrap().to_string(), "#412");
    assert_eq!(
        TaskSourceRef::parse("acme/web#3").unwrap().to_string(),
        "acme/web#3"
    );
}
