//! `shep`: the composition root. Maps each command to one core action, on the daemon when it
//! runs (`shep go` starts it) or on the database directly.

mod build;
mod cli;
mod config;
mod connect;
mod daemon;
mod look;
mod output;
mod prompt;
mod wiring;

use std::process::ExitCode;

use clap::Parser;
use cli::{Cli, Command};
use shep_app::{AppError, StartWhen};
use shep_infra::ShepHome;

fn main() -> ExitCode {
    let cli = Cli::parse();
    let home = ShepHome::from_env();
    let look = look::detect(cli.no_motion);
    let outcome = match cli.command {
        Some(Command::Daemon) => daemon::run(&home).map(|()| String::new()),
        Some(Command::Holder) => daemon::run_holder(&home).map(|()| String::new()),
        Some(Command::Mcp) => serve_mcp(&home).map(|()| String::new()),
        None if look.interactive => open_board(&home, look).map(|()| String::new()),
        command => run(&home, command),
    };
    match outcome {
        Ok(text) if text.is_empty() => ExitCode::SUCCESS,
        Ok(text) => {
            print!("{text}");
            if !text.ends_with('\n') {
                println!();
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("shep: {e}");
            ExitCode::FAILURE
        }
    }
}

/// MCP on stdio, through the daemon (started if needed). stdout belongs to the protocol.
fn serve_mcp(home: &ShepHome) -> Result<(), AppError> {
    let api: std::sync::Arc<dyn shep_app::ShepApi> = connect::daemon(home)?.into();
    let dir = std::env::current_dir().ok();
    shep_mcp::run_stdio(api, dir).map_err(|e| AppError::Remote(e.to_string()))
}

/// In a terminal: the morning brief when there is news, then the board (with onboarding the
/// first time). The board is live, so it talks to the daemon, starting it if needed.
fn open_board(home: &ShepHome, look: look::Look) -> Result<(), AppError> {
    let api = connect::daemon(home)?;
    let opts = shep_tui::Options {
        motion: look.motion,
        color: look.color,
        cwd: std::env::current_dir().ok(),
    };
    let failed = |e: std::io::Error| AppError::Remote(e.to_string());
    if let Some(brief) = api.morning_brief()? {
        let repo = api
            .settings()?
            .repo
            .as_deref()
            .and_then(|r| {
                std::path::Path::new(r)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
            })
            .unwrap_or_default();
        if shep_tui::brief::interact(api.as_ref(), &brief, &repo, &opts).map_err(failed)?
            == shep_tui::brief::Next::Done
        {
            return Ok(());
        }
    }
    shep_tui::run(api.as_ref(), &opts).map_err(failed)
}

fn run(home: &ShepHome, command: Option<Command>) -> Result<String, AppError> {
    match command {
        None => Ok(output::board(&connect::any(home)?.board()?)),
        Some(Command::Add { task, label }) => {
            let api = connect::any(home)?;
            let here = std::env::current_dir().ok();
            if let Some(label) = label {
                let added = api.add_label(&label, here.as_deref())?;
                return Ok(output::queued_label(&added, &label, &api.settings()?));
            }
            let task = api.add(&task.join(" "), here.as_deref())?;
            Ok(output::queued(&task, &api.settings()?))
        }
        Some(Command::Go { at }) => {
            let api = connect::daemon(home)?;
            let outcome = api.start(at.map_or(StartWhen::Now, StartWhen::At))?;
            Ok(output::started(&outcome, &api.board()?, &api.settings()?))
        }
        Some(Command::Config {
            agent,
            shift,
            parallel,
            repo,
            nightly,
            keep_awake,
            connect,
            disconnect,
            values,
        }) => config::run(
            home,
            config::ConfigArgs {
                agent,
                shift,
                parallel,
                repo,
                nightly,
                keep_awake,
                connect,
                disconnect,
                values,
            },
        ),
        Some(Command::Daemon | Command::Holder | Command::Mcp) => {
            Err(AppError::Remote("this runs on its own".into()))
        }
    }
}
