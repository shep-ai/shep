//! What work needs before it starts: a repository and an agent.

use std::path::Path;

use shep_domain::AgentKind;

use crate::{AppError, SettingsChange, Shep, ShepApi};

impl Shep {
    /// Work needs a repository and an agent. An unset agent is filled in with the first
    /// installed one.
    pub(crate) fn ensure_ready(&self) -> Result<(), AppError> {
        let ports = self.ports();
        let settings = ports.settings.load_settings()?;
        if settings.repo.is_none() {
            self.repo()?;
        }
        if settings.agent.is_some() {
            return Ok(());
        }
        let found = AgentKind::ALL
            .into_iter()
            .find(|kind| ports.agents.provider(*kind).installed());
        let Some(agent) = found else {
            let names: Vec<&str> = AgentKind::ALL.iter().map(|a| a.cli_name()).collect();
            return Err(AppError::NotReady(format!(
                "no coding agent found; install one of {} and run `shep config --agent NAME`",
                names.join(", ")
            )));
        };
        self.update_settings(SettingsChange {
            agent: Some(agent),
            ..SettingsChange::default()
        })?;
        Ok(())
    }

    /// The repository containing `dir`, when no repository is chosen yet.
    pub(crate) fn adopt_repo(&self, dir: &Path) -> Result<(), AppError> {
        let ports = self.ports();
        if ports.settings.load_settings()?.repo.is_some() {
            return Ok(());
        }
        if let Ok(root) = ports.git.repo_root(dir) {
            self.update_settings(SettingsChange {
                repo: Some(root.display().to_string()),
                ..SettingsChange::default()
            })?;
        }
        Ok(())
    }
}
