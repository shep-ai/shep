//! `shep`: the composition root. Wires the store and clock into the core actions and maps each
//! command to one of them.

mod cli;
mod output;

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;

use clap::Parser;
use cli::{Cli, Command};
use shep_app::{AppError, SettingsChange, Shep, StartWhen};
use shep_infra::{SqliteStore, SystemClock};

const SHEP_HOME_ENV: &str = "SHEP_HOME";
const DEFAULT_HOME_DIR: &str = ".shep";
const DATABASE_FILE: &str = "shep2.db";

type App = Shep<Arc<SqliteStore>, Arc<SqliteStore>, SystemClock>;

fn main() -> ExitCode {
    let cli = Cli::parse();
    match open().and_then(|app| run(&app, cli.command)) {
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

fn open() -> Result<App, AppError> {
    let store = Arc::new(SqliteStore::open(&shep_home().join(DATABASE_FILE))?);
    Ok(Shep::new(Arc::clone(&store), store, SystemClock))
}

fn shep_home() -> PathBuf {
    std::env::var_os(SHEP_HOME_ENV).map_or_else(
        || PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(DEFAULT_HOME_DIR),
        PathBuf::from,
    )
}

fn run(app: &App, command: Option<Command>) -> Result<String, AppError> {
    match command {
        None => Ok(output::board(&app.board()?)),
        Some(Command::Add { task }) => {
            let task = app.add(&task.join(" "))?;
            Ok(output::queued(&task, &app.settings()?))
        }
        Some(Command::Go { at }) => {
            let outcome = app.start(at.map_or(StartWhen::Now, StartWhen::At))?;
            Ok(output::started(&outcome, &app.board()?, &app.settings()?))
        }
        Some(Command::Config {
            agent,
            shift,
            parallel,
        }) => {
            let change = SettingsChange {
                agent,
                shift_start: shift,
                parallelism: parallel,
            };
            let settings = if change == SettingsChange::default() {
                app.settings()?
            } else {
                app.update_settings(change)?
            };
            Ok(output::settings(&settings))
        }
    }
}
