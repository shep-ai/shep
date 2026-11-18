//! The two-second splash on the first run of the day: stars come out, the wordmark decrypts
//! from dusk blue to lantern amber, the lantern catches, then it settles on a still frame.

use ratatui::layout::Rect;
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::sky::{self, Night};
use crate::theme::{self, Theme};

pub const SECONDS: f32 = 2.0;
pub const FPS: u64 = 14;
/// Below this size there is no room for the scene: skip the splash.
pub const MIN_WIDTH: u16 = 64;
pub const MIN_HEIGHT: u16 = 20;
pub const WORDMARK: [&str; 6] = [
    "      _",
    " ___| |__   ___ _ __",
    "/ __| '_ \\ / _ \\ '_ \\",
    "\\__ \\ | | |  __/ |_) |",
    "|___/_| |_|\\___| .__/",
    "               |_|",
];
const NOISE: [char; 8] = ['@', '#', '%', '*', '+', '=', '-', ':'];
const WORDMARK_LEFT: u16 = 6;
const WORDMARK_TOP: u16 = 3;

/// `t` runs from 0 (dark) to 1 (settled); `info` is the line under the wordmark.
pub fn render(f: &mut Frame, area: Rect, t: f32, frame: u64, info: &str, th: Theme) {
    let t = t.clamp(0.0, 1.0);
    let night = Night {
        progress: 0.0,
        folded: 0,
        walking: 0,
        sleeping: 0,
        lantern: ((t - 0.5) * 2.0).clamp(0.0, 1.0),
    };
    let mut scene = sky::scene(area.width, area.height, night, Some(frame), th);
    // Stars come out from the top as t grows.
    let lit_rows = (t * 2.0 * f32::from(area.height)).round();
    for (y, line) in scene.iter_mut().enumerate() {
        if f32::from(y16(y)) > lit_rows && t < 1.0 {
            for span in &mut line.spans {
                if span.content != " " && span.content != "_" {
                    span.content = " ".into();
                }
            }
        }
    }
    f.render_widget(Paragraph::new(scene), area);
    let colour = theme::mix(theme::DUSK, theme::AMBER, t);
    for (row, text) in WORDMARK.iter().enumerate() {
        let line: String = text
            .chars()
            .enumerate()
            .map(|(i, ch)| decrypted(ch, i + row * 31, t, frame))
            .collect();
        let style = if th.color {
            Style::new().fg(colour)
        } else {
            Style::new()
        };
        let y = area.y + WORDMARK_TOP + y16(row);
        if y < area.bottom() {
            let at = Rect::new(
                area.x + WORDMARK_LEFT,
                y,
                area.width.saturating_sub(WORDMARK_LEFT),
                1,
            );
            f.render_widget(Paragraph::new(Line::from(Span::styled(line, style))), at);
        }
    }
    let text_top = area.y + WORDMARK_TOP + y16(WORDMARK.len()) + 1;
    if t > 0.7 && text_top + 2 < area.bottom() {
        let at = Rect::new(
            area.x + WORDMARK_LEFT,
            text_top,
            area.width.saturating_sub(WORDMARK_LEFT),
            1,
        );
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(info.to_owned(), th.muted()))),
            at,
        );
    }
    if t >= 1.0 && text_top + 3 < area.bottom() {
        let at = Rect::new(
            area.x + WORDMARK_LEFT,
            text_top + 2,
            area.width.saturating_sub(WORDMARK_LEFT),
            1,
        );
        f.render_widget(
            Paragraph::new(Line::from(Span::styled("press any key", th.accent()))),
            at,
        );
    }
}

fn y16(n: usize) -> u16 {
    u16::try_from(n).unwrap_or(u16::MAX)
}

/// A character of the wordmark: noise until its moment comes, then itself.
fn decrypted(ch: char, i: usize, t: f32, frame: u64) -> char {
    if ch == ' ' {
        return ch;
    }
    let settle = f32::from(u16::try_from(i * 37 % 100).unwrap_or(0)) / 100.0 * 0.8;
    if t >= settle + 0.15 {
        ch
    } else {
        let n = usize::try_from(frame).unwrap_or(0).wrapping_add(i * 7);
        NOISE[n % NOISE.len()]
    }
}
