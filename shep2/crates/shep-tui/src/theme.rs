//! The palette: night to dawn, lantern amber, and the three state colours. Eight colours, all
//! dropped at once when colour is off (`NO_COLOR`, CI, piped output).

use ratatui::style::{Color, Modifier, Style};

pub const NIGHT: Color = Color::Rgb(11, 13, 34);
pub const BORDER: Color = Color::Rgb(42, 47, 85);
pub const TEXT: Color = Color::Rgb(230, 232, 242);
pub const MUTED: Color = Color::Rgb(138, 143, 176);
pub const AMBER: Color = Color::Rgb(242, 179, 91);
pub const DUSK: Color = Color::Rgb(143, 162, 247);
pub const GREEN: Color = Color::Rgb(143, 211, 160);
pub const CORAL: Color = Color::Rgb(242, 124, 107);
/// The horizon at full dawn.
pub const DAWN: Color = Color::Rgb(201, 138, 142);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Theme {
    pub color: bool,
}

impl Theme {
    pub fn new(color: bool) -> Self {
        Self { color }
    }

    fn fg(self, c: Color) -> Style {
        if self.color {
            Style::new().fg(c)
        } else {
            Style::new()
        }
    }

    pub fn base(self) -> Style {
        if self.color {
            Style::new().fg(TEXT).bg(NIGHT)
        } else {
            Style::new()
        }
    }
    pub fn text(self) -> Style {
        self.fg(TEXT)
    }
    pub fn muted(self) -> Style {
        self.fg(MUTED)
    }
    pub fn border(self) -> Style {
        self.fg(BORDER)
    }
    pub fn accent(self) -> Style {
        self.fg(AMBER)
    }
    pub fn working(self) -> Style {
        self.fg(DUSK)
    }
    pub fn ready(self) -> Style {
        self.fg(GREEN)
    }
    pub fn needs_you(self) -> Style {
        self.fg(CORAL)
    }
    pub fn label(self) -> Style {
        self.muted().add_modifier(Modifier::BOLD)
    }
    /// The selected row: amber bar with night text; reversed without colour.
    pub fn selected(self) -> Style {
        if self.color {
            Style::new().fg(NIGHT).bg(AMBER)
        } else {
            Style::new().add_modifier(Modifier::REVERSED)
        }
    }
    /// A key cap in the hint row.
    pub fn key(self) -> Style {
        if self.color {
            Style::new().fg(NIGHT).bg(MUTED)
        } else {
            Style::new().add_modifier(Modifier::BOLD)
        }
    }
    pub fn added(self) -> Style {
        self.fg(GREEN)
    }
    pub fn removed(self) -> Style {
        self.fg(CORAL)
    }
}

/// A colour part way from `from` to `to` (`t` in 0..=1).
pub fn mix(from: Color, to: Color, t: f32) -> Color {
    let (Color::Rgb(r1, g1, b1), Color::Rgb(r2, g2, b2)) = (from, to) else {
        return to;
    };
    let t = t.clamp(0.0, 1.0);
    let lerp = |a: u8, b: u8| {
        let v = f32::from(a) + (f32::from(b) - f32::from(a)) * t;
        // In range by construction: a and b are bytes and t is clamped.
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let v = v.round() as u8;
        v
    };
    Color::Rgb(lerp(r1, r2), lerp(g1, g2), lerp(b1, b2))
}
