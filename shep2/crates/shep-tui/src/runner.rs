//! The terminal loop: draws the current screen, refreshes from the core, and carries out what
//! keys ask for — always through [`ShepApi`].

use std::io;
use std::path::Path;
use std::time::{Duration, Instant};

use chrono::{Datelike, Local, TimeZone};
use crossterm::event::{self, Event, KeyEventKind};
use ratatui::DefaultTerminal;
use shep_app::ports::AgentView;
use shep_app::{ShepApi, StartWhen, TaskDetail};
use shep_domain::{ReviewAction, TaskId};
use tachyonfx::{fx, EffectRenderer, Interpolation};

use crate::model::{Command, Model, Screen};
use crate::onboarding::{Action, Onboarding};
use crate::theme::{self, Theme};
use crate::{draw, splash, vt, ViewData};

/// How often the board and the selected task are read again.
const REFRESH: Duration = Duration::from_millis(700);
/// One frame at about 14 fps; also the longest a key waits.
const FRAME: Duration = Duration::from_millis(70);
const TRANSITION_MS: u32 = 280;
const AGENT_ROWS: u16 = 60;
const AGENT_COLS: u16 = 160;
/// Chunks of agent output read per frame, so a busy agent never starves the keys.
const MAX_OUTPUT_READS: usize = 64;
const NIGHTLY_OFF: &str = "on shep go";

#[derive(Debug, Clone)]
pub struct Options {
    pub motion: bool,
    pub color: bool,
    /// Where `shep` was run; onboarding offers this repository.
    pub cwd: Option<std::path::PathBuf>,
}

struct Live {
    view: Box<dyn AgentView>,
    parser: vt100::Parser,
}

/// Runs the terminal UI until the person quits.
pub fn run(api: &dyn ShepApi, opts: &Options) -> io::Result<()> {
    let mut terminal = ratatui::init();
    let result = session(api, opts, &mut terminal);
    ratatui::restore();
    result
}

fn session(api: &dyn ShepApi, opts: &Options, terminal: &mut DefaultTerminal) -> io::Result<()> {
    let theme = Theme::new(opts.color);
    let setup = api.setup(opts.cwd.as_deref()).map_err(io::Error::other)?;
    let size = terminal.size()?;
    let roomy = size.width >= splash::MIN_WIDTH && size.height >= splash::MIN_HEIGHT;
    if opts.motion && roomy && api.first_run_today().is_ok_and(|first| first) {
        let queued = api.board().map_or(0, |b| b.queued.len() + b.working.len());
        let info = format!(
            "keeping watch · {queued} tasks in the fold · starts {}",
            setup.settings.shift_start
        );
        play_splash(terminal, &info, theme)?;
    }
    let mut model = Model::new();
    if !setup.ready || setup.settings.agent.is_none() {
        match onboard(api, opts, terminal, Onboarding::new(setup), theme)? {
            Some(id) => {
                model.select(id);
                model.on_key(crossterm::event::KeyEvent::from(
                    crossterm::event::KeyCode::Char('2'),
                ));
            }
            None => return Ok(()),
        }
    }
    main_loop(api, opts, terminal, model, theme)
}

fn play_splash(terminal: &mut DefaultTerminal, info: &str, theme: Theme) -> io::Result<()> {
    let start = Instant::now();
    let mut frame = 0;
    loop {
        let t = start.elapsed().as_secs_f32() / splash::SECONDS;
        terminal.draw(|f| splash::render(f, f.area(), t, frame, info, theme))?;
        frame += 1;
        if event::poll(FRAME)? {
            if let Event::Key(k) = event::read()? {
                if k.kind == KeyEventKind::Press {
                    return Ok(());
                }
            }
        }
        if t >= 1.0 {
            // Settled: wait for a key on the still frame.
            loop {
                if let Event::Key(k) = event::read()? {
                    if k.kind == KeyEventKind::Press {
                        return Ok(());
                    }
                }
            }
        }
    }
}

/// Returns the task onboarding started, or `None` when the person left.
fn onboard(
    api: &dyn ShepApi,
    opts: &Options,
    terminal: &mut DefaultTerminal,
    mut o: Onboarding,
    theme: Theme,
) -> io::Result<Option<TaskId>> {
    loop {
        terminal.draw(|f| o.render(f, theme))?;
        let Event::Key(k) = event::read()? else {
            continue;
        };
        if k.kind != KeyEventKind::Press {
            continue;
        }
        for action in o.on_key(k) {
            let outcome = match action {
                Action::Quit => return Ok(None),
                Action::Recheck => api.setup(opts.cwd.as_deref()).map(|s| o.set_setup(s)),
                Action::ChooseAgent(agent) => api
                    .update_settings(shep_app::SettingsChange {
                        agent: Some(agent),
                        ..Default::default()
                    })
                    .map(drop),
                Action::ChooseRepo(path) => {
                    let path =
                        std::fs::canonicalize(&path).map_or(path, |p| p.display().to_string());
                    api.update_settings(shep_app::SettingsChange {
                        repo: Some(path),
                        ..Default::default()
                    })
                    .and_then(|_| api.setup(None))
                    .map(|s| o.set_setup(s))
                }
                Action::Schedule {
                    nightly,
                    parallel,
                    keep_awake,
                } => api
                    .update_settings(shep_app::SettingsChange {
                        nightly: Some(nightly),
                        parallelism: Some(parallel),
                        keep_awake: Some(keep_awake),
                        ..Default::default()
                    })
                    .map(drop),
                Action::Start(input) => {
                    let task = api
                        .add(&input, opts.cwd.as_deref())
                        .map_err(io::Error::other)?;
                    api.start(StartWhen::Now).map_err(io::Error::other)?;
                    return Ok(Some(task.id));
                }
            };
            outcome.map_err(io::Error::other)?;
        }
    }
}

struct Screenful {
    details: Vec<TaskDetail>,
    detail: Option<TaskDetail>,
    repo: String,
    starts: String,
    merged_today: usize,
}

fn refresh(api: &dyn ShepApi, model: &mut Model) -> Result<Screenful, shep_app::AppError> {
    let board = api.board()?;
    let today = Local::now().ordinal();
    let merged_today = board
        .merged
        .iter()
        .filter(|t| {
            Local
                .timestamp_opt(t.updated_at.0, 0)
                .single()
                .is_some_and(|d| d.ordinal() == today)
        })
        .count();
    model.set_board(board);
    let settings = api.settings()?;
    let repo = settings
        .repo
        .as_deref()
        .and_then(|r| Path::new(r).file_name())
        .map_or_else(
            || "no repository".into(),
            |n| n.to_string_lossy().into_owned(),
        );
    let starts = if settings.nightly {
        settings.shift_start.to_string()
    } else {
        NIGHTLY_OFF.into()
    };
    let detail = model.selected().and_then(|id| api.detail(id).ok());
    let details = if model.screen() == Screen::Watch {
        model
            .split_list()
            .iter()
            .filter_map(|t| api.detail(t.id).ok())
            .collect()
    } else {
        Vec::new()
    };
    Ok(Screenful {
        details,
        detail,
        repo,
        starts,
        merged_today,
    })
}

fn main_loop(
    api: &dyn ShepApi,
    opts: &Options,
    terminal: &mut DefaultTerminal,
    mut model: Model,
    theme: Theme,
) -> io::Result<()> {
    let mut data = refresh(api, &mut model).map_err(io::Error::other)?;
    let mut refreshed = Instant::now();
    let mut live: Option<Live> = None;
    let mut frame: u64 = 0;
    let mut shown = model.screen();
    let mut effect = None;
    let mut last = Instant::now();
    loop {
        if refreshed.elapsed() >= REFRESH {
            match refresh(api, &mut model) {
                Ok(d) => data = d,
                Err(e) => model.say_out(e.to_string()),
            }
            refreshed = Instant::now();
        }
        let live_lines = live.as_mut().map(|l| {
            for _ in 0..MAX_OUTPUT_READS {
                match l.view.next_output(Duration::from_millis(1)) {
                    Ok(Some(bytes)) => l.parser.process(&bytes),
                    _ => break,
                }
            }
            vt::lines(l.parser.screen(), opts.color)
        });
        if opts.motion && model.screen() != shown {
            effect = Some(fx::fade_from_fg(
                theme::NIGHT,
                (TRANSITION_MS, Interpolation::QuadOut),
            ));
        }
        shown = model.screen();
        let clock = Local::now().format("%H:%M").to_string();
        let view = ViewData {
            model: &model,
            detail: data.detail.as_ref(),
            details: &data.details,
            repo: &data.repo,
            starts: &data.starts,
            clock: &clock,
            merged_today: data.merged_today,
            frame: opts.motion.then_some(frame),
            theme,
            live: live_lines.as_deref(),
        };
        let elapsed = last.elapsed();
        last = Instant::now();
        terminal.draw(|f| {
            draw(f, &view);
            if let Some(e) = effect.as_mut() {
                let ms = u32::try_from(elapsed.as_millis()).unwrap_or(u32::MAX);
                f.render_effect(e, f.area(), tachyonfx::Duration::from_millis(ms));
            }
        })?;
        if effect.as_ref().is_some_and(tachyonfx::Effect::done) {
            effect = None;
        }
        frame = frame.wrapping_add(1);
        if !event::poll(FRAME)? {
            continue;
        }
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }
        for command in model.on_key(key) {
            if !carry_out(api, &mut model, &mut live, command) {
                return Ok(());
            }
            refreshed = Instant::now()
                .checked_sub(REFRESH)
                .unwrap_or_else(Instant::now);
        }
    }
}

/// Does what a command asks; `false` to quit.
fn carry_out(
    api: &dyn ShepApi,
    model: &mut Model,
    live: &mut Option<Live>,
    command: Command,
) -> bool {
    let result = match command {
        Command::Quit => return false,
        Command::Merge(id) => api
            .review(id, ReviewAction::Merge)
            .map(|t| format!("Merged {}.", t.title)),
        Command::SendBack(id, note) => api
            .review(id, ReviewAction::SendBack { note })
            .map(|t| format!("Sent back {}.", t.title)),
        Command::Answer(id, text) => api
            .review(id, ReviewAction::Answer { text })
            .map(|t| format!("Answered; {} is working again.", t.title)),
        Command::StartNow => api.start(StartWhen::Now).map(|o| match o {
            shep_app::StartOutcome::Started(t) if t.is_empty() => "Nothing new to start.".into(),
            shep_app::StartOutcome::Started(t) => format!("Started {}.", t.len()),
            shep_app::StartOutcome::Scheduled { at, .. } => format!("Starts at {at}."),
        }),
        Command::Open(url) => Ok(open_url(&url)),
        Command::Attach(id) => match api.watch_agent(id) {
            Ok(view) => {
                let mut parser = vt100::Parser::new(AGENT_ROWS, AGENT_COLS, 0);
                parser.process(view.screen());
                *live = Some(Live { view, parser });
                return true;
            }
            Err(e) => {
                model.detached(Some(e.to_string()));
                return true;
            }
        },
        Command::Detach => {
            *live = None;
            return true;
        }
        Command::Type(bytes) => match model.attached() {
            Some(id) => api.send_to_agent(id, &bytes).map(|()| String::new()),
            None => return true,
        },
    };
    match result {
        Ok(words) if !words.is_empty() => model.say_out(words),
        Ok(_) => {}
        Err(e) => model.say_out(e.to_string()),
    }
    true
}

/// Opens a link in the browser.
fn open_url(url: &str) -> String {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    match std::process::Command::new(opener)
        .arg(url)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(_) => format!("Opened {url}"),
        Err(_) => url.to_owned(),
    }
}
