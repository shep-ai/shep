//! The split view: tasks on the left, the selected agent's live session on top, its diff and
//! its CI and proof below. `tab` moves focus, `z` zooms the focused pane, `enter` attaches.

use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;
use shep_app::TaskDetail;
use shep_domain::{CheckState, TaskState};

use crate::chrome::{self, state_style};
use crate::glyph::{self, mark, reference, title};
use crate::model::Pane;
use crate::theme::Theme;
use crate::view::ViewData;

const KEYS: [(&str, &str); 4] = [
    ("tab", "next pane"),
    ("j k", "task"),
    ("enter", "attach and type to the agent"),
    ("z", "zoom pane"),
];
const TAIL: &str = "m merge · s send back · 1 board · 3 watch";
const FOCUS_PREFIX: &str = " · focus: ";
const ATTACHED_KEYS: [(&str, &str); 1] = [("ctrl-]", "detach")];
const TASKS_WIDTH: u16 = 34;
const SESSION_SHARE: u16 = 55;
const GROUPS: [(TaskState, &str); 4] = [
    (TaskState::NeedsYou, "NEEDS YOU"),
    (TaskState::Working, "WORKING"),
    (TaskState::Ready, "READY"),
    (TaskState::Queued, "QUEUED"),
];

pub fn render(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let [top, body, keys] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Min(5),
        Constraint::Length(1),
    ])
    .areas(area);
    render_top(f, top, v);
    let focus = v.model.focus();
    if v.model.zoomed() {
        render_pane(f, body, v, focus);
    } else {
        let [tasks, right] =
            Layout::horizontal([Constraint::Length(TASKS_WIDTH), Constraint::Min(20)]).areas(body);
        render_pane(f, tasks, v, Pane::Tasks);
        let [session, lower] =
            Layout::vertical([Constraint::Percentage(SESSION_SHARE), Constraint::Min(4)])
                .areas(right);
        render_pane(f, session, v, Pane::Session);
        let [diff, ci] =
            Layout::horizontal([Constraint::Ratio(3, 5), Constraint::Ratio(2, 5)]).areas(lower);
        render_pane(f, diff, v, Pane::Diff);
        render_pane(f, ci, v, Pane::Ci);
    }
    if let Some(id) = v.model.attached() {
        chrome::hints(
            f,
            keys,
            v,
            &ATTACHED_KEYS,
            &format!("typing to {id}'s agent"),
        );
    } else {
        let tail = format!("{TAIL}{FOCUS_PREFIX}{}", pane_word(focus));
        chrome::hints(f, keys, v, &KEYS, &tail);
    }
}

/// "1 agent", "3 agents".
fn count(n: usize, word: &str) -> String {
    if n == 1 {
        format!("{n} {word}")
    } else {
        format!("{n} {word}s")
    }
}

fn pane_word(p: Pane) -> &'static str {
    match p {
        Pane::Tasks => "tasks",
        Pane::Session => "session",
        Pane::Diff => "diff",
        Pane::Ci => "ci",
    }
}

fn render_top(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let t = v.theme;
    let tabs = Line::from(vec![
        Span::styled(" 1 board ", t.muted()),
        Span::styled(" 2 split ", t.selected()),
        Span::styled(" 3 watch ", t.muted()),
    ]);
    let board = v.model.board();
    let done = board.ready.len() + v.merged_today;
    let total = done + board.working.len() + board.queued.len() + board.needs_you.len();
    let status = Line::from(vec![
        Span::styled(
            format!(
                "{} · {} running · {} · ",
                v.repo,
                count(board.working.len(), "agent"),
                v.clock
            ),
            t.muted(),
        ),
        Span::styled(format!("☾ {done}/{total}"), t.accent()),
    ])
    .right_aligned();
    f.render_widget(Paragraph::new(tabs), area);
    f.render_widget(Paragraph::new(status), area);
}

fn pane_block(t: Theme, title: Line<'static>, focused: bool) -> Block<'static> {
    let style = if focused { t.accent() } else { t.border() };
    Block::new()
        .borders(Borders::ALL)
        .border_style(style)
        .title(title)
}

fn render_pane(f: &mut Frame, area: Rect, v: &ViewData<'_>, pane: Pane) {
    let focused = v.model.focus() == pane;
    let t = v.theme;
    let detail = v.detail.filter(|d| Some(d.task.id) == v.model.selected());
    let (heading, lines) = match pane {
        Pane::Tasks => (
            heading(t, "TASKS", &v.model.split_list().len().to_string()),
            task_lines(v),
        ),
        Pane::Session => (session_heading(t, detail), session_lines(v, detail, area)),
        Pane::Diff => (diff_heading(t, detail), diff_lines(t, detail)),
        Pane::Ci => (ci_heading(t, detail), ci_lines(t, detail, v.frame)),
    };
    f.render_widget(
        Paragraph::new(lines).block(pane_block(t, heading, focused)),
        area,
    );
}

fn heading(t: Theme, name: &str, right: &str) -> Line<'static> {
    Line::from(vec![
        Span::styled(format!(" {name} "), t.label()),
        Span::styled(format!("{right} "), t.muted()),
    ])
}

fn task_lines(v: &ViewData<'_>) -> Vec<Line<'static>> {
    let t = v.theme;
    let board = v.model.board();
    let mut lines = Vec::new();
    for (state, label) in GROUPS {
        let tasks = match state {
            TaskState::NeedsYou => &board.needs_you,
            TaskState::Working => &board.working,
            TaskState::Ready => &board.ready,
            _ => &board.queued,
        };
        if tasks.is_empty() {
            continue;
        }
        lines.push(Line::from(Span::styled(
            format!(" {label}"),
            state_style(t, state),
        )));
        for task in tasks {
            let line = Line::from(vec![
                Span::styled(
                    format!(" {} ", mark(task, v.frame)),
                    state_style(t, task.state),
                ),
                Span::styled(format!("{} ", reference(task)), t.muted()),
                Span::styled(title(task), t.text()),
            ]);
            lines.push(if v.model.selected() == Some(task.id) {
                line.style(t.selected())
            } else {
                line
            });
        }
        lines.push(Line::default());
    }
    lines.push(chrome::fold(v));
    lines
}

fn session_heading(t: Theme, d: Option<&TaskDetail>) -> Line<'static> {
    let Some(d) = d else {
        return heading(t, "SESSION", "");
    };
    let agent = d.agent.map_or("agent", |a| a.display_name());
    let branch = d.branch.as_deref().unwrap_or("no worktree yet");
    let words = format!(
        "{} · {agent} · worktree {branch} · {}",
        reference(&d.task),
        glyph::step_word(d.step)
    );
    heading(t, "SESSION", &words)
}

/// The agent's screen, newest lines at the bottom: live while attached, else as last read.
fn session_lines(v: &ViewData<'_>, d: Option<&TaskDetail>, area: Rect) -> Vec<Line<'static>> {
    let t = v.theme;
    let rows = usize::from(area.height.saturating_sub(2));
    if let (Some(live), Some(_)) = (v.live, v.model.attached()) {
        let blank = |l: &Line| l.spans.iter().all(|s| s.content.trim().is_empty());
        let end = live.iter().rposition(|l| !blank(l)).map_or(0, |i| i + 1);
        return live[end.saturating_sub(rows)..end].to_vec();
    }
    let Some(d) = d else {
        return vec![Line::from(Span::styled(
            " Pick a task on the left.",
            t.muted(),
        ))];
    };
    let Some(screen) = d.screen.as_deref() else {
        return vec![Line::from(Span::styled(
            format!(" {}", d.activity),
            t.muted(),
        ))];
    };
    let text: Vec<&str> = screen.lines().collect();
    let end = text
        .iter()
        .rposition(|l| !l.trim().is_empty())
        .map_or(0, |i| i + 1);
    let start = end.saturating_sub(rows);
    let mut lines: Vec<Line<'static>> = vec![Line::default(); rows.saturating_sub(end - start)];
    lines.extend(
        text[start..end]
            .iter()
            .map(|l| Line::from(Span::styled((*l).to_owned(), t.text()))),
    );
    lines
}

fn diff_heading(t: Theme, d: Option<&TaskDetail>) -> Line<'static> {
    let right = d.map_or_else(String::new, |d| {
        format!(
            "+{} -{} · {} files",
            d.stat.added, d.stat.removed, d.stat.files
        )
    });
    heading(t, "DIFF", &right)
}

fn diff_lines(t: Theme, d: Option<&TaskDetail>) -> Vec<Line<'static>> {
    let Some(diff) = d.and_then(|d| d.diff.as_deref()) else {
        return vec![Line::from(Span::styled(" No changes yet.", t.muted()))];
    };
    diff.lines()
        .filter(|l| !l.starts_with("diff --git") && !l.starts_with("index "))
        .map(|l| {
            let style: Style =
                if l.starts_with("+++") || l.starts_with("---") || l.starts_with("@@") {
                    t.muted()
                } else if l.starts_with('+') {
                    t.added()
                } else if l.starts_with('-') {
                    t.removed()
                } else {
                    t.text()
                };
            Line::from(Span::styled(format!(" {l}"), style))
        })
        .collect()
}

fn ci_heading(t: Theme, d: Option<&TaskDetail>) -> Line<'static> {
    let state = d.map_or("", |d| {
        if d.checks.iter().any(|c| c.state == CheckState::Failed) {
            "red"
        } else if d.checks.iter().any(|c| c.state == CheckState::Pending) {
            "running"
        } else if d.checks.is_empty() {
            ""
        } else {
            "green"
        }
    });
    heading(t, "CI & PROOF", state)
}

fn ci_lines(t: Theme, d: Option<&TaskDetail>, frame: Option<u64>) -> Vec<Line<'static>> {
    let Some(d) = d else {
        return Vec::new();
    };
    let mut lines: Vec<Line<'static>> = d
        .checks
        .iter()
        .map(|c| {
            let (mark, style) = match c.state {
                CheckState::Passed => ("✓", t.ready()),
                CheckState::Failed => ("✗", t.needs_you()),
                CheckState::Pending => (glyph::spinner(frame), t.working()),
                CheckState::Skipped => ("·", t.muted()),
            };
            Line::from(vec![
                Span::styled(format!(" {mark} "), style),
                Span::styled(c.name.clone(), t.text()),
            ])
        })
        .collect();
    if lines.is_empty() {
        lines.push(Line::from(Span::styled(" No CI checks yet.", t.muted())));
    }
    if !d.proof.is_empty() {
        lines.push(Line::default());
    }
    for path in &d.proof {
        let name = path.rsplit('/').next().unwrap_or(path);
        lines.push(Line::from(vec![
            Span::styled(" ▣ ", t.accent()),
            Span::styled(format!("proof/{name}"), t.muted()),
        ]));
    }
    if let Some(review) = &d.review {
        lines.push(Line::default());
        lines.push(Line::from(Span::styled(" second opinion", t.label())));
        lines.push(Line::from(Span::styled(format!(" {review}"), t.text())));
    }
    lines
}
