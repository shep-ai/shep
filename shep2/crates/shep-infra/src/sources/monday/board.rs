//! A board's layout as Shep needs it: the account's link slug, the status labels it hands over
//! and reviews with, and a PR link column, if the person made one.

use serde_json::Value;
use shep_app::ports::SourceError;

use crate::sources::tracker::same_name;

const STATUS: &str = "status";
const LINK: &str = "link";
/// Link columns Shep fills with the pull request.
const PR_COLUMNS: [&str; 4] = ["PR", "Pull request", "PR link", "Pull request link"];

/// A status label: the column it is in, its stable id (what filters and updates take) and text.
pub(super) struct Label {
    pub column: String,
    pub id: Value,
    pub text: String,
}

pub(super) struct Board {
    pub slug: String,
    columns: Vec<Value>,
}

impl Board {
    /// From a `ShepBoard` answer.
    pub(super) fn read(data: &Value, board: &str) -> Result<Self, SourceError> {
        let Some(found) = data["boards"].as_array().and_then(|b| b.first()) else {
            return Err(SourceError(format!(
                "Monday board {board} is gone or not shared with this token"
            )));
        };
        Ok(Self {
            slug: data["me"]["account"]["slug"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            columns: found["columns"].as_array().cloned().unwrap_or_default(),
        })
    }

    fn of_type<'a>(&'a self, kind: &'a str) -> impl Iterator<Item = &'a Value> + 'a {
        self.columns.iter().filter(move |c| c["type"] == kind)
    }

    /// Every active label of every status column.
    fn labels(&self) -> impl Iterator<Item = (Label, bool)> + '_ {
        self.of_type(STATUS).flat_map(|column| {
            let id = column["id"].as_str().unwrap_or_default().to_owned();
            settings(column)["labels"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|l| l["is_deactivated"] != Value::Bool(true))
                .map(move |l| {
                    let label = Label {
                        column: id.clone(),
                        id: l["id"].clone(),
                        text: l["label"].as_str().unwrap_or_default().to_owned(),
                    };
                    (label, l["is_done"] == Value::Bool(true))
                })
        })
    }

    /// The first status label named `name`.
    pub(super) fn label(&self, name: &str) -> Option<Label> {
        self.labels()
            .map(|(l, _)| l)
            .find(|l| same_name(&l.text, name))
    }

    /// The done labels of `column`, so onboarding offers only open work.
    pub(super) fn done_in(&self, column: &str) -> Vec<Value> {
        self.labels()
            .filter(|(l, done)| *done && l.column == column)
            .map(|(l, _)| l.id)
            .collect()
    }

    /// The first status column, for ordering and filtering.
    pub(super) fn status_column(&self) -> Option<String> {
        self.of_type(STATUS)
            .next()
            .and_then(|c| c["id"].as_str())
            .map(str::to_owned)
    }

    /// A link column named like PR.
    pub(super) fn pr_column(&self) -> Option<String> {
        PR_COLUMNS.iter().find_map(|wanted| {
            self.of_type(LINK)
                .find(|c| same_name(c["title"].as_str().unwrap_or_default(), wanted))
                .and_then(|c| c["id"].as_str())
                .map(str::to_owned)
        })
    }
}

/// A column's settings: typed JSON since 2025-10, a JSON string before.
fn settings(column: &Value) -> Value {
    match &column["settings"] {
        Value::String(raw) => serde_json::from_str(raw).unwrap_or(Value::Null),
        other => other.clone(),
    }
}
