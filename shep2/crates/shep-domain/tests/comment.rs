use shep_domain::{send_back_note, SEND_BACK_PREFIX};

#[test]
fn a_comment_starting_with_shep_colon_carries_a_send_back_note() {
    assert_eq!(SEND_BACK_PREFIX, "shep:");
    assert_eq!(
        send_back_note("shep: also handle /signup").as_deref(),
        Some("also handle /signup")
    );
    assert_eq!(
        send_back_note("\n  Shep:  keep the old URL\n\nthanks ").as_deref(),
        Some("keep the old URL\n\nthanks")
    );
}

#[test]
fn other_comments_and_empty_notes_send_nothing_back() {
    for body in [
        "",
        "LGTM",
        "please shep: do it",
        "shep:",
        "shep:   \n ",
        "shepherd: no",
    ] {
        assert_eq!(send_back_note(body), None, "{body:?}");
    }
}
