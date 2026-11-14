//! Linear as a task source, over its GraphQL API with a personal API key kept in the keychain.
//! Work is handed over with the label `shep` or by moving an issue to a state named Tonight
//! (optionally in one team). Shep answers with comments, moves the issue to Tonight and then
//! In Review where the team has those states, and attaches the pull request.

mod documents;
mod graphql;
mod source;

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::{json, Value};
use shep_app::ports::{FormField, SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::http::Http;
use super::{api_base, Connected, Secrets, SourceFactory};
use graphql::Graphql;
pub use source::LinearSource;

/// Linear's API host; the GraphQL endpoint is `/graphql` under it.
pub const PUBLIC_API: &str = "https://api.linear.app";
/// Form keys: the personal API key (secret) and the team key (an option).
pub const TOKEN_FIELD: &str = "token";
pub const TEAM_OPTION: &str = "team";
/// The label that hands an issue to Shep.
pub const HAND_OVER_LABEL: &str = "shep";
/// The state that hands an issue to Shep, and where Shep moves one it queued.
pub const TONIGHT_STATE: &str = "Tonight";
/// Where Shep moves an issue whose pull request is ready.
pub const IN_REVIEW_STATE: &str = "In Review";
/// Ends every comment Shep writes. Linear keeps comments as rich text, so the mark is plain
/// words rather than a hidden HTML comment.
pub const SHEP_SIGNATURE: &str = "— sent by Shep";

const API_KEY_HINT: &str = "Linear → Settings → Account → Security & access → Personal API keys";
const ACCOUNT_SEPARATOR: &str = " · ";
const TEAM_WORD: &str = "team";

/// Builds Linear adapters from the key in the keychain.
pub struct LinearFactory {
    api: String,
}

impl LinearFactory {
    /// `api` is the API host (`/graphql` is added).
    pub fn new(api: impl Into<String>) -> Self {
        Self { api: api.into() }
    }

    /// api.linear.app (or its override in the environment).
    pub fn public() -> Self {
        Self::new(api_base(SourceKind::Linear, PUBLIC_API))
    }

    fn graphql(&self, key: &str) -> Graphql {
        Graphql::new(Http::new(&self.api), key)
    }
}

impl Default for LinearFactory {
    fn default() -> Self {
        Self::public()
    }
}

impl SourceFactory for LinearFactory {
    fn kind(&self) -> SourceKind {
        SourceKind::Linear
    }

    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![
                FormField {
                    key: TOKEN_FIELD.into(),
                    label: "Personal API key".into(),
                    secret: true,
                    hint: API_KEY_HINT.into(),
                    optional: false,
                },
                FormField {
                    key: TEAM_OPTION.into(),
                    label: "Team key".into(),
                    secret: false,
                    hint: "Only this team's issues, like ENG; empty for every team".into(),
                    optional: true,
                },
            ],
            hand_over: vec![
                format!("Add the label {HAND_OVER_LABEL}"),
                format!("Move the issue to {TONIGHT_STATE}"),
            ],
        }
    }

    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let token = filled(values, TOKEN_FIELD).ok_or_else(|| {
            SourceError(format!("Linear needs a personal API key ({API_KEY_HINT})"))
        })?;
        let api = self.graphql(token);
        let viewer = api.data(documents::VIEWER, &json!({}))?;
        let team = match filled(values, TEAM_OPTION) {
            Some(key) => Some(team_key(&api, &key.to_ascii_uppercase())?),
            None => None,
        };
        let mut setting =
            SourceSetting::new(SourceKind::Linear, &account(&viewer, team.as_deref()));
        if let Some(team) = &team {
            setting = setting.with_option(TEAM_OPTION, team);
        }
        Ok(Connected {
            setting,
            secrets: BTreeMap::from([(TOKEN_FIELD.to_owned(), token.to_owned())]),
        })
    }

    fn build(
        &self,
        setting: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let api = self.graphql(&secrets.get(TOKEN_FIELD)?);
        let team = setting.option(TEAM_OPTION).map(str::to_owned);
        Ok(Arc::new(LinearSource::new(api, team)))
    }
}

/// A form value with something in it.
fn filled<'a>(values: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
    values.get(key).map(|v| v.trim()).filter(|v| !v.is_empty())
}

/// The team's key as Linear spells it, which proves the team exists.
fn team_key(api: &Graphql, key: &str) -> Result<String, SourceError> {
    let data = api.data(documents::TEAM, &json!({ "key": key }))?;
    data["teams"]["nodes"][0]["key"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| SourceError(format!("Linear has no team with the key {key}")))
}

/// "Acme · team ENG", from the `ShepViewer` answer.
fn account(viewer: &Value, team: Option<&str>) -> String {
    let workspace = viewer["organization"]["name"]
        .as_str()
        .or_else(|| viewer["viewer"]["name"].as_str())
        .unwrap_or(SourceKind::Linear.display_name());
    match team {
        Some(key) => format!("{workspace}{ACCOUNT_SEPARATOR}{TEAM_WORD} {key}"),
        None => workspace.to_owned(),
    }
}
