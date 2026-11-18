//! The Monday adapter: items whose status is Tonight are handed over; Shep answers in updates
//! (HTML), and a person's answers are replies to them or later updates.

use serde_json::{json, Value};
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};

use super::board::Board;
use super::graphql::{self, with_task, Api};
use super::id_after;
use crate::sources::http::Http;
use crate::sources::tracker::{self, is_shep, parse_time, Line, Piece, Said, TONIGHT};

const ITEM_SEGMENT: &str = "pulses";
const IN_REVIEW: &str = "In review";
const ANY_OF: &str = "any_of";
const NOT_ANY_OF: &str = "not_any_of";
const CREATED: &str = "__creation_log__";
const NEWEST_FIRST: &str = "desc";
const MAX_PAGES: usize = 10;
const NOTES_SEPARATOR: &str = "\n\n";

/// One board, read and written as the person whose API token it is.
pub struct Monday {
    api: Api,
    board: String,
}

/// An update's HTML: a paragraph per line, links as links, everything else escaped.
fn html(lines: &[Line]) -> String {
    let mut out = String::new();
    for line in lines {
        out.push_str("<p>");
        for piece in line {
            match piece {
                Piece::Text(text) => out.push_str(&escape(text)),
                Piece::Link { text, url } => {
                    out.push_str("<a href=\"");
                    out.push_str(&escape(url));
                    out.push_str("\">");
                    out.push_str(&escape(text));
                    out.push_str("</a>");
                }
            }
        }
        out.push_str("</p>");
    }
    out
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn item_id(source: &TaskSourceRef) -> Result<String, SourceError> {
    let TaskSourceRef::Monday { url } = source else {
        return Err(SourceError(format!("{source} is not a Monday item")));
    };
    id_after(url, ITEM_SEGMENT)
        .ok_or_else(|| SourceError(format!("{url} is not a Monday item link")))
}

/// A person's updates on the item, oldest first: the closest thing Monday has to a description.
fn notes(item: &Value) -> String {
    let mut notes: Vec<&str> = item["updates"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|u| u["text_body"].as_str())
        .filter(|t| !is_shep(t) && !t.trim().is_empty())
        .collect();
    notes.reverse();
    notes.join(NOTES_SEPARATOR)
}

fn said(update: &Value) -> Result<Said, SourceError> {
    Ok(Said {
        at: parse_time(update["created_at"].as_str().unwrap_or_default())?,
        author: update["creator"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        text: update["text_body"].as_str().unwrap_or_default().to_owned(),
    })
}

impl Monday {
    pub(super) fn new(http: Http, token: &str, board: &str) -> Self {
        Self {
            api: Api::new(http, token),
            board: board.to_owned(),
        }
    }

    /// "Acme · Sprint tasks": the account and the board, proving the token reaches both.
    pub(super) fn describe(&self) -> Result<String, SourceError> {
        let data = self
            .api
            .run(graphql::ACCOUNT, &json!({ "board": [self.board] }))?;
        let Some(board) = data["boards"].as_array().and_then(|b| b.first()) else {
            return Err(SourceError(format!(
                "Monday board {} is gone or not shared with this token",
                self.board
            )));
        };
        let account = data["me"]["account"]["name"].as_str().unwrap_or_default();
        Ok(format!(
            "{account} · {}",
            board["name"].as_str().unwrap_or_default()
        ))
    }

    fn board(&self) -> Result<Board, SourceError> {
        let data = self
            .api
            .run(graphql::BOARD, &json!({ "board": [self.board] }))?;
        Board::read(&data, &self.board)
    }

    fn hand_over(&self, board: &Board, item: &Value) -> HandOver {
        let id = item["id"].as_str().unwrap_or_default();
        HandOver {
            source: TaskSourceRef::Monday {
                url: format!(
                    "https://{}.monday.com/boards/{}/{ITEM_SEGMENT}/{id}",
                    board.slug, self.board
                ),
            },
            title: item["name"].as_str().unwrap_or_default().to_owned(),
            body: notes(item),
            url: item["url"].as_str().unwrap_or_default().to_owned(),
        }
    }

    /// Items matching `query`, following the cursor, up to `limit`.
    fn items(
        &self,
        operation: &str,
        variables: &Value,
        limit: usize,
    ) -> Result<Vec<Value>, SourceError> {
        let data = self.api.run(&with_task(operation), variables)?;
        let mut page = data["boards"][0]["items_page"].clone();
        let mut found = Vec::new();
        for _ in 0..MAX_PAGES {
            found.extend(page["items"].as_array().into_iter().flatten().cloned());
            let Some(cursor) = page["cursor"].as_str().filter(|_| found.len() < limit) else {
                break;
            };
            let next = self
                .api
                .run(&with_task(graphql::NEXT_PAGE), &json!({ "cursor": cursor }))?;
            page = next["next_items_page"].clone();
        }
        found.truncate(limit);
        Ok(found)
    }

    /// Fills the PR link column and sets In review, for what the board has.
    fn fill(
        &self,
        board: &Board,
        item: &str,
        pr: &shep_domain::PullRequest,
    ) -> Result<(), SourceError> {
        let mut columns = serde_json::Map::new();
        if let Some(link) = board.pr_column() {
            let text = format!("pull request #{}", pr.number);
            columns.insert(link, json!({ "url": pr.url, "text": text }));
        }
        if let Some(label) = board.label(IN_REVIEW) {
            columns.insert(label.column, json!({ "label": label.text }));
        }
        if columns.is_empty() {
            return Ok(());
        }
        let variables = json!({
            "board": self.board,
            "item": item,
            "columns": Value::Object(columns).to_string()
        });
        self.api.run(graphql::FILL, &variables).map(drop)
    }
}

impl TaskSource for Monday {
    fn kind(&self) -> SourceKind {
        SourceKind::Monday
    }

    fn connection(&self) -> Result<String, SourceError> {
        self.describe()
    }

    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let board = self.board()?;
        let tonight = board.label(TONIGHT).ok_or_else(|| {
            SourceError(format!(
                "Monday board {} has no status label {TONIGHT}; add one to hand work over",
                self.board
            ))
        })?;
        let rule = json!({ "column_id": tonight.column, "compare_value": [tonight.id], "operator": ANY_OF });
        let variables = json!({ "board": [self.board], "query": { "rules": [rule] } });
        let items = self.items(graphql::TONIGHT, &variables, usize::MAX)?;
        Ok(items.iter().map(|i| self.hand_over(&board, i)).collect())
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let id = item_id(source)?;
        let data = self
            .api
            .run(&with_task(graphql::READ), &json!({ "ids": [id] }))?;
        let Some(item) = data["items"].as_array().and_then(|i| i.first()) else {
            return Ok(None);
        };
        Ok(Some(HandOver {
            source: source.clone(),
            title: item["name"].as_str().unwrap_or_default().to_owned(),
            body: notes(item),
            url: item["url"].as_str().unwrap_or_default().to_owned(),
        }))
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let id = item_id(source)?;
        // Columns first and the update last: a retry after a failure says it once.
        if let Update::Ready { pr, .. } = update {
            self.fill(&self.board()?, &id, pr)?;
        }
        let body = html(&tracker::message(update));
        self.api
            .run(graphql::POST, &json!({ "item": id, "body": body }))
            .map(drop)
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let id = item_id(source)?;
        let data = self.api.run(graphql::UPDATES, &json!({ "ids": [id] }))?;
        let mut all = Vec::new();
        for update in data["items"][0]["updates"].as_array().into_iter().flatten() {
            all.push(said(update)?);
            for reply in update["replies"].as_array().into_iter().flatten() {
                all.push(said(reply)?);
            }
        }
        Ok(tracker::replies_since(all, since))
    }

    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        if limit == 0 {
            return Ok(Vec::new());
        }
        let board = self.board()?;
        let mut query =
            json!({ "order_by": [{ "column_id": CREATED, "direction": NEWEST_FIRST }] });
        if let Some(column) = board.status_column() {
            let done = board.done_in(&column);
            if !done.is_empty() {
                query["rules"] =
                    json!([{ "column_id": column, "compare_value": done, "operator": NOT_ANY_OF }]);
            }
        }
        let variables = json!({ "board": [self.board], "limit": limit, "query": query });
        let items = self.items(graphql::NEWEST, &variables, limit)?;
        Ok(items.iter().map(|i| self.hand_over(&board, i)).collect())
    }
}
