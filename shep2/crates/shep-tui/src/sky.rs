//! The night scene shared by the splash and the watch screen. The sky is the progress bar: it
//! warms from night toward dawn as tasks finish, the sun rises behind the pen, and each finished
//! task is a sheep in the fold. Pure: the same size, progress and frame give the same picture.

use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use std::cmp::Ordering;

use crate::glyph::SHEEP;
use crate::theme::{self, Theme};

/// Rows of ground under the sky.
pub const GROUND_ROWS: u16 = 3;
const SHEPHERD: [&str; 4] = ["  O  ,_ ", " /|\\_/ |", "  |   [@]", " / \\     "];
const LANTERN: char = '@';
const SUN: [&str; 4] = ["  %%##**  ", " @%%##**++=", "%##**++==-", "##**++==--"];
const STARS: [char; 4] = ['.', '*', '+', '·'];
const GROUND: [char; 5] = ['.', ',', '\'', '`', ' '];
/// One cell in this many holds a star at night.
const STAR_SPACING: u64 = 23;
/// One star in this many is between twinkles on a given frame.
const TWINKLE: u64 = 9;
const PEN_WIDTH: usize = 18;
const WALK_SPACING: usize = 7;
const NIGHT_TOP: Color = Color::Rgb(9, 10, 26);
const NIGHT_HORIZON: Color = Color::Rgb(26, 29, 70);
const GROUND_NIGHT: Color = Color::Rgb(18, 16, 30);
const GROUND_DAWN: Color = Color::Rgb(43, 31, 44);
const GLOW: Color = Color::Rgb(90, 70, 60);

/// What the scene shows.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Night {
    /// Finished share of the night, 0..=1.
    pub progress: f32,
    /// Sheep in the pen (finished tasks).
    pub folded: usize,
    /// Sheep walking (working tasks).
    pub walking: usize,
    /// Sheep asleep in the meadow (queued tasks).
    pub sleeping: usize,
    /// How bright the lantern is, 0..=1.
    pub lantern: f32,
}

#[derive(Clone, Copy)]
struct Cell {
    ch: char,
    fg: Color,
    bg: Color,
}

struct Canvas {
    width: usize,
    rows: Vec<Vec<Cell>>,
}

impl Canvas {
    fn put(&mut self, x: usize, y: usize, text: &str, fg: Color) {
        for (i, ch) in text.chars().enumerate() {
            if let Some(cell) = self.rows.get_mut(y).and_then(|r| r.get_mut(x + i)) {
                if ch != ' ' {
                    cell.ch = ch;
                    cell.fg = fg;
                }
            }
        }
    }
}

fn hash(x: usize, y: usize) -> u64 {
    let mut h = (x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (y as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
    h ^= h >> 29;
    h.wrapping_mul(0x1656_67B1_9E37_79F9)
}

fn index(h: u64, len: usize) -> usize {
    usize::try_from(h % len as u64).unwrap_or(0)
}

/// `rows` lines of `width` cells.
pub fn scene(
    width: u16,
    rows: u16,
    night: Night,
    frame: Option<u64>,
    t: Theme,
) -> Vec<Line<'static>> {
    let width = usize::from(width);
    let rows = usize::from(rows);
    let sky_rows = rows.saturating_sub(usize::from(GROUND_ROWS));
    let p = night.progress.clamp(0.0, 1.0);
    let horizon = theme::mix(NIGHT_HORIZON, theme::DAWN, p);
    let blank = Cell {
        ch: ' ',
        fg: theme::TEXT,
        bg: theme::NIGHT,
    };
    let mut c = Canvas {
        width,
        rows: vec![vec![blank; width]; rows],
    };
    for (y, row) in c.rows.iter_mut().enumerate() {
        let depth = if sky_rows == 0 {
            1.0
        } else {
            as_f32(y) / as_f32(sky_rows)
        };
        let bg = if y < sky_rows {
            theme::mix(NIGHT_TOP, horizon, depth * depth)
        } else {
            theme::mix(GROUND_NIGHT, GROUND_DAWN, p)
        };
        for (x, cell) in row.iter_mut().enumerate() {
            cell.bg = bg;
            let h = hash(x, y);
            match y.cmp(&sky_rows) {
                Ordering::Less => {
                    // Stars thin out as dawn comes.
                    let lit =
                        h.is_multiple_of(STAR_SPACING) && as_f32(index(h >> 8, 100)) >= p * 100.0;
                    let twinkle = frame
                        .is_some_and(|f| (h >> 16).wrapping_add(f / 3).is_multiple_of(TWINKLE));
                    if lit && !twinkle {
                        cell.ch = STARS[index(h >> 4, STARS.len())];
                        cell.fg = theme::mix(theme::TEXT, theme::MUTED, depth);
                    }
                }
                Ordering::Equal => {
                    cell.ch = '_';
                    cell.fg = theme::MUTED;
                }
                Ordering::Greater => {
                    cell.ch = GROUND[index(h, GROUND.len())];
                    cell.fg = theme::BORDER;
                }
            }
        }
    }
    draw_sun(&mut c, sky_rows, p);
    draw_pen(&mut c, sky_rows, night.folded);
    draw_shepherd(&mut c, sky_rows, night.lantern);
    draw_flock(&mut c, sky_rows, night, frame);
    c.rows
        .into_iter()
        .map(|row| {
            let spans: Vec<Span<'static>> = row
                .into_iter()
                .map(|cell| {
                    let style = if t.color {
                        Style::new().fg(cell.fg).bg(cell.bg)
                    } else {
                        Style::new()
                    };
                    Span::styled(cell.ch.to_string(), style)
                })
                .collect();
            Line::from(spans)
        })
        .collect()
}

fn as_f32(n: usize) -> f32 {
    u16::try_from(n).map_or(f32::from(u16::MAX), f32::from)
}

/// The sun climbs from below the horizon as the night's work finishes.
fn draw_sun(c: &mut Canvas, sky_rows: usize, p: f32) {
    let visible = (p * as_f32(SUN.len())).round();
    // Bounded by SUN.len() (4) after the round.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let visible = visible as usize;
    let x = c.width.saturating_sub(PEN_WIDTH + 2);
    for (i, line) in SUN.iter().take(visible).enumerate() {
        let y = (sky_rows + i).saturating_sub(visible);
        c.put(x + 3, y, line, theme::mix(theme::DAWN, theme::AMBER, p));
    }
}

fn draw_pen(c: &mut Canvas, sky_rows: usize, folded: usize) {
    let x = c.width.saturating_sub(PEN_WIDTH + 1);
    let top = sky_rows.saturating_sub(3);
    c.put(x, top, &"_".repeat(PEN_WIDTH), theme::AMBER);
    for y in top + 1..sky_rows {
        c.put(x, y, "|", theme::AMBER);
        c.put(x + PEN_WIDTH - 1, y, "|", theme::AMBER);
    }
    let fits = (PEN_WIDTH - 2) / (SHEEP.len() + 1);
    for i in 0..folded.min(fits * 2) {
        let (row, col) = (i / fits, i % fits);
        let y = sky_rows.saturating_sub(1 + row);
        c.put(x + 1 + col * (SHEEP.len() + 1), y, SHEEP, theme::TEXT);
    }
}

fn draw_shepherd(c: &mut Canvas, sky_rows: usize, lantern: f32) {
    let top = sky_rows.saturating_sub(SHEPHERD.len() - 1);
    for (i, line) in SHEPHERD.iter().enumerate() {
        c.put(2, top + i, line, theme::TEXT);
    }
    // The lantern, and its glow on the cells around it.
    let ly = top + 2;
    let lx = 2 + SHEPHERD[2].find(LANTERN).unwrap_or(0);
    let glow = theme::mix(theme::NIGHT, GLOW, lantern);
    for y in ly.saturating_sub(1)..=ly + 1 {
        for x in lx.saturating_sub(3)..=lx + 3 {
            if let Some(cell) = c.rows.get_mut(y).and_then(|r| r.get_mut(x)) {
                cell.bg = glow;
            }
        }
    }
    c.put(lx, ly, "@", theme::mix(theme::MUTED, theme::AMBER, lantern));
}

fn draw_flock(c: &mut Canvas, sky_rows: usize, night: Night, frame: Option<u64>) {
    let start = SHEPHERD[1].len() + 4;
    let end = c.width.saturating_sub(PEN_WIDTH + SHEEP.len() + 3);
    let span = end.saturating_sub(start).max(1);
    let y = sky_rows.saturating_sub(1);
    let step = frame.map_or(0, |f| usize::try_from(f / 2).unwrap_or(0));
    for i in 0..night.walking {
        let x = start + (i * WALK_SPACING * 3 + step) % span;
        c.put(x, y, SHEEP, theme::TEXT);
    }
    for i in 0..night.sleeping {
        let x = start + i * (SHEEP.len() + 3);
        if x + SHEEP.len() + 2 < end {
            c.put(x, y.saturating_sub(1), "@@o z", theme::MUTED);
        }
    }
}
