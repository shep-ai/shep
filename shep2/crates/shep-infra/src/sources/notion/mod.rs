//! Notion as a task source, through an internal integration. Work is handed over by setting a
//! page's Status to Tonight in one database; Shep answers in a `Shep` property (or a comment when
//! the database has none), fills a `PR` link and appends the result to the page.

mod pages;
mod source;
mod write;

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::http::Http;
use super::tracker::{field, required, saved};
use super::{api_base, Connected, Secrets, SourceFactory};

pub use source::Notion;

const KIND: SourceKind = SourceKind::Notion;
const PUBLIC_API: &str = "https://api.notion.com";
const TOKEN: &str = "token";
const DATABASE: &str = "database";
const TOKEN_HINT: &str = "notion.so/profile/integrations → New integration (internal) → \
     copy its secret; then share the database with it (••• → Connections)";
const DATABASE_HINT: &str = "Open the database as a full page and copy its link, or paste its id";
/// Hex digits in a Notion id, and where its dashes go (8-4-4-4-12).
const ID_DIGITS: usize = 32;
const ID_GROUPS: [usize; 5] = [8, 4, 4, 4, 12];

/// Builds Notion adapters. `at` points them at a local server (tests); otherwise the public API,
/// or `SHEP_SOURCE_API_NOTION`.
#[derive(Default)]
pub struct NotionFactory {
    base: Option<String>,
}

impl NotionFactory {
    pub fn at(base: &str) -> Self {
        Self {
            base: Some(base.to_owned()),
        }
    }

    fn notion(&self, token: &str, database: &str) -> Notion {
        let base = self
            .base
            .clone()
            .unwrap_or_else(|| api_base(KIND, PUBLIC_API));
        Notion::new(Http::new(&base), token, database)
    }
}

impl SourceFactory for NotionFactory {
    fn kind(&self) -> SourceKind {
        KIND
    }

    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![
                field(TOKEN, "Integration secret", true, TOKEN_HINT, false),
                field(DATABASE, "Tasks database", false, DATABASE_HINT, false),
            ],
            hand_over: vec!["Set the page's Status to Tonight".into()],
        }
    }

    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let token = required(values, KIND, TOKEN, "an integration secret")?;
        let input = required(values, KIND, DATABASE, "the tasks database")?;
        let database = notion_id(&input)
            .ok_or_else(|| SourceError(format!("{input:?} is not a Notion database link or id")))?;
        let account = self.notion(&token, &database).describe()?;
        Ok(Connected {
            setting: SourceSetting::new(KIND, &account).with_option(DATABASE, &database),
            secrets: BTreeMap::from([(TOKEN.to_owned(), token)]),
        })
    }

    fn build(
        &self,
        setting: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let database = saved(&setting.options, KIND, DATABASE)?;
        Ok(Arc::new(self.notion(&secrets.get(TOKEN)?, &database)))
    }
}

/// The id in a Notion link or id, dashed: `…/Tasks-1f2e…4a5b?v=…` → `1f2e3d4c-5b6a-…`.
pub(crate) fn notion_id(text: &str) -> Option<String> {
    let path = text.split(['?', '#']).next().unwrap_or_default();
    let last = path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or_default();
    let digits: String = last.chars().filter(|c| *c != '-').collect();
    let tail = digits.get(digits.len().checked_sub(ID_DIGITS)?..)?;
    if !tail.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let tail = tail.to_ascii_lowercase();
    let mut groups = Vec::new();
    let mut at = 0;
    for len in ID_GROUPS {
        groups.push(&tail[at..at + len]);
        at += len;
    }
    Some(groups.join("-"))
}

#[cfg(test)]
mod tests {
    use super::notion_id;

    #[test]
    fn ids_come_out_of_links_old_and_new() {
        let id = Some("3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0".to_owned());
        assert_eq!(
            notion_id("https://www.notion.so/acme/Coupon-3b4c5d6e7f804912a3b4c5d6e7f8a9b0"),
            id
        );
        assert_eq!(
            notion_id("https://app.notion.com/p/3b4c5d6e7f804912a3b4c5d6e7f8a9b0?v=1"),
            id
        );
        assert_eq!(notion_id("3b4c5d6e-7f80-4912-a3b4-c5d6e7f8a9b0"), id);
        assert_eq!(notion_id("https://www.notion.so/acme/Coupon"), None);
    }
}
