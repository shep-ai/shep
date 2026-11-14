//! Slack. A person hands work over with a `:sheep:` reaction on any message or "@Shep tonight"
//! in a thread; Shep answers in that thread right away, asks its questions there, and in the
//! morning posts the PR, proof and Merge / Send back buttons there.
//!
//! There is no Shep server: each team creates its own Slack app from
//! `shep2/dist/slack/manifest.yaml`, and Shep connects over Socket Mode from this machine with
//! the app-level token (events and button presses) and calls the Web API with the bot token.

mod api;
mod events;
mod inbox;
mod link;
mod messages;
mod proof;
mod read;
mod socket;
mod source;
mod wire;

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{FormField, SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::{api_base, Connected, Secrets, SourceFactory};
use api::{Api, CONNECTIONS_OPEN};
pub use link::MessageLink;
pub use source::SlackSource;

/// Form field: the bot token (`xoxb-`), for the Web API.
pub const BOT_TOKEN: &str = "bot_token";
/// Form field: the app-level token (`xapp-`), for Socket Mode.
pub const APP_TOKEN: &str = "app_token";
const BOT_TOKEN_PREFIX: &str = "xoxb-";
const APP_TOKEN_PREFIX: &str = "xapp-";
const PUBLIC_API: &str = "https://slack.com/api";

/// Builds the Slack adapter against Slack's API, or another base (tests).
#[derive(Default)]
pub struct SlackFactory {
    base: Option<String>,
}

impl SlackFactory {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn at(base: &str) -> Self {
        Self {
            base: Some(base.to_owned()),
        }
    }

    fn base(&self) -> String {
        self.base
            .clone()
            .unwrap_or_else(|| api_base(SourceKind::Slack, PUBLIC_API))
    }
}

/// The value of a token field, checked for its kind; the error never repeats the value.
fn token<'a>(
    values: &'a BTreeMap<String, String>,
    key: &str,
    prefix: &str,
    what: &str,
) -> Result<&'a str, SourceError> {
    let value = values.get(key).map_or("", |v| v.trim());
    if value.starts_with(prefix) {
        Ok(value)
    } else {
        Err(SourceError(format!("the {what} starts with {prefix}")))
    }
}

impl SourceFactory for SlackFactory {
    fn kind(&self) -> SourceKind {
        SourceKind::Slack
    }

    fn form(&self) -> SourceForm {
        let field = |key: &str, label: &str, hint: &str| FormField {
            key: key.to_owned(),
            label: label.to_owned(),
            secret: true,
            hint: hint.to_owned(),
            optional: false,
        };
        SourceForm {
            fields: vec![
                field(
                    BOT_TOKEN,
                    "Bot token",
                    "api.slack.com/apps → your Shep app (made from Shep's manifest) → OAuth & \
                     Permissions → Bot User OAuth Token, starts with xoxb-",
                ),
                field(
                    APP_TOKEN,
                    "App-level token",
                    "The same app → Basic Information → App-Level Tokens → a token with \
                     connections:write, starts with xapp-",
                ),
            ],
            hand_over: vec![
                "React with :sheep: on any message".to_owned(),
                "Write \"@Shep tonight\" in a thread".to_owned(),
            ],
        }
    }

    /// Proves the bot token (`auth.test`, which names the workspace) and the app-level token
    /// (`apps.connections.open`).
    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let bot = token(values, BOT_TOKEN, BOT_TOKEN_PREFIX, "bot token")?;
        let app = token(values, APP_TOKEN, APP_TOKEN_PREFIX, "app-level token")?;
        let base = self.base();
        let me = Api::new(&base, bot).identity()?;
        Api::new(&base, app)
            .post_form(CONNECTIONS_OPEN, &[])
            .map_err(|f| SourceError(socket::app_token_problem(f)))?;
        Ok(Connected {
            setting: SourceSetting::new(SourceKind::Slack, &me.team),
            secrets: BTreeMap::from([
                (BOT_TOKEN.to_owned(), bot.to_owned()),
                (APP_TOKEN.to_owned(), app.to_owned()),
            ]),
        })
    }

    fn build(
        &self,
        _: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let (bot, app) = (secrets.get(BOT_TOKEN)?, secrets.get(APP_TOKEN)?);
        Ok(Arc::new(SlackSource::start(&self.base(), &bot, &app)))
    }
}
