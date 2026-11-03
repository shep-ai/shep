//! The coding agent CLIs Shep runs, each unattended in its own worktree. Which one runs is a
//! setting; nothing outside this module names an agent's command line.

mod manifest;
mod reset;

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::Arc;

use shep_app::ports::{AgentCommand, AgentProvider, AgentProviders, AgentRequest};
use shep_domain::{AgentKind, AgentStatus};

use manifest::Manifest;

const EXECUTABLE_BITS: u32 = 0o111;

/// Every agent Shep knows, found on a search path (normally `PATH`).
pub struct CliAgents {
    search_path: Arc<Vec<PathBuf>>,
}

impl CliAgents {
    pub fn from_env() -> Self {
        let path = std::env::var_os("PATH").unwrap_or_default();
        Self::with_search_path(std::env::split_paths(&path).collect())
    }

    pub fn with_search_path(dirs: Vec<PathBuf>) -> Self {
        Self {
            search_path: Arc::new(dirs),
        }
    }

    /// Whether an executable `program` is on the search path.
    pub fn finds(&self, program: &str) -> bool {
        finds(&self.search_path, program)
    }
}

fn finds(dirs: &[PathBuf], program: &str) -> bool {
    dirs.iter().any(|dir| {
        std::fs::metadata(dir.join(program))
            .is_ok_and(|m| m.is_file() && m.permissions().mode() & EXECUTABLE_BITS != 0)
    })
}

impl AgentProviders for CliAgents {
    fn provider(&self, kind: AgentKind) -> Arc<dyn AgentProvider> {
        Arc::new(CliAgent {
            kind,
            search_path: Arc::clone(&self.search_path),
        })
    }
}

struct CliAgent {
    kind: AgentKind,
    search_path: Arc<Vec<PathBuf>>,
}

impl CliAgent {
    fn program(&self) -> &'static str {
        match self.kind {
            AgentKind::ClaudeCode => "claude",
            AgentKind::Codex => "codex",
            AgentKind::Gemini => "gemini",
        }
    }

    fn manifest(&self) -> &'static Manifest {
        match self.kind {
            AgentKind::ClaudeCode => &manifest::CLAUDE_CODE,
            AgentKind::Codex => &manifest::CODEX,
            AgentKind::Gemini => &manifest::GEMINI,
        }
    }
}

impl AgentProvider for CliAgent {
    /// Headless, with permission prompts off (the worktree is the agent's to change), resuming
    /// the task's own conversation when asked.
    fn command(&self, r: &AgentRequest<'_>) -> AgentCommand {
        let prompt = r.prompt.to_owned();
        let args: Vec<String> = match self.kind {
            AgentKind::ClaudeCode => {
                let conversation_flag = if r.resume { "--resume" } else { "--session-id" };
                vec![
                    "-p".into(),
                    prompt,
                    "--dangerously-skip-permissions".into(),
                    conversation_flag.into(),
                    r.conversation.to_owned(),
                ]
            }
            // `codex exec resume --last` picks the latest session in this directory: the
            // task's worktree (the reviewer runs elsewhere).
            AgentKind::Codex => {
                let mut args = vec![
                    "exec".into(),
                    "--sandbox".into(),
                    "danger-full-access".into(),
                ];
                if r.resume {
                    args.extend(["resume".into(), "--last".into()]);
                }
                args.push(prompt);
                args
            }
            AgentKind::Gemini => {
                let mut args = vec!["-p".into(), prompt, "-y".into()];
                if r.resume {
                    args.extend(["--resume".into(), "latest".into()]);
                }
                args
            }
        };
        AgentCommand {
            program: self.program().into(),
            args,
        }
    }

    fn read_screen(&self, screen: &str) -> Option<AgentStatus> {
        self.manifest().read(screen)
    }

    fn installed(&self) -> bool {
        finds(&self.search_path, self.program())
    }
}
