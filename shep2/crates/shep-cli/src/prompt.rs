//! Asking for a value: a secret without echo in a terminal, or one line of stdin when piped.

use std::io::{self, BufRead, IsTerminal, Write};

use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::terminal;

/// Whether there is a person to ask (stdin is a terminal).
pub fn interactive() -> bool {
    io::stdin().is_terminal()
}

/// One value. A secret is not echoed; piped input is read a line at a time.
pub fn ask(label: &str, secret: bool) -> io::Result<String> {
    if !interactive() {
        let mut line = String::new();
        io::stdin().lock().read_line(&mut line)?;
        return Ok(line.trim().to_owned());
    }
    let mut err = io::stderr();
    write!(err, "{label}: ")?;
    err.flush()?;
    if !secret {
        let mut line = String::new();
        io::stdin().lock().read_line(&mut line)?;
        return Ok(line.trim().to_owned());
    }
    terminal::enable_raw_mode()?;
    let typed = read_hidden();
    terminal::disable_raw_mode()?;
    writeln!(err)?;
    typed
}

/// Keys until Enter, shown as nothing. Ctrl-C gives up.
fn read_hidden() -> io::Result<String> {
    let mut typed = String::new();
    loop {
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }
        match key.code {
            KeyCode::Enter => return Ok(typed.trim().to_owned()),
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "cancelled"));
            }
            KeyCode::Char(c) => typed.push(c),
            KeyCode::Backspace => {
                typed.pop();
            }
            _ => {}
        }
    }
}
