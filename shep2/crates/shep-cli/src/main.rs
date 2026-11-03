//! `shep`: the composition root. Maps each command to one core action, on the daemon when it
//! runs (`shep go` starts it) or on the database directly.

mod cli;
mod connect;
mod daemon;
mod output;

use std::process::ExitCode;

use clap::Parser;
use cli::{Cli, Command};
use shep_app::{AppError, SettingsChange, StartWhen};
use shep_infra::ShepHome;

fn main() -> ExitCode {
    let cli = Cli::parse();
    let home = ShepHome::from_env();
    let outcome = match cli.command {
        Some(Command::Daemon) => daemon::run(&home).map(|()| String::new()),
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

fn run(home: &ShepHome, command: Option<Command>) -> Result<String, AppError> {
    match command {
        None => Ok(output::board(&connect::any(home)?.board()?)),
        Some(Command::Add { task }) => {
            let api = connect::any(home)?;
            let task = api.add(&task.join(" "))?;
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
        }) => {
            let repo = repo
                .map(|p| {
                    std::fs::canonicalize(&p)
                        .map(|p| p.display().to_string())
                        .map_err(|e| AppError::Remote(format!("{}: {e}", p.display())))
                })
                .transpose()?;
            let change = SettingsChange {
                agent,
                shift_start: shift,
                parallelism: parallel,
                repo,
            };
            let api = connect::any(home)?;
            let settings = if change.is_empty() {
                api.settings()?
            } else {
                api.update_settings(change)?
            };
            Ok(output::settings(&settings))
        }
        Some(Command::Daemon) => Err(AppError::Remote("the daemon runs on its own".into())),
    }
}
