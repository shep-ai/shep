//! Reading an agent's screen when it does not report its status over OSC 7501.
//!
//! The blocked and working patterns follow herdr's screen-reading manifests
//! (`src/detect/manifests/{claude,codex,gemini}.toml`, Apache-2.0, revisions after 2026-07-22,
//! <https://github.com/herdrdev/herdr>); the usage-limit wording comes from each CLI's own
//! messages. Patterns are matched on lowercase text with curly apostrophes made straight.

use shep_domain::{AgentStatus, BlockKind};

use super::reset;

/// Only the last lines count for a usage limit, so code or output that merely mentions one
/// earlier on the screen is not mistaken for it.
const LIMIT_LINES: usize = 6;
/// Prompts and spinners sit at the bottom of the screen.
const STATUS_LINES: usize = 12;

pub struct Manifest {
    pub limit: &'static [&'static str],
    pub blocked: &'static [&'static str],
    pub working: &'static [&'static str],
}

pub static CLAUDE_CODE: Manifest = Manifest {
    limit: &[
        "you've hit your",
        "usage limit reached ·",
        "usage limit reached|",
    ],
    blocked: &[
        "do you want to proceed?",
        "waiting for permission",
        "enter to confirm",
    ],
    working: &["esc to interrupt"],
};

pub static CODEX: Manifest = Manifest {
    limit: &["you've hit your usage limit"],
    blocked: &[
        "allow command?",
        "press enter to confirm or esc to cancel",
        "do you trust the contents of this directory?",
    ],
    working: &["esc to interrupt"],
};

pub static GEMINI: Manifest = Manifest {
    limit: &[
        "usage limit reached for",
        "you have exhausted your daily quota",
    ],
    blocked: &[
        "allow execution",
        "apply this change",
        "waiting for user confirmation",
    ],
    working: &["esc to cancel"],
};

impl Manifest {
    pub fn read(&self, screen: &str) -> Option<AgentStatus> {
        let text = screen.to_lowercase().replace('\u{2019}', "'");
        let limit_area = last_lines(&text, LIMIT_LINES);
        if let Some(at) = self.limit.iter().find_map(|p| limit_area.find(p)) {
            return Some(AgentStatus::UsageLimit {
                resets: reset::parse(&limit_area[at..]),
            });
        }
        let status_area = last_lines(&text, STATUS_LINES);
        if self.blocked.iter().any(|p| status_area.contains(p)) {
            return Some(AgentStatus::Blocked {
                kind: Some(BlockKind::Permission),
                message: None,
            });
        }
        if self.working.iter().any(|p| status_area.contains(p)) {
            return Some(AgentStatus::Working);
        }
        None
    }
}

/// The last `n` lines that have something on them.
fn last_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}
