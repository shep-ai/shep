use clap::{Parser, Subcommand};
use shep_domain::{AgentKind, ClockTime};

/// Shep: go to sleep with issues, wake up with pull requests.
#[derive(Debug, Parser)]
#[command(
    name = "shep",
    version,
    disable_help_subcommand = true,
    after_help = "Run `shep` with no command to see the board."
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Queue a task: an issue (#412), a link to a ticket or message, or a sentence
    Add {
        /// The task; several words are joined into one sentence
        #[arg(required = true, num_args = 1..)]
        task: Vec<String>,
    },
    /// Start queued tasks now, or set when tonight's shift starts
    Go {
        /// Start the shift at this time instead of now, like 23:00
        #[arg(long, value_name = "HH:MM", value_parser = ClockTime::parse)]
        at: Option<ClockTime>,
    },
    /// Show or change settings: agent, shift start, tasks at a time
    Config {
        /// Coding agent to run: claude-code, codex or gemini
        #[arg(long, value_parser = AgentKind::parse)]
        agent: Option<AgentKind>,
        /// When the nightly shift starts, like 23:00
        #[arg(long, value_name = "HH:MM", value_parser = ClockTime::parse)]
        shift: Option<ClockTime>,
        /// How many tasks run at once (1 to 12)
        #[arg(long, value_name = "N")]
        parallel: Option<u8>,
        /// The local checkout Shep works in; each task gets its own worktree from its origin
        #[arg(long, value_name = "PATH")]
        repo: Option<std::path::PathBuf>,
    },
    /// Runs the background daemon (started by `shep go`; not for direct use)
    #[command(name = "__daemon", hide = true)]
    Daemon,
}
