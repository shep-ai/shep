//! GitHub issues as a task source, over the REST API with the token `gh` is signed in with, so
//! Shep keeps no GitHub secret of its own. Work is handed over with a label (`shep` unless the
//! setting says otherwise) in the repository Shep works in; Shep answers with comments that
//! end in a hidden marker, which is how it tells its own words from people's (both are written
//! as the same account).

mod json;
mod source;

use std::collections::BTreeMap;
use std::sync::Arc;

use shep_app::ports::{FormField, Prefill, SourceError, SourceForm, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use super::http::Http;
use super::{api_base, Connected, Secrets, SourceFactory};
use crate::process::run_raw;
pub use source::GitHubSource;

/// GitHub's REST API.
pub const PUBLIC_API: &str = "https://api.github.com";
/// The `gh` on `PATH`.
pub const DEFAULT_GH: &str = "gh";
/// Ends every comment Shep writes; GitHub does not show it.
pub const SHEP_MARKER: &str = "<!-- shep:update -->";
/// Setting options (and form keys).
pub const REPO_OPTION: &str = "repo";
pub const LABEL_OPTION: &str = "label";
pub const DEFAULT_LABEL: &str = "shep";

const AUTH_TOKEN_ARGS: [&str; 2] = ["auth", "token"];
const FULL_NAME_FIELD: &str = "full_name";
const ACCOUNT_SEPARATOR: &str = " · ";
const REPO_SHAPE: &str = "owner/name";
const REPO_NAME_CHARS: &str = "-_.";

/// Builds GitHub adapters; the token comes from `gh` each time one is built.
pub struct GitHubFactory {
    gh: String,
    api: String,
}

impl GitHubFactory {
    /// `gh` is the program that prints the token; `api` the REST API base.
    pub fn new(gh: impl Into<String>, api: impl Into<String>) -> Self {
        Self {
            gh: gh.into(),
            api: api.into(),
        }
    }

    /// The `gh` on `PATH` and api.github.com (or its override in the environment).
    pub fn public() -> Self {
        Self::new(DEFAULT_GH, api_base(SourceKind::GitHub, PUBLIC_API))
    }

    /// The token `gh` is signed in with. Its output never reaches an error: a failing `gh`
    /// may still have printed one.
    fn token(&self) -> Result<String, SourceError> {
        let signed_out =
            |why: &str| SourceError(format!("GitHub: run gh auth login; gh says: {why}"));
        let ran = run_raw(&self.gh, &AUTH_TOKEN_ARGS, None, &[]).map_err(|e| signed_out(&e))?;
        let token = ran.stdout.trim();
        if !ran.success || token.is_empty() {
            return Err(signed_out(ran.stderr.trim()));
        }
        Ok(token.to_owned())
    }

    fn adapter(&self, repo: &str, label: &str) -> Result<GitHubSource, SourceError> {
        Ok(GitHubSource::new(
            Http::new(&self.api),
            &self.token()?,
            repo,
            label,
        ))
    }
}

impl Default for GitHubFactory {
    fn default() -> Self {
        Self::public()
    }
}

impl SourceFactory for GitHubFactory {
    fn kind(&self) -> SourceKind {
        SourceKind::GitHub
    }

    fn form(&self) -> SourceForm {
        SourceForm {
            fields: vec![
                FormField {
                    key: REPO_OPTION.into(),
                    label: "Repository".into(),
                    secret: false,
                    hint: format!(
                        "{REPO_SHAPE} of the repository Shep works in; signed in through gh"
                    ),
                    optional: false,
                    prefill: Some(Prefill::RepositorySlug),
                    ..FormField::default()
                },
                FormField {
                    key: LABEL_OPTION.into(),
                    label: "Label".into(),
                    secret: false,
                    hint: format!("The label that hands an issue to Shep ({DEFAULT_LABEL})"),
                    optional: true,
                    ..FormField::default()
                },
            ],
            hand_over: vec![format!("Add the label {DEFAULT_LABEL} to an issue")],
        }
    }

    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError> {
        let repo = values
            .get(REPO_OPTION)
            .map(|r| r.trim())
            .filter(|r| is_owner_name(r))
            .ok_or_else(|| {
                SourceError(format!(
                    "GitHub needs the repository Shep works in, as {REPO_SHAPE}"
                ))
            })?;
        let label = values
            .get(LABEL_OPTION)
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .unwrap_or(DEFAULT_LABEL);
        let source = self.adapter(repo, label)?;
        let login = source.login()?;
        let found = source.repository()?;
        let full_name = found[FULL_NAME_FIELD].as_str().unwrap_or(repo);
        let account = format!("@{login}{ACCOUNT_SEPARATOR}{full_name}");
        Ok(Connected {
            setting: SourceSetting::new(SourceKind::GitHub, &account)
                .with_option(REPO_OPTION, full_name)
                .with_option(LABEL_OPTION, label),
            secrets: BTreeMap::new(),
        })
    }

    fn build(
        &self,
        setting: &SourceSetting,
        _: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError> {
        let repo = setting.option(REPO_OPTION).ok_or_else(|| {
            SourceError(format!(
                "GitHub has no repository; run shep config --connect {}",
                SourceKind::GitHub.cli_name()
            ))
        })?;
        let label = setting.option(LABEL_OPTION).unwrap_or(DEFAULT_LABEL);
        Ok(Arc::new(self.adapter(repo, label)?))
    }
}

/// `owner/name`, nothing more.
fn is_owner_name(text: &str) -> bool {
    let part = |p: &str| {
        !p.is_empty()
            && p.chars()
                .all(|c| c.is_ascii_alphanumeric() || REPO_NAME_CHARS.contains(c))
    };
    matches!(text.split_once('/'), Some((owner, name)) if part(owner) && part(name))
}
