//! Whether to animate and colour: off with `--no-motion`, `NO_COLOR`, `CI`, `TERM=dumb`, or when
//! output is not a terminal.

use std::io::IsTerminal;

const NO_COLOR: &str = "NO_COLOR";
const CI: &str = "CI";
const TERM: &str = "TERM";
const DUMB: &str = "dumb";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Look {
    pub interactive: bool,
    pub color: bool,
    pub motion: bool,
}

pub fn detect(no_motion: bool) -> Look {
    let interactive = std::io::stdout().is_terminal() && std::io::stdin().is_terminal();
    let set = |key: &str| std::env::var_os(key).is_some_and(|v| !v.is_empty());
    let dumb = std::env::var(TERM).is_ok_and(|t| t == DUMB);
    let color = interactive && !set(NO_COLOR) && !set(CI) && !dumb;
    Look {
        interactive,
        color,
        motion: color && !no_motion,
    }
}
