//! The board: Queued | Working | Ready (Needs you on top, marked `!`), and the selected task.

use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;
use shep_domain::{Task, TaskState};

use crate::chrome::{self, state_style};
use crate::glyph::{mark, reference, title};
use crate::model::Column;
use crate::view::ViewData;

const KEYS: [(&str, &str); 5] = [
    ("j k", "move"),
    ("m", "merge"),
    ("s", "send back"),
    ("a", "answer"),
    ("g", "start queued now"),
];
const TAIL: &str = "enter opens the PR · 2 split · 3 watch · q quits";
const DETAIL_HEIGHT: u16 = 4;

pub fn render(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let [title, fold, _, columns, detail, keys] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(1),
        Constraint::Length(1),
        Constraint::Min(3),
        Constraint::Length(DETAIL_HEIGHT),
        Constraint::Length(1),
    ])
    .areas(area);
    chrome::title(f, title, v, "board");
    f.render_widget(Paragraph::new(chrome::fold(v)), fold);
    render_columns(f, columns, v);
    render_detail(f, detail, v);
    chrome::hints(f, keys, v, &KEYS, TAIL);
}

fn render_columns(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let t = v.theme;
    let outer = Block::new().borders(Borders::ALL).border_style(t.border());
    let inner = outer.inner(area);
    f.render_widget(outer, area);
    let areas: [Rect; 3] = Layout::horizontal([Constraint::Ratio(1, 3); 3]).areas(inner);
    let headings = [
        (Column::Queued, "QUEUED", t.muted()),
        (Column::Working, "WORKING", t.working()),
        (Column::Ready, "READY", t.ready()),
    ];
    for (i, (column, heading, style)) in headings.into_iter().enumerate() {
        let tasks = v.model.column_tasks(column);
        // Every column after the first draws its own divider on the left.
        let side = if i == 0 { Borders::NONE } else { Borders::LEFT };
        let column_block = Block::new().borders(side).border_style(t.border());
        let inside = column_block.inner(areas[i]);
        f.render_widget(column_block, areas[i]);
        let [head, body] =
            Layout::vertical([Constraint::Length(2), Constraint::Min(0)]).areas(inside);
        f.render_widget(
            Block::new()
                .borders(Borders::BOTTOM)
                .border_style(t.border()),
            head,
        );
        let head_text = Rect { height: 1, ..head };
        let name = Line::from(Span::styled(format!(" {heading}"), style));
        f.render_widget(Paragraph::new(name), head_text);
        let count =
            Line::from(Span::styled(format!("{} ", tasks.len()), t.muted())).right_aligned();
        f.render_widget(Paragraph::new(count), head_text);
        let lines: Vec<Line> = tasks.iter().map(|task| row(task, v)).collect();
        f.render_widget(Paragraph::new(lines), body);
    }
}

fn row(task: &Task, v: &ViewData<'_>) -> Line<'static> {
    let t = v.theme;
    let selected = v.model.selected() == Some(task.id);
    let line = Line::from(vec![
        Span::styled(
            format!(" {} ", mark(task, v.frame)),
            state_style(t, task.state),
        ),
        Span::styled(format!("{} ", reference(task)), t.muted()),
        Span::styled(title(task), t.text()),
    ]);
    if selected {
        line.style(t.selected())
    } else {
        line
    }
}

fn render_detail(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let t = v.theme;
    let block = Block::new().borders(Borders::ALL).border_style(t.border());
    let lines = match (v.model.selected_task(), v.detail) {
        (Some(task), detail) => {
            let summary = detail
                .filter(|d| d.task.id == task.id)
                .map_or_else(String::new, |d| {
                    // A finished task reads like the brief; anything else says what it is
                    // doing now.
                    if d.task.state == TaskState::Ready && !d.summary.is_empty() {
                        d.summary.clone()
                    } else {
                        d.activity.clone()
                    }
                });
            vec![
                Line::from(vec![
                    Span::styled(
                        format!("{} ", mark(task, v.frame)),
                        state_style(t, task.state),
                    ),
                    Span::styled(
                        format!("{} {}", reference(task), title(task)),
                        state_style(t, task.state),
                    ),
                ]),
                Line::from(Span::styled(summary, t.muted())),
            ]
        }
        (None, _) => vec![Line::from(Span::styled(
            "Nothing yet. Hand Shep a task: shep add \"#412\"",
            t.muted(),
        ))],
    };
    f.render_widget(Paragraph::new(lines).block(block), area);
}
