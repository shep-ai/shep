//! An agent's terminal screen (vt100) as styled lines for the session pane.

use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

fn colour(c: vt100::Color) -> Option<Color> {
    match c {
        vt100::Color::Default => None,
        vt100::Color::Idx(i) => Some(Color::Indexed(i)),
        vt100::Color::Rgb(r, g, b) => Some(Color::Rgb(r, g, b)),
    }
}

/// Every row of the screen, keeping colours and bold/italic/underline when `color` is on.
pub fn lines(screen: &vt100::Screen, color: bool) -> Vec<Line<'static>> {
    let (rows, cols) = screen.size();
    (0..rows)
        .map(|row| {
            let spans: Vec<Span<'static>> = (0..cols)
                .filter_map(|col| screen.cell(row, col))
                .filter(|cell| !cell.is_wide_continuation())
                .map(|cell| {
                    let text = if cell.has_contents() {
                        cell.contents().to_owned()
                    } else {
                        " ".into()
                    };
                    let mut style = Style::new();
                    if color {
                        if let Some(fg) = colour(cell.fgcolor()) {
                            style = style.fg(fg);
                        }
                        if let Some(bg) = colour(cell.bgcolor()) {
                            style = style.bg(bg);
                        }
                        if cell.bold() {
                            style = style.add_modifier(Modifier::BOLD);
                        }
                        if cell.italic() {
                            style = style.add_modifier(Modifier::ITALIC);
                        }
                        if cell.underline() {
                            style = style.add_modifier(Modifier::UNDERLINED);
                        }
                    }
                    Span::styled(text, style)
                })
                .collect();
            Line::from(spans)
        })
        .collect()
}
