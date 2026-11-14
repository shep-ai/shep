//! The watch screen, to leave open overnight: the sky warms toward dawn as tasks finish, and
//! every task shows what it is doing and a small graph of its activity.

use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;
use shep_app::TaskDetail;
use shep_domain::TaskEvent;

use crate::chrome::state_style;
use crate::glyph::{mark, reference, title};
use crate::sky::{self, Night};
use crate::view::ViewData;

const SKY_ROWS: u16 = 13;
const TITLE_WIDTH: usize = 34;
const STATUS_WIDTH: usize = 30;
const GRAPH_WIDTH: usize = 16;
/// Seconds of history one graph column covers.
const GRAPH_BUCKET_SECS: i64 = 10 * 60;
const BARS: [char; 5] = ['⠀', '⢀', '⣀', '⣤', '⣶'];

pub fn render(f: &mut Frame, area: Rect, v: &ViewData<'_>) {
    let t = v.theme;
    let [head, scene, _, list, foot] = Layout::vertical([
        Constraint::Length(1),
        Constraint::Length(SKY_ROWS),
        Constraint::Length(1),
        Constraint::Min(1),
        Constraint::Length(1),
    ])
    .areas(area);
    let headline = format!("shep · watch · {} · {}", v.repo, v.clock);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(headline, t.muted()))),
        head,
    );
    let board = v.model.board();
    let done = board.ready.len() + v.merged_today;
    let total = done + board.working.len() + board.queued.len() + board.needs_you.len();
    let night = Night {
        progress: if total == 0 { 0.0 } else { ratio(done, total) },
        folded: done,
        walking: board.working.len(),
        sleeping: board.queued.len(),
        lantern: 1.0,
    };
    f.render_widget(
        Paragraph::new(sky::scene(scene.width, scene.height, night, v.frame, t)),
        scene,
    );
    let now = v
        .details
        .iter()
        .flat_map(|d| d.events.iter().map(|e| e.at.0))
        .max()
        .unwrap_or(0);
    let lines: Vec<Line> = v.details.iter().map(|d| row(d, v, now)).collect();
    f.render_widget(Paragraph::new(lines), list);
    let footer = Line::from(vec![
        Span::styled("● ", t.accent()),
        Span::styled(
            format!("keeping watch · {done} of {total} in the fold · 1 board · ctrl-c to leave"),
            t.muted(),
        ),
    ]);
    f.render_widget(Paragraph::new(footer), foot);
}

fn ratio(a: usize, b: usize) -> f32 {
    let f = |n: usize| u16::try_from(n).map_or(f32::from(u16::MAX), f32::from);
    f(a) / f(b)
}

fn row(d: &TaskDetail, v: &ViewData<'_>, now: i64) -> Line<'static> {
    let t = v.theme;
    let style = state_style(t, d.task.state);
    let name = format!("{} {}", reference(&d.task), title(&d.task));
    let status = d.activity.clone();
    Line::from(vec![
        Span::styled(format!(" {} ", mark(&d.task, v.frame)), style),
        Span::styled(pad(&name, TITLE_WIDTH), t.text()),
        Span::styled(pad(&status, STATUS_WIDTH), style),
        Span::styled(graph(&d.events, now), t.working()),
    ])
}

fn pad(text: &str, width: usize) -> String {
    let mut s: String = text.chars().take(width.saturating_sub(1)).collect();
    while s.chars().count() < width {
        s.push(' ');
    }
    s
}

/// How busy the task was over the last few hours: one braille column per ten minutes.
pub fn graph(events: &[TaskEvent], now: i64) -> String {
    let mut counts = [0usize; GRAPH_WIDTH];
    let width = i64::try_from(GRAPH_WIDTH).unwrap_or(1);
    for e in events {
        let age = (now - e.at.0) / GRAPH_BUCKET_SECS;
        if (0..width).contains(&age) {
            let slot = usize::try_from(width - 1 - age).unwrap_or(0);
            counts[slot] += 1;
        }
    }
    counts
        .iter()
        .map(|n| BARS[(*n).min(BARS.len() - 1)])
        .collect()
}
