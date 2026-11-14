//! Plain-text rendering for the CLI. Formatting only; no decisions.

use std::fmt::Write;

use shep_app::{AgentOption, Board, SourceStatus, StartOutcome};
use shep_domain::{Settings, Task, TaskState};

pub fn queued(task: &Task, settings: &Settings) -> String {
    format!(
        "Queued {}. It starts at {} tonight, or run `shep go` to start now.",
        task.title, settings.shift_start
    )
}

pub fn queued_label(added: &[Task], label: &str, settings: &Settings) -> String {
    match added.len() {
        0 => format!("No new open issues labelled {label}."),
        1 => format!(
            "Queued 1 issue labelled {label}. It starts at {} tonight.",
            settings.shift_start
        ),
        n => format!(
            "Queued {n} issues labelled {label}. They start at {} tonight.",
            settings.shift_start
        ),
    }
}

pub fn board(board: &Board) -> String {
    let mut out = String::new();
    for (state, tasks) in board.groups().filter(|(_, tasks)| !tasks.is_empty()) {
        let _ = writeln!(out, "{state} ({})", tasks.len());
        for task in tasks {
            let _ = writeln!(out, "  {:>4}  {}", task.id, task.title);
            if let (TaskState::NeedsYou, Some(q)) = (state, &task.question) {
                let _ = writeln!(out, "        ? {q}");
            }
            if let Some(pr) = &task.pr {
                let _ = writeln!(out, "        {pr}");
            }
        }
    }
    if out.is_empty() {
        out.push_str("Nothing yet. Hand Shep a task:\n  shep add \"#412\"\n  shep add \"Fix the login redirect loop\"\n");
    }
    out
}

pub fn started(outcome: &StartOutcome, board_after: &Board, settings: &Settings) -> String {
    match outcome {
        StartOutcome::Scheduled { at, queued } => {
            format!("Shift starts at {at} with {queued} queued.")
        }
        StartOutcome::Started(tasks) if !tasks.is_empty() => {
            let mut out = format!("Started {}:\n", tasks.len());
            for t in tasks {
                let _ = writeln!(out, "  {:>4}  {}", t.id, t.title);
            }
            out.push_str("Shep works on them in the background. Run `shep` to see the board.\n");
            out
        }
        StartOutcome::Started(_) if board_after.queued.is_empty() => {
            "Nothing queued. Add a task with `shep add`.".to_owned()
        }
        StartOutcome::Started(_) => format!(
            "Already running {} at a time. {} still queued.",
            settings.parallelism,
            board_after.queued.len()
        ),
    }
}

/// The label column of `shep config`, wide enough for the longest label.
const LABEL_WIDTH: usize = 15;
const NOT_CHOSEN: &str = "not chosen";
const ON: &str = "on";
const OFF: &str = "off";
const HOW_TO_CONNECT: &str = "none · shep config --connect linear";
const PULL_REQUESTS: &str = "draft · you merge";

pub fn settings(s: &Settings, sources: &[SourceStatus], agents: &[AgentOption]) -> String {
    let agent = match s.agent {
        None => NOT_CHOSEN.to_owned(),
        Some(chosen) => {
            let also: Vec<&str> = agents
                .iter()
                .filter(|a| a.installed && a.kind != chosen)
                .map(|a| a.kind.cli_name())
                .collect();
            if also.is_empty() {
                chosen.cli_name().to_owned()
            } else {
                format!("{} (also: {})", chosen.cli_name(), also.join(", "))
            }
        }
    };
    let when = if s.nightly {
        "every night"
    } else {
        "on shep go only"
    };
    let connected: Vec<String> = sources
        .iter()
        .filter(|src| src.connected)
        .map(|src| match &src.problem {
            Some(problem) => format!("{} ✗ {problem}", src.kind.cli_name()),
            None => format!("{} ({})", src.kind.cli_name(), src.account),
        })
        .collect();
    let rows = [
        ("agent", agent),
        (
            "repo",
            s.repo.clone().unwrap_or_else(|| NOT_CHOSEN.to_owned()),
        ),
        ("start at", format!("{} {when}", s.shift_start)),
        ("in parallel", s.parallelism.to_string()),
        ("keep awake", if s.keep_awake { ON } else { OFF }.to_owned()),
        (
            "sources",
            if connected.is_empty() {
                HOW_TO_CONNECT.to_owned()
            } else {
                connected.join(", ")
            },
        ),
        ("pull requests", PULL_REQUESTS.to_owned()),
    ];
    let mut out = String::new();
    for (label, value) in rows {
        let _ = writeln!(out, "{label:<LABEL_WIDTH$}{value}");
    }
    out
}

/// After `shep config --connect`: who it is connected as and how to hand work over there.
pub fn connected(status: &SourceStatus) -> String {
    let mut out = format!("✓ {} connected · {}\n", status.name, status.account);
    for (i, step) in status.form.hand_over.iter().enumerate() {
        let lead = if i == 0 {
            "  hand work over: "
        } else {
            "                  "
        };
        let _ = writeln!(out, "{lead}{step}");
    }
    out.push('\n');
    out
}
