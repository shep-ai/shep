//! What every screen shares: the title line, the fold, key hints and the prompt line.

use ratatui::layout::Rect;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;
use shep_domain::TaskState;

use crate::glyph::{SHEEP, SLEEPING_SHEEP};
use crate::theme::Theme;
use crate::view::ViewData;

const SEP: &str = " · ";

/// "shep · board · repo" on the left, the shift and merges on the right.
pub fn title(f: &mut Frame, area: Rect, v: &ViewData<'_>, screen: &str) {
    let t = v.theme;
    let left = Line::from(vec![
        Span::styled("shep", t.accent()),
        Span::styled(format!("{SEP}{screen}{SEP}{}", v.repo), t.muted()),
    ]);
    let right = Line::from(Span::styled(
        format!("starts {}{SEP}{} merged today", v.starts, v.merged_today),
        t.muted(),
    ))
    .right_aligned();
    f.render_widget(Paragraph::new(left), area);
    f.render_widget(Paragraph::new(right), area);
}

/// Sheep in the fold (finished) and the meadow (waiting): the night's progress at a glance.
pub fn fold(v: &ViewData<'_>) -> Line<'static> {
    let t = v.theme;
    let board = v.model.board();
    let folded = board.ready.len() + v.merged_today;
    let waiting = board.queued.len();
    let herd = |n: usize, sheep: &str| vec![sheep; n].join(" ");
    let mut spans = vec![
        Span::styled("fold ", t.muted()),
        Span::styled("| ", t.accent()),
        Span::styled(herd(folded, SHEEP), t.text()),
        Span::styled(" |", t.accent()),
    ];
    if waiting > 0 {
        spans.push(Span::styled("  meadow ", t.muted()));
        spans.push(Span::styled(herd(waiting, SLEEPING_SHEEP), t.muted()));
    }
    Line::from(spans)
}

/// Key caps and what they do; a prompt or a notice takes the line over when there is one.
pub fn hints(f: &mut Frame, area: Rect, v: &ViewData<'_>, keys: &[(&str, &str)], tail: &str) {
    let t = v.theme;
    if let Some((label, text)) = v.model.prompt() {
        let line = Line::from(vec![
            Span::styled(format!("{label}: "), t.accent()),
            Span::styled(text, t.text()),
            Span::styled("▏", t.accent()),
            Span::styled("   enter sends · esc cancels", t.muted()),
        ]);
        f.render_widget(Paragraph::new(line), area);
        return;
    }
    let mut spans = Vec::new();
    for (key, what) in keys {
        spans.push(Span::styled(format!(" {key} "), t.key()));
        spans.push(Span::styled(format!(" {what}  "), t.text()));
    }
    // A notice takes the place of the quieter hints at the end.
    match v.model.notice() {
        Some(notice) => spans.push(Span::styled(notice.to_owned(), t.needs_you())),
        None => spans.push(Span::styled(tail.to_owned(), t.muted())),
    }
    f.render_widget(Paragraph::new(Line::from(spans)), area);
}

/// The style for a task's mark and words, by state.
pub fn state_style(t: Theme, state: TaskState) -> ratatui::style::Style {
    match state {
        TaskState::NeedsYou => t.needs_you(),
        TaskState::Ready | TaskState::Merged => t.ready(),
        TaskState::Working => t.working(),
        TaskState::Queued => t.muted(),
    }
}
