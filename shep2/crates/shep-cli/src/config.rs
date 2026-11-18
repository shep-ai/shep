//! `shep config`: show settings, change them, and connect or disconnect task sources.

use std::collections::BTreeMap;
use std::path::PathBuf;

use shep_app::{AppError, SettingsChange, ShepApi, SourceStatus};
use shep_domain::{AgentKind, ClockTime, SourceKind};
use shep_infra::ShepHome;

use crate::{connect, output, prompt};

const PAIR_SEPARATOR: char = '=';

/// Everything `shep config` was given.
pub struct ConfigArgs {
    pub agent: Option<AgentKind>,
    pub shift: Option<ClockTime>,
    pub parallel: Option<u8>,
    pub repo: Option<PathBuf>,
    pub nightly: Option<bool>,
    pub keep_awake: Option<bool>,
    pub connect: Option<SourceKind>,
    pub disconnect: Option<SourceKind>,
    pub values: Vec<String>,
}

pub fn run(home: &ShepHome, args: ConfigArgs) -> Result<String, AppError> {
    let repo = args
        .repo
        .map(|p| {
            std::fs::canonicalize(&p)
                .map(|p| p.display().to_string())
                .map_err(|e| AppError::Remote(format!("{}: {e}", p.display())))
        })
        .transpose()?;
    let change = SettingsChange {
        agent: args.agent,
        shift_start: args.shift,
        parallelism: args.parallel,
        repo,
        nightly: args.nightly,
        keep_awake: args.keep_awake,
    };
    let api = connect::any(home)?;
    let mut said = String::new();
    if let Some(kind) = args.connect {
        let status = connect_source(api.as_ref(), kind, &args.values)?;
        said = output::connected(&status);
    }
    if let Some(kind) = args.disconnect {
        api.disconnect_source(kind)?;
    }
    let settings = if change.is_empty() {
        api.settings()?
    } else {
        api.update_settings(change)?
    };
    let agents = api.setup(None)?.agents;
    Ok(said + &output::settings(&settings, &api.sources()?, &agents))
}

/// Fills the source's form from KEY=VALUE pairs and by asking; secrets only by asking.
fn connect_source(
    api: &dyn ShepApi,
    kind: SourceKind,
    pairs: &[String],
) -> Result<SourceStatus, AppError> {
    let status = api
        .sources()?
        .into_iter()
        .find(|s| s.kind == kind)
        .ok_or_else(|| AppError::Remote(format!("{} is not available", kind.display_name())))?;
    let mut values = BTreeMap::new();
    if status.form.fields.is_empty() {
        // Nothing to fill in (or no adapter in this build): the source says which.
        return api.connect_source(kind, &values);
    }
    for pair in pairs {
        let (key, value) = pair.split_once(PAIR_SEPARATOR).ok_or_else(|| {
            AppError::Remote(format!(
                "{pair:?} is not KEY=VALUE, like site=acme.atlassian.net"
            ))
        })?;
        let Some(field) = status.form.fields.iter().find(|f| f.key == key) else {
            let keys: Vec<&str> = status.form.fields.iter().map(|f| f.key.as_str()).collect();
            return Err(AppError::Remote(format!(
                "{} asks for {}; not {key}",
                status.name,
                keys.join(", ")
            )));
        };
        if field.secret {
            return Err(AppError::Remote(format!(
                "{} ({key}) is a secret: type it when asked, or pipe it in; never on the command line",
                field.label
            )));
        }
        values.insert(key.to_owned(), value.to_owned());
    }
    for field in &status.form.fields {
        // A value Shep found itself (the repository) is used as is; the core fills it in.
        let known = field.value.is_some();
        if values.contains_key(&field.key) || known || (field.optional && !prompt::interactive()) {
            continue;
        }
        let label = if field.hint.is_empty() {
            field.label.clone()
        } else {
            format!("{} ({})", field.label, field.hint)
        };
        let value =
            prompt::ask(&label, field.secret).map_err(|e| AppError::Remote(e.to_string()))?;
        if !value.is_empty() {
            values.insert(field.key.clone(), value);
        }
    }
    api.connect_source(kind, &values)
}
