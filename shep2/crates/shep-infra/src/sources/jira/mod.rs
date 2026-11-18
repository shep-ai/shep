//! Jira Cloud (REST v3) as a task source. Work is handed over by moving an issue to a Tonight
//! status or adding the label `shep`; Shep answers in comments, links the pull request and moves
//! the issue along the workflow when the workflow has a fitting step.

mod adf;
mod source;

use std::collections::BTreeMap;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use shep_app::ports::{SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::http::Http;
use super::tracker::{field, optional, required, saved};
use super::{api_base, Connected, Secrets, SourceFactory};

pub use source::Jira;

const KIND: SourceKind = SourceKind::Jira;
const SCHEMES: [&str; 2] = ["https://", "http://"];
const PUBLIC_SCHEME: &str = "https://";
const SITE: &str = "site";
const EMAIL: &str = "email";
const TOKEN: &str = "token";
const PROJECT: &str = "project";
const TOKEN_HINT: &str = "Atlassian account → Security → API tokens \
     (id.atlassian.com/manage-profile/security/api-tokens) → Create API token";

/// Builds Jira adapters. `at` points them at a local server (tests); otherwise the API is the
/// site itself, or `SHEP_SOURCE_API_JIRA`.
#[derive(Default)]
pub struct JiraFactory {
    base: Option<String>,
}

impl JiraFactory {
    pub fn at(base: &str) -> Self {
        Self {
            base: Some(base.to_owned()),
        }
    }

    fn jira(&self, site: &str, email: &str, token: &str, project: Option<String>) -> Jira {
        let base = self
            .base
            .clone()
            .unwrap_or_else(|| api_base(KIND, &format!("{PUBLIC_SCHEME}{site}")));
        let auth = STANDARD.encode(format!("{email}:{token}"));
        Jira::new(Http::new(&base), site, &auth, project)
    }
}

impl SourceFactory for JiraFactory {
    fn kind(&self) -> SourceKind {
        KIND
    }

    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![
                field(
                    SITE,
                    "Jira site",
                    false,
                    "Your Jira address, like acme.atlassian.net",
                    false,
                ),
                field(
                    EMAIL,
                    "Email",
                    false,
                    "The email you sign in to Jira with",
                    false,
                ),
                field(TOKEN, "API token", true, TOKEN_HINT, false),
                field(
                    PROJECT,
                    "Project key",
                    false,
                    "Only watch one project, like STORE; leave empty for every project",
                    true,
                ),
            ],
            hand_over: vec![
                "Move the issue to a Tonight status".into(),
                "or add the label shep".into(),
            ],
        }
    }

    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let site = site(&required(values, KIND, SITE, "the Jira site")?)?;
        let email = required(values, KIND, EMAIL, "the email you sign in with")?;
        let token = required(values, KIND, TOKEN, "an API token")?;
        let project = optional(values, PROJECT).map(|p| p.to_ascii_uppercase());
        if let Some(key) = &project {
            source::check_key(key)?;
        }
        let jira = self.jira(&site, &email, &token, project.clone());
        let name = jira.connection()?;
        let mut setting = SourceSetting::new(KIND, &name)
            .with_option(SITE, &site)
            .with_option(EMAIL, &email);
        if let Some(key) = &project {
            setting = setting.with_option(PROJECT, key);
        }
        Ok(Connected {
            setting,
            secrets: BTreeMap::from([(TOKEN.to_owned(), token)]),
        })
    }

    fn build(
        &self,
        setting: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let site = saved(&setting.options, KIND, SITE)?;
        let email = saved(&setting.options, KIND, EMAIL)?;
        let project = optional(&setting.options, PROJECT);
        let token = secrets.get(TOKEN)?;
        Ok(Arc::new(self.jira(&site, &email, &token, project)))
    }
}

/// `https://acme.atlassian.net/jira/...` → `acme.atlassian.net`.
fn site(input: &str) -> Result<String, SourceError> {
    let rest = SCHEMES
        .iter()
        .find_map(|s| input.strip_prefix(s))
        .unwrap_or(input);
    let host = rest
        .split('/')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let valid = !host.is_empty()
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-.:".contains(c));
    if valid {
        Ok(host)
    } else {
        Err(SourceError(format!(
            "{input:?} is not a Jira site; use one like acme.atlassian.net"
        )))
    }
}
