//! What Shep writes in a source as a task moves, the same words in every tracker. Each adapter
//! adds its own mark so it can tell Shep's comments from people's.

use std::fmt::Write as _;

use shep_app::ports::Update;

/// The command that starts work when no nightly shift is set.
const GO_COMMAND: &str = "`shep go`";
/// How a person sends finished work back with a note (see `send_back_note`).
const SEND_BACK_HINT: &str = "`shep: <what to change>`";

/// The comment for an update, without any mark.
pub(crate) fn update_text(update: &Update) -> String {
    match update {
        Update::Queued { starts, repo } => {
            let mut text = match starts {
                Some(at) => format!("Queued for tonight, {at}"),
                None => format!("Queued for when you run {GO_COMMAND}"),
            };
            if let Some(repo) = repo {
                let _ = write!(text, " in {repo}");
            }
            text.push_str(". I'll reply here.");
            text
        }
        Update::Asked { question } => format!(
            "A question before I go on:\n\n{}\n\nReply here; the first reply is the answer.",
            quoted(question)
        ),
        Update::Ready { pr, summary, .. } => {
            let mut text = format!("Ready for review: {}", pr.url);
            if !summary.trim().is_empty() {
                let _ = write!(text, "\n\n{}", summary.trim());
            }
            let _ = write!(
                text,
                "\n\nMerge it when it looks right, or reply {SEND_BACK_HINT} to send it back."
            );
            text
        }
        Update::Merged { pr } => format!("Merged: {}. Done.", pr.url),
        Update::Stopped { reason } => format!("Stopped: {reason}."),
    }
}

/// Every line as a Markdown quote.
fn quoted(text: &str) -> String {
    text.trim()
        .lines()
        .map(|line| format!("> {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use shep_app::ports::Update;
    use shep_domain::{ClockTime, PullRequest};

    use super::update_text;

    fn pr() -> PullRequest {
        PullRequest {
            number: 7,
            url: "https://github.com/acme/app/pull/7".into(),
        }
    }

    #[test]
    fn queued_says_when_and_where() {
        let tonight = Update::Queued {
            starts: Some(ClockTime::parse("23:00").unwrap()),
            repo: Some("acme/app".into()),
        };
        assert_eq!(
            update_text(&tonight),
            "Queued for tonight, 23:00 in acme/app. I'll reply here."
        );
        let manual = Update::Queued {
            starts: None,
            repo: None,
        };
        assert_eq!(
            update_text(&manual),
            "Queued for when you run `shep go`. I'll reply here."
        );
    }

    #[test]
    fn a_question_is_quoted_and_ready_links_the_pr() {
        let asked = update_text(&Update::Asked {
            question: "Which zone?\nUTC or local?".into(),
        });
        assert!(asked.contains("> Which zone?\n> UTC or local?"), "{asked}");
        let ready = update_text(&Update::Ready {
            pr: pr(),
            summary: "CI green · +41 -12".into(),
            proof: Vec::new(),
        });
        assert!(ready.starts_with("Ready for review: https://github.com/acme/app/pull/7"));
        assert!(ready.contains("CI green · +41 -12"), "{ready}");
        assert!(ready.contains("`shep: <what to change>`"), "{ready}");
        let merged = update_text(&Update::Merged { pr: pr() });
        assert!(merged.contains("/pull/7"), "{merged}");
    }
}
