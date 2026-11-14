//! What Shep says in a tracker (GitHub, Linear, Jira, Notion, Monday) as a task moves: one set
//! of words, as lines of text and links that each adapter renders its own way (Markdown, ADF,
//! Notion rich text, HTML) and marks so it can tell its own posts from people's. Slack speaks
//! in a thread instead, in the conversational lines of its own design (`slack/messages.rs`).

use shep_app::ports::Update;
use shep_domain::{PullRequest, SEND_BACK_PREFIX};

/// The command that starts work when no nightly shift is set.
const GO_COMMAND: &str = "shep go";

/// Part of a line: plain words or a link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Text(String),
    Link { text: String, url: String },
}

/// One paragraph.
pub type Line = Vec<Piece>;

fn text(s: impl Into<String>) -> Piece {
    Piece::Text(s.into())
}

fn pr_link(pr: &PullRequest) -> Piece {
    Piece::Link {
        text: format!("pull request #{}", pr.number),
        url: pr.url.clone(),
    }
}

/// The words for an update, one line per paragraph, without any mark.
pub fn lines(update: &Update) -> Vec<Line> {
    match update {
        Update::Queued { starts, repo } => {
            let when = starts.map_or_else(
                || format!("Queued for when you run {GO_COMMAND}"),
                |at| format!("Queued for tonight, {at}"),
            );
            let place = repo
                .as_ref()
                .map(|r| format!(" in {r}"))
                .unwrap_or_default();
            vec![vec![text(format!("{when}{place}. I'll reply here."))]]
        }
        Update::Asked { question } => vec![
            vec![text("A question before I go on:")],
            vec![text(question.trim())],
            vec![text("Reply here; the first reply is the answer.")],
        ],
        Update::Ready { pr, summary, .. } => {
            let mut first = vec![text("Ready for review: "), pr_link(pr)];
            if !summary.trim().is_empty() {
                first.push(text(format!(" · {}", summary.trim())));
            }
            vec![
                first,
                vec![text(format!(
                    "Merge it when it looks right, or reply \"{SEND_BACK_PREFIX} <what to change>\" \
                     to send it back."
                ))],
            ]
        }
        Update::Merged { pr } => vec![vec![text("Merged "), pr_link(pr), text(". Done.")]],
        Update::Stopped { reason } => vec![vec![text(format!("Stopped: {}.", reason.trim()))]],
    }
}

/// The same lines with `mark` in front of the first one.
pub fn marked(mark: &str, mut lines: Vec<Line>) -> Vec<Line> {
    if let Some(first) = lines.first_mut() {
        match first.first_mut() {
            Some(Piece::Text(words)) => *words = format!("{mark} {words}"),
            _ => first.insert(0, text(format!("{mark} "))),
        }
    }
    lines
}

/// As Markdown: a blank line between paragraphs, links as `[text](url)`.
pub fn markdown(lines: &[Line]) -> String {
    lines
        .iter()
        .map(|line| {
            line.iter()
                .map(|piece| match piece {
                    Piece::Text(t) => t.clone(),
                    Piece::Link { text, url } => format!("[{text}]({url})"),
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use shep_app::ports::Update;
    use shep_domain::{ClockTime, PullRequest};

    use super::{lines, markdown, marked};

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
            markdown(&lines(&tonight)),
            "Queued for tonight, 23:00 in acme/app. I'll reply here."
        );
        let manual = Update::Queued {
            starts: None,
            repo: None,
        };
        assert_eq!(
            markdown(&lines(&manual)),
            "Queued for when you run shep go. I'll reply here."
        );
    }

    #[test]
    fn ready_links_the_pr_and_says_how_to_send_it_back() {
        let ready = markdown(&lines(&Update::Ready {
            pr: pr(),
            summary: "CI green · +41 -12".into(),
            proof: Vec::new(),
        }));
        assert_eq!(
            ready,
            "Ready for review: [pull request #7](https://github.com/acme/app/pull/7) · CI green · \
             +41 -12\n\nMerge it when it looks right, or reply \"shep: <what to change>\" to send \
             it back."
        );
        let merged = markdown(&marked("🐑 Shep:", lines(&Update::Merged { pr: pr() })));
        assert_eq!(
            merged,
            "🐑 Shep: Merged [pull request #7](https://github.com/acme/app/pull/7). Done."
        );
    }
}
