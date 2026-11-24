//! Linear's GraphQL endpoint with a personal API key. Linear answers errors in an `errors` list,
//! sometimes with HTTP 200 and sometimes with 4xx; both become a [`SourceError`] that quotes
//! Linear's message and never the key.

use serde_json::{json, Value};
use shep_app::ports::SourceError;

use crate::sources::http::Http;

const GRAPHQL_PATH: &str = "/graphql";
/// A personal API key goes in this header as is, with no `Bearer` (OAuth tokens take one).
const AUTHORIZATION: &str = "Authorization";
const QUERY: &str = "query";
const VARIABLES: &str = "variables";
const DATA: &str = "data";
const ERRORS: &str = "errors";
const MESSAGE: &str = "message";
const SUCCESS: &str = "success";
/// How Linear starts the message for an id or identifier it does not know.
const ENTITY_NOT_FOUND: &str = "Entity not found";
const MESSAGE_SEPARATOR: &str = "; ";

pub(super) struct Graphql {
    http: Http,
    key: String,
}

impl Graphql {
    pub(super) fn new(http: Http, key: &str) -> Self {
        Self {
            http,
            key: key.to_owned(),
        }
    }

    /// The answer's `data`; `None` when Linear says what was asked for does not exist.
    pub(super) fn call(
        &self,
        document: &str,
        variables: &Value,
    ) -> Result<Option<Value>, SourceError> {
        let body = json!({ QUERY: document, VARIABLES: variables });
        let headers = [(AUTHORIZATION, self.key.as_str())];
        let answer = match self.http.post(GRAPHQL_PATH, &headers, &body) {
            Ok(answer) => answer,
            Err(e) if e.0.contains(ENTITY_NOT_FOUND) => return Ok(None),
            Err(e) => return Err(SourceError(format!("Linear: {e}"))),
        };
        let messages: Vec<&str> = answer[ERRORS]
            .as_array()
            .map(|errors| errors.iter().filter_map(|e| e[MESSAGE].as_str()).collect())
            .unwrap_or_default();
        if messages.is_empty() {
            return Ok(Some(answer[DATA].clone()));
        }
        if messages.iter().all(|m| m.starts_with(ENTITY_NOT_FOUND)) {
            return Ok(None);
        }
        Err(SourceError(format!(
            "Linear: {}",
            messages.join(MESSAGE_SEPARATOR)
        )))
    }

    /// The answer's `data`, where something missing is an error too.
    pub(super) fn data(&self, document: &str, variables: &Value) -> Result<Value, SourceError> {
        self.call(document, variables)?
            .ok_or_else(|| SourceError("Linear could not find it".into()))
    }

    /// Runs a mutation and checks its `success`.
    pub(super) fn mutate(
        &self,
        document: &str,
        result: &str,
        variables: &Value,
    ) -> Result<(), SourceError> {
        let data = self.data(document, variables)?;
        if data[result][SUCCESS].as_bool() == Some(true) {
            Ok(())
        } else {
            Err(SourceError(format!("Linear did not accept {result}")))
        }
    }
}
