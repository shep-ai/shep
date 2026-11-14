//! Monday (monday.com) as a task source. Work is handed over by setting an item's status to
//! Tonight on one board; Shep answers with updates on the item, and when the work is ready it
//! fills a PR link column and moves the status to In review, when the board has them.

mod board;
mod graphql;
mod source;

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::http::Http;
use super::tracker::{field, required, saved};
use super::{api_base, Connected, Secrets, SourceFactory};

pub use source::Monday;

const KIND: SourceKind = SourceKind::Monday;
const PUBLIC_API: &str = "https://api.monday.com";
const TOKEN: &str = "token";
const BOARD: &str = "board";
const BOARDS_SEGMENT: &str = "boards";
const TOKEN_HINT: &str = "monday.com → your avatar → Developers → API token → Show";
const BOARD_HINT: &str = "Open the board and copy its link, or the number after /boards/";

/// Builds Monday adapters. `at` points them at a local server (tests); otherwise the public API,
/// or `SHEP_SOURCE_API_MONDAY`.
#[derive(Default)]
pub struct MondayFactory {
    base: Option<String>,
}

impl MondayFactory {
    pub fn at(base: &str) -> Self {
        Self {
            base: Some(base.to_owned()),
        }
    }

    fn monday(&self, token: &str, board: &str) -> Monday {
        let base = self
            .base
            .clone()
            .unwrap_or_else(|| api_base(KIND, PUBLIC_API));
        Monday::new(Http::new(&base), token, board)
    }
}

impl SourceFactory for MondayFactory {
    fn kind(&self) -> SourceKind {
        KIND
    }

    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![
                field(TOKEN, "API token", true, TOKEN_HINT, false),
                field(BOARD, "Board", false, BOARD_HINT, false),
            ],
            hand_over: vec!["Set the item's status to Tonight".into()],
        }
    }

    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let token = required(values, KIND, TOKEN, "an API token")?;
        let input = required(values, KIND, BOARD, "the board")?;
        let board = board_id(&input)
            .ok_or_else(|| SourceError(format!("{input:?} is not a Monday board link or id")))?;
        let account = self.monday(&token, &board).describe()?;
        Ok(Connected {
            setting: SourceSetting::new(KIND, &account).with_option(BOARD, &board),
            secrets: BTreeMap::from([(TOKEN.to_owned(), token)]),
        })
    }

    fn build(
        &self,
        setting: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let board = saved(&setting.options, KIND, BOARD)?;
        Ok(Arc::new(self.monday(&secrets.get(TOKEN)?, &board)))
    }
}

fn digits(s: &str) -> Option<String> {
    (!s.is_empty() && s.chars().all(|c| c.is_ascii_digit())).then(|| s.to_owned())
}

/// The number after `segment` in a Monday link (`…/boards/123/pulses/456`).
pub(crate) fn id_after(url: &str, segment: &str) -> Option<String> {
    let path = url.split(['?', '#']).next().unwrap_or_default();
    let mut parts = path.split('/');
    parts.find(|p| *p == segment)?;
    digits(parts.next()?)
}

/// A board id, or the one in a board link.
fn board_id(input: &str) -> Option<String> {
    digits(input).or_else(|| id_after(input, BOARDS_SEGMENT))
}

#[cfg(test)]
mod tests {
    use super::{board_id, id_after};

    #[test]
    fn ids_come_out_of_links() {
        let url = "https://acme.monday.com/boards/123/pulses/456?x=1";
        assert_eq!(id_after(url, "pulses").as_deref(), Some("456"));
        assert_eq!(board_id(url).as_deref(), Some("123"));
        assert_eq!(board_id("123").as_deref(), Some("123"));
        assert_eq!(board_id("https://acme.monday.com/workspaces/9"), None);
    }
}
