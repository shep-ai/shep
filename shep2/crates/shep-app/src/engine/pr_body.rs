//! The pull request Shep writes: what changed, proof, CI, the second opinion.

use std::fmt::Write;
use std::path::PathBuf;

use shep_domain::{EventKind, Task, TaskEvent, TaskSourceRef};

use super::time;

/// Lines of test output shown; the rest stays in the task's folder.
const MAX_PROOF_LINES: usize = 40;
const FOOTER: &str = "Shep opens drafts only. You merge.";
const PULL_SEGMENT: &str = "/pull/";

/// What the agent saved as proof.
#[derive(Debug, Default)]
pub struct Proof {
    /// File name and text (test output).
    pub texts: Vec<(String, String)>,
    /// File name and published URL (screenshots).
    pub images: Vec<(String, String)>,
    /// Where screenshots stay when they could not be published.
    pub images_kept_at: Option<PathBuf>,
}

pub struct Ready<'a> {
    pub task: &'a Task,
    pub diff_stat: &'a str,
    pub agent: Option<&'a str>,
    pub review: &'a str,
    pub proof: &'a Proof,
    pub events: &'a [TaskEvent],
    pub utc_offset: i64,
}

/// The body while CI, proof and the review are still to come.
pub fn draft(task: &Task, diff_stat: &str, agent: Option<&str>) -> String {
    let mut body = intro(task);
    changed(&mut body, diff_stat);
    body.push_str("\nShep is still on it: CI, proof and a second opinion follow here.\n");
    footer(&mut body, agent);
    body
}

pub fn ready(r: &Ready<'_>) -> String {
    let mut body = intro(r.task);
    changed(&mut body, r.diff_stat);
    proof(&mut body, r.proof);
    ci(&mut body, r.events, r.utc_offset);
    let _ = write!(body, "\n## Second opinion\n\n{}\n", r.review);
    footer(&mut body, r.agent);
    body
}

/// A link to a file in a commit of the PR's repository that renders as an image.
pub fn blob_url(pr_url: &str, commit: &str, name: &str) -> String {
    let repo = pr_url
        .rsplit_once(PULL_SEGMENT)
        .map_or(pr_url, |(repo, _)| repo);
    format!("{repo}/blob/{commit}/{name}?raw=true")
}

fn intro(task: &Task) -> String {
    match &task.source {
        TaskSourceRef::GitHubIssue { repo: None, number } => format!("Closes #{number}.\n"),
        TaskSourceRef::GitHubIssue {
            repo: Some(repo),
            number,
        } => format!("Closes {repo}#{number}.\n"),
        TaskSourceRef::Sentence { text } => format!("Task: {text}\n"),
        other => format!("Task: {other}\n"),
    }
}

fn changed(body: &mut String, diff_stat: &str) {
    if !diff_stat.trim().is_empty() {
        let _ = write!(
            body,
            "\n## What changed\n\n```text\n{}\n```\n",
            diff_stat.trim_end()
        );
    }
}

fn proof(body: &mut String, proof: &Proof) {
    if proof.texts.is_empty() && proof.images.is_empty() && proof.images_kept_at.is_none() {
        return;
    }
    body.push_str("\n## Proof\n");
    for (name, url) in &proof.images {
        let _ = write!(body, "\n![{name}]({url})\n");
    }
    if let Some(dir) = &proof.images_kept_at {
        let _ = write!(
            body,
            "\nScreenshots are on the machine that ran Shep, in `{}`.\n",
            dir.display()
        );
    }
    for (name, text) in &proof.texts {
        let lines: Vec<&str> = text.lines().collect();
        let shown = &lines[lines.len().saturating_sub(MAX_PROOF_LINES)..];
        let _ = write!(body, "\n`{name}`\n\n```text\n{}\n```\n", shown.join("\n"));
    }
}

fn ci(body: &mut String, events: &[TaskEvent], utc_offset: i64) {
    let lines: Vec<String> = events
        .iter()
        .filter(|e| {
            matches!(
                e.kind,
                EventKind::CiFailed | EventKind::CiGreen | EventKind::NoCi | EventKind::Parked
            )
        })
        .map(|e| format!("- {} {}", time::local(e.at, utc_offset).1, e.detail))
        .collect();
    if !lines.is_empty() {
        let _ = write!(body, "\n## CI\n\n{}\n", lines.join("\n"));
    }
}

fn footer(body: &mut String, agent: Option<&str>) {
    let by = agent.map_or_else(String::new, |a| format!(" with {a}, on your login"));
    let _ = write!(body, "\n---\n\nMade by Shep{by}. {FOOTER}\n");
}
