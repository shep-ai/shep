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
    /// Turn every animation off (`NO_COLOR`, `CI` and piped output do this by themselves)
    #[arg(long, global = true)]
    pub no_motion: bool,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Queue a task: an issue (#412), a link to a ticket or message, or a sentence
    Add {
        /// The task; several words are joined into one sentence
        #[arg(required_unless_present = "label", num_args = 1..)]
        task: Vec<String>,
        /// Queue every open issue with this label instead, like `--label shep`
        #[arg(long, value_name = "LABEL", conflicts_with = "task")]
        label: Option<String>,
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
        /// Start the shift by itself every night (on), or only on `shep go` (off)
        #[arg(long, value_name = "on|off", value_parser = switch)]
        nightly: Option<bool>,
        /// Keep the machine awake while tasks work (on power only on a Mac)
        #[arg(long, value_name = "on|off", value_parser = switch)]
        keep_awake: Option<bool>,
    },
    /// Runs the background daemon (started by `shep go`; not for direct use)
    #[command(name = "__daemon", hide = true)]
    Daemon,
    /// Runs the PTY holder that keeps agents alive (started by the daemon)
    #[command(name = "__holder", hide = true)]
    Holder,
}

const ON: &str = "on";
const OFF: &str = "off";

fn switch(s: &str) -> Result<bool, String> {
    match s.trim() {
        ON => Ok(true),
        OFF => Ok(false),
        other => Err(format!("{other:?} is not on or off")),
    }
}
