//! Plain-text rendering for the CLI. Formatting only; no decisions.

use std::fmt::Write;

use shep_app::{Board, StartOutcome};
use shep_domain::{Settings, Task, TaskState};

pub fn queued(task: &Task, settings: &Settings) -> String {
    format!(
        "Queued {}. It starts at {} tonight, or run `shep go` to start now.",
        task.title, settings.shift_start
    )
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

pub fn settings(s: &Settings) -> String {
    let agent = s.agent.map_or("not chosen", |a| a.cli_name());
    let repo = s.repo.as_deref().unwrap_or("not chosen");
    format!(
        "agent  {agent}\nshift  {}\nparallel  {}\nrepo  {repo}\n",
        s.shift_start, s.parallelism
    )
}
