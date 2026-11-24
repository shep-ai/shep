//! The monday.com GraphQL API: one endpoint, the token in `Authorization`, a pinned version,
//! and errors that come back with status 200. Every operation is named, so a log (or a test)
//! can tell them apart.

use serde_json::{json, Value};
use shep_app::ports::SourceError;

use crate::sources::http::Http;

const PATH: &str = "v2";
const AUTHORIZATION: &str = "Authorization";
const VERSION_HEADER: &str = "API-Version";
const VERSION: &str = "2026-10";

/// What every item read brings: enough to hand it over and to read the person's notes.
const TASK: &str = "fragment Task on Item { id name url created_at \
     updates(limit: 25) { text_body created_at creator { name } } }";
pub(super) const ACCOUNT: &str = "query ShepAccount($board: [ID!]) { \
     me { name account { name slug } } boards(ids: $board) { name } }";
pub(super) const BOARD: &str = "query ShepBoard($board: [ID!]) { me { account { slug } } \
     boards(ids: $board) { id name columns { id title type settings } } }";
pub(super) const TONIGHT: &str = "query ShepTonight($board: [ID!], $query: ItemsQuery) { \
     boards(ids: $board) { items_page(limit: 100, query_params: $query) { cursor items { ...Task } } } }";
pub(super) const NEXT_PAGE: &str = "query ShepNextPage($cursor: String!) { \
     next_items_page(limit: 100, cursor: $cursor) { cursor items { ...Task } } }";
pub(super) const NEWEST: &str = "query ShepNewest($board: [ID!], $limit: Int!, $query: ItemsQuery) { \
     boards(ids: $board) { items_page(limit: $limit, query_params: $query) { cursor items { ...Task } } } }";
pub(super) const READ: &str = "query ShepRead($ids: [ID!]) { items(ids: $ids) { ...Task } }";
pub(super) const UPDATES: &str = "query ShepUpdates($ids: [ID!]) { items(ids: $ids) { \
     updates(limit: 100) { id text_body created_at creator { name } \
     replies { id text_body created_at creator { name } } } } }";
pub(super) const POST: &str = "mutation ShepPost($item: ID!, $body: String!) { \
     create_update(item_id: $item, body: $body) { id } }";
pub(super) const FILL: &str = "mutation ShepFill($board: ID!, $item: ID!, $columns: JSON!) { \
     change_multiple_column_values(board_id: $board, item_id: $item, column_values: $columns) { id } }";

/// Operations that read items need the `Task` fragment beside them.
pub(super) fn with_task(operation: &str) -> String {
    format!("{operation} {TASK}")
}

pub(super) struct Api {
    http: Http,
    token: String,
}

impl Api {
    pub(super) fn new(http: Http, token: &str) -> Self {
        Self {
            http,
            token: token.to_owned(),
        }
    }

    /// Runs one operation and returns its `data`; GraphQL errors fail the call with their text.
    pub(super) fn run(&self, query: &str, variables: &Value) -> Result<Value, SourceError> {
        let headers = [
            (AUTHORIZATION, self.token.as_str()),
            (VERSION_HEADER, VERSION),
        ];
        let body = json!({ "query": query, "variables": variables });
        let answer = self.http.post(PATH, &headers, &body)?;
        let mut problems: Vec<&str> = answer["errors"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|e| e["message"].as_str())
            .collect();
        problems.extend(answer["error_message"].as_str());
        if problems.is_empty() {
            Ok(answer["data"].clone())
        } else {
            Err(SourceError(format!(
                "Monday refused the request: {}",
                problems.join("; ")
            )))
        }
    }
}
