//! Reading Notion pages and schemas: which property is the Status, which options mean done, and
//! a page as a hand-over.

use serde_json::{json, Map, Value};
use shep_app::ports::{HandOver, SourceError};
use shep_domain::TaskSourceRef;

use super::notion_id;
use super::write::{self, find, SELECT, STATUS, TITLE};
use crate::sources::tracker::same_name;

/// A page's link as Shep keeps it: stable whatever form Notion's own links take.
const CANONICAL_PAGE: &str = "https://www.notion.so/";
const STATUS_NAMES: [&str; 1] = ["Status"];
/// The status group whose options mean the work is finished.
const COMPLETE_GROUP: &str = "Complete";

/// The page id behind a task's Notion link.
pub(super) fn page_id(source: &TaskSourceRef) -> Result<String, SourceError> {
    let TaskSourceRef::Notion { url } = source else {
        return Err(SourceError(format!("{source} is not a Notion page")));
    };
    notion_id(url).ok_or_else(|| SourceError(format!("{url} is not a Notion page link")))
}

/// The Status property (named Status, or the first status-type one) and its type.
pub(super) fn status_of(props: &Map<String, Value>) -> Option<(String, String)> {
    let name = find(props, &STATUS_NAMES, &[STATUS, SELECT]).or_else(|| {
        props
            .iter()
            .find(|(_, p)| p["type"] == json!(STATUS))
            .map(|(n, _)| n.as_str())
    })?;
    let kind = props[name]["type"].as_str().unwrap_or_default().to_owned();
    Some((name.to_owned(), kind))
}

/// Status options in the Complete group, so onboarding offers only open work.
pub(super) fn finished(prop: &Value) -> Vec<String> {
    let groups = prop[STATUS]["groups"].as_array().into_iter().flatten();
    let done_ids: Vec<&Value> = groups
        .filter(|g| same_name(g["name"].as_str().unwrap_or_default(), COMPLETE_GROUP))
        .flat_map(|g| g["option_ids"].as_array().into_iter().flatten())
        .collect();
    prop[STATUS]["options"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|o| done_ids.contains(&&o["id"]))
        .filter_map(|o| o["name"].as_str().map(str::to_owned))
        .collect()
}

pub(super) fn hand_over(page: &Value, body: String) -> HandOver {
    let id = page["id"].as_str().unwrap_or_default().replace('-', "");
    let title = page["properties"]
        .as_object()
        .and_then(|props| props.values().find(|p| p["type"] == json!(TITLE)))
        .map(|p| write::plain(&p[TITLE]))
        .unwrap_or_default();
    HandOver {
        source: TaskSourceRef::Notion {
            url: format!("{CANONICAL_PAGE}{id}"),
        },
        title,
        body,
        url: page["url"].as_str().unwrap_or_default().to_owned(),
    }
}
