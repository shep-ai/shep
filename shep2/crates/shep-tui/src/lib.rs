//! Shep 2's terminal UI. Everything it shows and does goes through [`shep_app::ShepApi`], so it
//! works the same in-process and against the daemon.

mod board;
pub mod brief;
mod chrome;
pub mod glyph;
mod keys;
pub mod model;
pub mod onboarding;
mod runner;
pub mod sky;
pub mod splash;
mod split;
pub mod theme;
pub mod view;
pub mod vt;
mod watch;

use ratatui::Frame;

pub use runner::{run, Options};
pub use view::ViewData;

/// Draws the current screen.
pub fn draw(f: &mut Frame, v: &ViewData<'_>) {
    let area = f.area();
    f.render_widget(ratatui::widgets::Block::new().style(v.theme.base()), area);
    match v.model.screen() {
        model::Screen::Board => board::render(f, area, v),
        model::Screen::Split => split::render(f, area, v),
        model::Screen::Watch => watch::render(f, area, v),
    }
}

pub use watch::graph;
