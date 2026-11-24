//! The morning brief, printed inline (not full screen) so it stays in the scrollback. On the
//! first run of the day each title decrypts into place, then it is plain text.

use std::io::Write;
use std::time::Duration;

use chrono::{DateTime, FixedOffset, Utc};
use crossterm::style::{Color, Stylize};
use shep_app::Brief;
use shep_domain::{TaskId, TaskState, UnixTime};

use crate::glyph::{reference, title};
use crate::theme;

const SLEPT_LABEL: &str = " ☾ while you slept  ";
const RULE_WIDTH: usize = 60;
const RULE: char = '─';
const SECS_PER_MINUTE: i64 = 60;
const DECRYPT_FRAMES: usize = 6;
const DECRYPT_FRAME: Duration = Duration::from_millis(30);
const NOISE: [char; 6] = ['#', '%', '*', '+', '=', ':'];

/// What a key does after the brief.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BriefKey {
    MergeGreen,
    Review,
    Answer(TaskId),
    OpenMac,
}

impl BriefKey {
    pub fn key(self) -> char {
        match self {
            Self::MergeGreen => 'm',
            Self::Review => 'r',
            Self::Answer(_) => 'a',
            Self::OpenMac => 'o',
        }
    }
}

/// The actions the brief offers, with their words.
pub fn actions(b: &Brief) -> Vec<(BriefKey, String)> {
    let mut out = Vec::new();
    if !b.green.is_empty() {
        out.push((
            BriefKey::MergeGreen,
            format!("merge the {} green", b.green.len()),
        ));
    }
    out.push((BriefKey::Review, "review one by one".into()));
    if let Some(item) = b.items.iter().find(|i| i.task.state == TaskState::NeedsYou) {
        out.push((
            BriefKey::Answer(item.task.id),
            format!("answer {}", reference(&item.task)),
        ));
    }
    out.push((BriefKey::OpenMac, "open in the Mac app".into()));
    out
}

fn local(at: UnixTime, offset: i32) -> DateTime<FixedOffset> {
    let tz = FixedOffset::east_opt(offset)
        .unwrap_or_else(|| FixedOffset::east_opt(0).expect("zero offset"));
    DateTime::<Utc>::from_timestamp(at.0, 0)
        .unwrap_or_default()
        .with_timezone(&tz)
}

fn paint(text: &str, c: Color, color: bool) -> String {
    if color {
        text.with(c).to_string()
    } else {
        text.to_owned()
    }
}

fn rgb(c: ratatui::style::Color) -> Color {
    match c {
        ratatui::style::Color::Rgb(r, g, b) => Color::Rgb { r, g, b },
        _ => Color::Reset,
    }
}

fn pad(text: &str, width: usize) -> String {
    format!("{text:<width$}")
}

/// The brief's lines; `offset` is the local UTC offset in seconds.
pub fn lines(b: &Brief, repo: &str, offset: i32, color: bool) -> Vec<String> {
    let when = local(b.at, offset).format("%a %-d %b · %H:%M");
    let amber = rgb(theme::AMBER);
    let muted = rgb(theme::MUTED);
    let mut out = vec![
        format!(
            "{}  morning brief{}",
            paint("☾ → dawn", amber, color),
            paint(&format!(" · {when} · {repo}"), muted, color)
        ),
        rule(color),
        String::new(),
    ];
    let ref_width = b
        .items
        .iter()
        .map(|i| reference(&i.task).chars().count())
        .max()
        .unwrap_or(0);
    let names: Vec<String> = b
        .items
        .iter()
        .map(|i| format!("{:<ref_width$}  {}", reference(&i.task), title(&i.task)))
        .collect();
    let width = names.iter().map(|n| n.chars().count()).max().unwrap_or(0) + 3;
    for (item, name) in b.items.iter().zip(&names) {
        let (mark, c) = match item.task.state {
            TaskState::NeedsYou => ("!", rgb(theme::CORAL)),
            TaskState::Ready => ("✓", rgb(theme::GREEN)),
            _ => ("·", rgb(theme::DUSK)),
        };
        let summary_colour = if item.task.state == TaskState::NeedsYou {
            c
        } else {
            muted
        };
        out.push(format!(
            " {} {}{}",
            paint(mark, c, color),
            pad(name, width),
            paint(&item.summary, summary_colour, color)
        ));
    }
    out.push(String::new());
    // What Shep noticed overnight, then each task it took off the board, under one label.
    let noticed = b.while_you_slept.iter().chain(&b.stopped);
    for (i, words) in noticed.enumerate() {
        let label = if i == 0 { SLEPT_LABEL } else { "" };
        out.push(format!(
            "{label:<width$}{}",
            paint(words, muted, color),
            width = SLEPT_LABEL.chars().count()
        ));
    }
    if let Some(n) = &b.overnight {
        let from = local(n.from, offset).format("%H:%M");
        let to = local(n.to, offset).format("%H:%M");
        let parked = if n.parked_secs > 0 {
            format!(
                " · parked {} min at a usage limit",
                n.parked_secs / SECS_PER_MINUTE
            )
        } else {
            String::new()
        };
        out.push(format!(
            "   overnight        {}",
            paint(
                &format!("{from} → {to}{parked} · {} of {} done", b.done, b.total),
                muted,
                color
            )
        ));
    }
    out.push(String::new());
    let keys: Vec<String> = actions(b)
        .iter()
        .map(|(k, words)| format!("{} {words}", paint(&format!("[{}]", k.key()), amber, color)))
        .collect();
    out.push(format!(" {}", keys.join("   ")));
    out
}

fn rule(color: bool) -> String {
    (0..RULE_WIDTH)
        .map(|i| {
            let t = f32::from(u16::try_from(i).unwrap_or(0))
                / f32::from(u16::try_from(RULE_WIDTH).unwrap_or(1));
            paint(
                &RULE.to_string(),
                rgb(theme::mix(theme::DUSK, theme::AMBER, t)),
                color,
            )
        })
        .collect()
}

/// Prints the brief (`styled` lines); with `motion`, each line first decrypts into place in
/// plain text, so the noise never cuts through a colour code.
pub fn print(
    out: &mut impl Write,
    plain: &[String],
    styled: &[String],
    motion: bool,
) -> std::io::Result<()> {
    for (line, styled_line) in plain.iter().zip(styled) {
        if motion && !line.trim().is_empty() {
            for frame in 0..DECRYPT_FRAMES {
                let noisy: String = line
                    .chars()
                    .enumerate()
                    .map(|(i, c)| {
                        let settled = i * DECRYPT_FRAMES / line.chars().count().max(1) < frame;
                        if settled || !c.is_alphanumeric() {
                            c
                        } else {
                            NOISE[(i + frame) % NOISE.len()]
                        }
                    })
                    .collect();
                write!(out, "\r{noisy}")?;
                out.flush()?;
                std::thread::sleep(DECRYPT_FRAME);
            }
            write!(out, "\r")?;
        }
        writeln!(out, "{styled_line}")?;
    }
    out.flush()
}

/// What happens after the brief.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// Open the board (review one by one).
    Board,
    Done,
}

/// Prints the brief, then acts on one key: merge the green ones, review on the board, answer
/// the question, or open the Mac app. Any other key leaves.
pub fn interact(
    api: &dyn shep_app::ShepApi,
    brief: &Brief,
    repo: &str,
    opts: &crate::Options,
) -> std::io::Result<Next> {
    use crossterm::event::{self, Event, KeyCode, KeyEventKind};
    let offset = chrono::Local::now().offset().local_minus_utc();
    let plain = lines(brief, repo, offset, false);
    let styled = lines(brief, repo, offset, opts.color);
    let mut out = std::io::stdout();
    print(&mut out, &plain, &styled, opts.motion)?;
    crossterm::terminal::enable_raw_mode()?;
    let key = loop {
        if let Event::Key(k) = event::read()? {
            if k.kind == KeyEventKind::Press {
                break k.code;
            }
        }
    };
    crossterm::terminal::disable_raw_mode()?;
    let chosen = actions(brief)
        .into_iter()
        .map(|(k, _)| k)
        .find(|k| KeyCode::Char(k.key()) == key);
    match chosen {
        Some(BriefKey::Review) => return Ok(Next::Board),
        Some(BriefKey::MergeGreen) => {
            for id in &brief.green {
                match api.review(*id, shep_domain::ReviewAction::Merge) {
                    Ok(t) => writeln!(out, " ✓ merged {}", t.title)?,
                    Err(e) => writeln!(out, " ✗ {id}: {e}")?,
                }
            }
        }
        Some(BriefKey::Answer(id)) => {
            write!(out, " answer {id}: ")?;
            out.flush()?;
            let mut text = String::new();
            std::io::stdin().read_line(&mut text)?;
            let text = text.trim().to_owned();
            if !text.is_empty() {
                match api.review(id, shep_domain::ReviewAction::Answer { text }) {
                    Ok(t) => writeln!(out, " ✓ {} is working again", t.title)?,
                    Err(e) => writeln!(out, " ✗ {e}")?,
                }
            }
        }
        Some(BriefKey::OpenMac) => {
            let opened = cfg!(target_os = "macos")
                && std::process::Command::new("open")
                    .args(["-a", "Shep"])
                    .status()
                    .is_ok_and(|s| s.success());
            if !opened {
                writeln!(
                    out,
                    " The Mac app is not installed here; `shep` opens the board."
                )?;
            }
        }
        None => {}
    }
    Ok(Next::Done)
}
