//! The Notion adapter: the database's data sources are queried for Status Tonight; Shep answers
//! in the page's properties, its comments and blocks appended to it.

use serde_json::{json, Map, Value};
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};

use super::pages::{finished, hand_over, page_id, status_of};
use super::write::{self, find, shep_value, shep_words, RICH_TEXT, SELECT, STATUS, TITLE, URL};
use crate::sources::http::{Http, Verb};
use crate::sources::tracker::{self, encode, is_not_found, parse_time, Said, TONIGHT};

const AUTHORIZATION: &str = "Authorization";
const BEARER: &str = "Bearer";
const VERSION_HEADER: &str = "Notion-Version";
/// Databases hold data sources (2025-09-03); `in_trash` replaces `archived` (2026-03-11).
const VERSION: &str = "2026-03-11";
const ME: &str = "/v1/users/me";
const DATABASES: &str = "/v1/databases";
const DATA_SOURCES: &str = "/v1/data_sources";
const PAGES: &str = "/v1/pages";
const BLOCKS: &str = "/v1/blocks";
const COMMENTS: &str = "/v1/comments";
const MARKDOWN: &str = "markdown?markdown_version=v2";
const SHEP_NAMES: [&str; 1] = ["Shep"];
const PR_NAMES: [&str; 4] = ["PR", "Pull request", "PR link", "Pull request link"];
const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 10;

/// One database, read and written through an internal integration's secret.
pub struct Notion {
    http: Http,
    auth: String,
    database: String,
}

impl Notion {
    pub(super) fn new(http: Http, token: &str, database: &str) -> Self {
        Self {
            http,
            auth: format!("{BEARER} {token}"),
            database: database.to_owned(),
        }
    }

    fn call(&self, verb: Verb, path: &str, body: Option<&Value>) -> Result<Value, SourceError> {
        let headers = [
            (AUTHORIZATION, self.auth.as_str()),
            (VERSION_HEADER, VERSION),
        ];
        self.http.json(verb, path, &headers, body)
    }

    fn get(&self, path: &str) -> Result<Value, SourceError> {
        self.call(Verb::Get, path, None)
    }

    /// "Acme · Tasks": the workspace and the database, proving both are reachable.
    pub(super) fn describe(&self) -> Result<String, SourceError> {
        let me = self.get(ME)?;
        let database = self.get(&format!("{DATABASES}/{}", self.database))?;
        let workspace = me["bot"]["workspace_name"].as_str().unwrap_or_default();
        Ok(format!("{workspace} · {}", write::plain(&database[TITLE])))
    }

    fn data_sources(&self) -> Result<Vec<String>, SourceError> {
        let database = self.get(&format!("{DATABASES}/{}", self.database))?;
        Ok(database["data_sources"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|s| s["id"].as_str().map(str::to_owned))
            .collect())
    }

    fn schema(&self, data_source: &str) -> Result<Map<String, Value>, SourceError> {
        let source = self.get(&format!("{DATA_SOURCES}/{data_source}"))?;
        Ok(source["properties"]
            .as_object()
            .cloned()
            .unwrap_or_default())
    }

    /// Pages matching `body` (a filter and sorts), up to `limit`, following pages.
    fn query(
        &self,
        data_source: &str,
        mut body: Value,
        limit: usize,
    ) -> Result<Vec<Value>, SourceError> {
        let path = format!("{DATA_SOURCES}/{data_source}/query");
        let mut found = Vec::new();
        for _ in 0..MAX_PAGES {
            body["page_size"] = json!(limit.saturating_sub(found.len()).min(PAGE_SIZE));
            let page = self.call(Verb::Post, &path, Some(&body))?;
            found.extend(page["results"].as_array().into_iter().flatten().cloned());
            match page["next_cursor"].as_str() {
                Some(cursor) if page["has_more"] == json!(true) && found.len() < limit => {
                    body["start_cursor"] = json!(cursor);
                }
                _ => break,
            }
        }
        found.truncate(limit);
        Ok(found)
    }

    fn markdown(&self, id: &str) -> Result<String, SourceError> {
        let page = self.get(&format!("{PAGES}/{id}/{MARKDOWN}"))?;
        Ok(page["markdown"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_owned())
    }

    /// The options of a select property, from the schema of the page's data source.
    fn select_options(&self, page: &Value, property: &str) -> Result<Value, SourceError> {
        let Some(data_source) = page["parent"]["data_source_id"].as_str() else {
            return Ok(Value::Null);
        };
        let schema = self.schema(data_source)?;
        Ok(schema
            .get(property)
            .map_or(Value::Null, |p| p[SELECT]["options"].clone()))
    }

    fn comment(&self, id: &str, update: &Update) -> Result<(), SourceError> {
        let rich_text = write::rich_text(&tracker::message(update));
        let body = json!({ "parent": { "page_id": id }, RICH_TEXT: rich_text });
        self.call(Verb::Post, COMMENTS, Some(&body)).map(drop)
    }
}

impl TaskSource for Notion {
    fn kind(&self) -> SourceKind {
        SourceKind::Notion
    }

    fn connection(&self) -> Result<String, SourceError> {
        self.describe()
    }

    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let mut found = Vec::new();
        let mut has_status = false;
        for data_source in self.data_sources()? {
            let Some((name, kind)) = status_of(&self.schema(&data_source)?) else {
                continue;
            };
            has_status = true;
            let filter = json!({ "property": name, kind: { "equals": TONIGHT } });
            let pages = self.query(
                &data_source,
                json!({ "filter": filter }),
                PAGE_SIZE * MAX_PAGES,
            )?;
            found.extend(pages.iter().map(|p| hand_over(p, String::new())));
        }
        if !has_status {
            return Err(SourceError(
                "the Notion database has no Status property; add one with a Tonight option".into(),
            ));
        }
        Ok(found)
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let id = page_id(source)?;
        let page = match self.get(&format!("{PAGES}/{id}")) {
            Ok(page) => page,
            Err(e) if is_not_found(&e) => return Ok(None),
            Err(e) => return Err(e),
        };
        if page["in_trash"] == json!(true) {
            return Ok(None);
        }
        let read = hand_over(&page, self.markdown(&id)?);
        Ok(Some(HandOver {
            source: source.clone(),
            ..read
        }))
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let id = page_id(source)?;
        let page = self.get(&format!("{PAGES}/{id}"))?;
        let props = page["properties"].as_object().cloned().unwrap_or_default();
        let mut changes = Map::new();
        if let Some(name) = find(&props, &SHEP_NAMES, &[RICH_TEXT, SELECT]) {
            let kind = props[name]["type"].as_str().unwrap_or_default();
            let options = if kind == SELECT {
                self.select_options(&page, name)?
            } else {
                Value::Null
            };
            if let Some(value) = shep_value(kind, &shep_words(update), &options) {
                changes.insert(name.to_owned(), value);
            }
        }
        let shep_property_said_it = !changes.is_empty();
        if let Update::Ready { pr, .. } = update {
            if let Some(name) = find(&props, &PR_NAMES, &[URL]) {
                changes.insert(name.to_owned(), json!({ URL: pr.url }));
            }
        }
        // Properties first, the words last: a retry after a failure says it once.
        if !changes.is_empty() {
            let body = json!({ "properties": changes });
            self.call(Verb::Patch, &format!("{PAGES}/{id}"), Some(&body))?;
        }
        match update {
            Update::Ready { .. } => {
                let children = write::paragraphs(&tracker::message(update));
                let body = json!({ "children": children });
                self.call(Verb::Patch, &format!("{BLOCKS}/{id}/children"), Some(&body))
                    .map(drop)
            }
            Update::Asked { .. } => self.comment(&id, update),
            _ if !shep_property_said_it => self.comment(&id, update),
            _ => Ok(()),
        }
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let id = page_id(source)?;
        let mut said = Vec::new();
        let mut cursor: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut path = format!("{COMMENTS}?block_id={id}&page_size={PAGE_SIZE}");
            if let Some(after) = &cursor {
                path.push_str("&start_cursor=");
                path.push_str(&encode(after));
            }
            let page = self.get(&path)?;
            for c in page["results"].as_array().into_iter().flatten() {
                let author = c["display_name"]["resolved_name"]
                    .as_str()
                    .or_else(|| c["created_by"]["id"].as_str())
                    .unwrap_or_default();
                said.push(Said {
                    at: parse_time(c["created_time"].as_str().unwrap_or_default())?,
                    author: author.to_owned(),
                    text: write::plain(&c[RICH_TEXT]),
                });
            }
            cursor = page["next_cursor"].as_str().map(str::to_owned);
            if cursor.is_none() || page["has_more"] != json!(true) {
                break;
            }
        }
        Ok(tracker::replies_since(said, since))
    }

    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let mut found = Vec::new();
        for data_source in self.data_sources()? {
            if found.len() >= limit {
                break;
            }
            let props = self.schema(&data_source)?;
            let mut body =
                json!({ "sorts": [{ "timestamp": "created_time", "direction": "descending" }] });
            if let Some((name, kind)) = status_of(&props).filter(|(_, k)| k == STATUS) {
                let open: Vec<Value> = finished(&props[&name])
                    .into_iter()
                    .map(|done| json!({ "property": name, kind.as_str(): { "does_not_equal": done } }))
                    .collect();
                if !open.is_empty() {
                    body["filter"] = json!({ "and": open });
                }
            }
            for page in self.query(&data_source, body, limit - found.len())? {
                let id = page["id"].as_str().unwrap_or_default().to_owned();
                found.push(hand_over(&page, self.markdown(&id)?));
            }
        }
        Ok(found)
    }
}
