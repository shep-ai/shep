//! Task sources: one adapter per kind (GitHub, Linear, Jira, Notion, Monday, Slack) behind
//! [`SourceProviders`]. The registry keeps each source's secrets in the OS keychain and hands
//! the engine the same adapter while a source's setting is unchanged.

pub mod github;
pub mod http;
pub mod jira;
pub mod linear;
pub mod monday;
pub mod notion;
mod say;
pub mod slack;
mod stamp;
pub mod tracker;

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use shep_app::ports::{SourceError, SourceForm, SourceProviders, TaskSource};
use shep_domain::{SourceKind, SourceSetting};

use crate::secrets::SecretStore;

/// `SHEP_SOURCE_API_LINEAR=http://127.0.0.1:4000` points Linear at a local server (tests).
pub const API_OVERRIDE_PREFIX: &str = "SHEP_SOURCE_API_";

/// A source that checked out: what to save in settings and what to keep in the keychain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Connected {
    pub setting: SourceSetting,
    /// By form field key.
    pub secrets: BTreeMap<String, String>,
}

/// A connected source's secrets, read from the keychain when its adapter is built.
pub struct Secrets<'a> {
    store: &'a dyn SecretStore,
    kind: SourceKind,
}

impl Secrets<'_> {
    pub fn get(&self, key: &str) -> Result<String, SourceError> {
        self.store
            .get(&secret_key(self.kind, key))
            .map_err(|e| SourceError(e.to_string()))?
            .ok_or_else(|| {
                SourceError(format!(
                    "{} is not connected on this machine; run shep config --connect {}",
                    self.kind.display_name(),
                    self.kind.cli_name()
                ))
            })
    }
}

/// Builds one kind of adapter. Every source module provides one.
pub trait SourceFactory: Send + Sync {
    fn kind(&self) -> SourceKind;
    fn form(&self) -> SourceForm;
    /// Checks the values against the source (a call that proves the token works) and splits
    /// them into what to save and what to keep secret.
    fn connect(&self, values: &BTreeMap<String, String>) -> Result<Connected, SourceError>;
    fn build(
        &self,
        setting: &SourceSetting,
        secrets: &Secrets<'_>,
    ) -> Result<Arc<dyn TaskSource>, SourceError>;
}

/// Every adapter this build has. Each source module adds its factory here.
pub fn factories() -> Vec<Box<dyn SourceFactory>> {
    vec![
        Box::new(github::GitHubFactory::public()),
        Box::new(linear::LinearFactory::public()),
        Box::new(jira::JiraFactory::default()),
        Box::new(notion::NotionFactory::default()),
        Box::new(monday::MondayFactory::default()),
        Box::new(slack::SlackFactory::new()),
    ]
}

/// The API base for a kind: its public one, or the override in the environment.
pub fn api_base(kind: SourceKind, public: &str) -> String {
    let name = format!(
        "{API_OVERRIDE_PREFIX}{}",
        kind.cli_name().to_ascii_uppercase()
    );
    std::env::var(name).unwrap_or_else(|_| public.to_owned())
}

fn secret_key(kind: SourceKind, field: &str) -> String {
    format!("{}/{field}", kind.cli_name())
}

type Built = (SourceSetting, Arc<dyn TaskSource>);

pub struct SourceRegistry {
    factories: Vec<Box<dyn SourceFactory>>,
    secrets: Arc<dyn SecretStore>,
    built: Mutex<HashMap<SourceKind, Built>>,
}

impl SourceRegistry {
    pub fn new(secrets: Arc<dyn SecretStore>, factories: Vec<Box<dyn SourceFactory>>) -> Self {
        Self {
            factories,
            secrets,
            built: Mutex::default(),
        }
    }

    fn factory(&self, kind: SourceKind) -> Result<&dyn SourceFactory, SourceError> {
        self.factories
            .iter()
            .find(|f| f.kind() == kind)
            .map(AsRef::as_ref)
            .ok_or_else(|| {
                SourceError(format!(
                    "{} is not supported by this build",
                    kind.display_name()
                ))
            })
    }

    fn forget_built(&self, kind: SourceKind) {
        if let Ok(mut built) = self.built.lock() {
            built.remove(&kind);
        }
    }
}

impl SourceProviders for SourceRegistry {
    fn form(&self, kind: SourceKind) -> SourceForm {
        self.factory(kind).map_or_else(
            |_| SourceForm {
                fields: Vec::new(),
                hand_over: Vec::new(),
            },
            SourceFactory::form,
        )
    }

    fn connect(
        &self,
        kind: SourceKind,
        values: &BTreeMap<String, String>,
    ) -> Result<SourceSetting, SourceError> {
        let connected = self.factory(kind)?.connect(values)?;
        for (field, value) in &connected.secrets {
            self.secrets
                .set(&secret_key(kind, field), value)
                .map_err(|e| SourceError(e.to_string()))?;
        }
        self.forget_built(kind);
        Ok(connected.setting)
    }

    fn disconnect(&self, kind: SourceKind) -> Result<(), SourceError> {
        self.forget_built(kind);
        for field in self.form(kind).fields.iter().filter(|f| f.secret) {
            self.secrets
                .delete(&secret_key(kind, &field.key))
                .map_err(|e| SourceError(e.to_string()))?;
        }
        Ok(())
    }

    fn source(&self, setting: &SourceSetting) -> Result<Arc<dyn TaskSource>, SourceError> {
        let mut built = self.built.lock().map_err(|e| SourceError(e.to_string()))?;
        if let Some((same, source)) = built.get(&setting.kind) {
            if same == setting {
                return Ok(source.clone());
            }
        }
        let secrets = Secrets {
            store: self.secrets.as_ref(),
            kind: setting.kind,
        };
        let source = self.factory(setting.kind)?.build(setting, &secrets)?;
        built.insert(setting.kind, (setting.clone(), source.clone()));
        Ok(source)
    }
}
