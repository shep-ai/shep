//! What onboarding and `shep config` show: agents, GitHub, the repository, first tasks.

use std::path::Path;

use shep_domain::AgentKind;

use crate::view::{AgentOption, RepoFacts, Setup, Suggestion};
use crate::{AppError, Shep};

/// Open issues offered as a first task.
const SUGGESTIONS: usize = 5;

impl Shep {
    /// Reads what is installed, signed in and chosen. Points Shep at the repository in
    /// `from_dir` when none is chosen yet, as `add` does.
    pub fn setup(&self, from_dir: Option<&Path>) -> Result<Setup, AppError> {
        if let Some(dir) = from_dir {
            self.adopt_repo(dir)?;
        }
        let ports = self.ports();
        let settings = ports.settings.load_settings()?;
        let agents = AgentKind::ALL
            .into_iter()
            .map(|kind| {
                let provider = ports.agents.provider(kind);
                AgentOption {
                    kind,
                    name: kind.display_name().into(),
                    installed: provider.installed(),
                    install: provider.install_hint(),
                    chosen: settings.agent == Some(kind),
                }
            })
            .collect::<Vec<_>>();
        let github = ports.forge.whoami().ok().flatten();
        let repo = settings.repo.as_ref().map(|path| {
            let info = ports.git.describe(Path::new(path)).ok();
            RepoFacts {
                path: path.clone(),
                slug: info.as_ref().and_then(|i| i.slug.clone()),
                clean: info.is_some_and(|i| i.clean),
            }
        });
        let suggestions = match (&settings.repo, &github) {
            (Some(path), Some(_)) => ports
                .forge
                .open_issues(Path::new(path), SUGGESTIONS)
                .unwrap_or_default()
                .into_iter()
                .map(|i| Suggestion {
                    number: i.number,
                    title: i.title,
                })
                .collect(),
            _ => Vec::new(),
        };
        let has_agent = settings.agent.is_some() || agents.iter().any(|a| a.installed);
        Ok(Setup {
            ready: repo.is_some() && has_agent && github.is_some(),
            agents,
            github,
            repo,
            suggestions,
            settings,
            sources: self.source_statuses()?,
            candidates: self.source_candidates(SUGGESTIONS)?,
        })
    }
}
