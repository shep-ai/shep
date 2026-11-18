//! Everything a frame draws from: the model plus what the runner last read from the core.

use shep_app::TaskDetail;

use crate::model::Model;
use crate::theme::Theme;

pub struct ViewData<'a> {
    pub model: &'a Model,
    /// The selected task in detail.
    pub detail: Option<&'a TaskDetail>,
    /// Every task on the watch screen, in detail.
    pub details: &'a [TaskDetail],
    /// The repository's name.
    pub repo: &'a str,
    /// When tonight's shift starts, like "23:00", or how it starts.
    pub starts: &'a str,
    /// The local time, like "02:14".
    pub clock: &'a str,
    pub merged_today: usize,
    /// Animation frame; `None` when motion is off.
    pub frame: Option<u64>,
    pub theme: Theme,
    /// The attached agent's live screen, as lines of styled text.
    pub live: Option<&'a [ratatui::text::Line<'static>]>,
}
