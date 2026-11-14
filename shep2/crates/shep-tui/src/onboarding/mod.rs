//! Terminal onboarding: the first run, ending with a task working on the person's own repo.
//! Each step checks first and only asks when it has to.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use shep_app::Setup;
use shep_domain::{AgentKind, MAX_PARALLELISM};

mod card;

use card::GH_LOGIN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Welcome,
    Agent,
    GitHub,
    Repo,
    When,
    FirstTask,
}

/// What a key asks the runner to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    ChooseAgent(AgentKind),
    Recheck,
    ChooseRepo(String),
    Schedule {
        nightly: bool,
        parallel: u8,
        keep_awake: bool,
    },
    /// Queue this (an issue reference or a sentence) and start it now.
    Start(String),
    Quit,
}

pub struct Onboarding {
    step: Step,
    cursor: usize,
    text: String,
    typing: bool,
    nightly: bool,
    parallel: u8,
    keep_awake: bool,
    notice: Option<String>,
    setup: Setup,
}

impl Onboarding {
    pub fn new(setup: Setup) -> Self {
        Self {
            step: Step::Welcome,
            cursor: 0,
            text: String::new(),
            typing: false,
            nightly: setup.settings.nightly,
            parallel: setup.settings.parallelism,
            keep_awake: setup.settings.keep_awake,
            notice: None,
            setup,
        }
    }

    pub fn step(&self) -> Step {
        self.step
    }
    pub fn notice(&self) -> Option<&str> {
        self.notice.as_deref()
    }
    pub fn set_setup(&mut self, setup: Setup) {
        self.setup = setup;
    }

    fn go(&mut self, step: Step) {
        self.step = step;
        self.cursor = 0;
        self.typing = step == Step::Repo && self.setup.repo.is_none();
        self.text.clear();
        self.notice = None;
    }

    fn options(&self) -> usize {
        match self.step {
            Step::Agent => self.setup.agents.len(),
            Step::Repo | Step::When => 2,
            Step::FirstTask => self.setup.suggestions.len(),
            Step::Welcome | Step::GitHub => 0,
        }
    }

    pub fn on_key(&mut self, key: KeyEvent) -> Vec<Action> {
        let ctrl_c =
            key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL);
        if key.code == KeyCode::Esc || ctrl_c {
            return vec![Action::Quit];
        }
        if self.typing {
            return self.on_text_key(key);
        }
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => self.cursor = self.cursor.saturating_sub(1),
            KeyCode::Down | KeyCode::Char('j') => {
                self.cursor = (self.cursor + 1).min(self.options().saturating_sub(1));
            }
            KeyCode::Left if self.step == Step::When => {
                self.parallel = self.parallel.saturating_sub(1).max(1);
            }
            KeyCode::Right if self.step == Step::When => {
                self.parallel = (self.parallel + 1).min(MAX_PARALLELISM);
            }
            KeyCode::Char('y') if self.step == Step::When => self.keep_awake = true,
            KeyCode::Char('n') if self.step == Step::When => self.keep_awake = false,
            KeyCode::Char('r') if matches!(self.step, Step::Agent | Step::GitHub) => {
                return vec![Action::Recheck]
            }
            KeyCode::Enter => return self.enter(),
            KeyCode::Char(c) if self.step == Step::FirstTask => {
                self.typing = true;
                self.text.push(c);
            }
            _ if self.step == Step::Welcome => self.go(Step::Agent),
            _ => {}
        }
        Vec::new()
    }

    fn enter(&mut self) -> Vec<Action> {
        match self.step {
            Step::Welcome => {
                self.go(Step::Agent);
                Vec::new()
            }
            Step::Agent => {
                let Some(agent) = self.setup.agents.get(self.cursor).cloned() else {
                    return Vec::new();
                };
                if !agent.installed {
                    self.notice = Some(format!(
                        "{} is not installed: {}",
                        agent.name, agent.install
                    ));
                    return Vec::new();
                }
                self.go(Step::GitHub);
                vec![Action::ChooseAgent(agent.kind)]
            }
            Step::GitHub => {
                if self.setup.github.is_some() {
                    self.go(Step::Repo);
                } else {
                    self.notice =
                        Some(format!("Run {GH_LOGIN} in another terminal, then press r."));
                }
                Vec::new()
            }
            Step::Repo if self.cursor == 0 && self.setup.repo.is_some() => {
                self.go(Step::When);
                Vec::new()
            }
            Step::Repo => {
                self.typing = true;
                Vec::new()
            }
            Step::When => {
                self.nightly = self.cursor == 0;
                self.go(Step::FirstTask);
                vec![Action::Schedule {
                    nightly: self.nightly,
                    parallel: self.parallel,
                    keep_awake: self.keep_awake,
                }]
            }
            Step::FirstTask => self
                .setup
                .suggestions
                .get(self.cursor)
                .map(|s| vec![Action::Start(format!("#{}", s.number))])
                .unwrap_or_default(),
        }
    }

    fn on_text_key(&mut self, key: KeyEvent) -> Vec<Action> {
        match key.code {
            KeyCode::Char(c) => self.text.push(c),
            KeyCode::Backspace => {
                self.text.pop();
            }
            KeyCode::Up if self.step == Step::FirstTask && self.text.is_empty() => {
                self.typing = false;
            }
            KeyCode::Up if self.step == Step::Repo && self.setup.repo.is_some() => {
                self.typing = false;
                self.cursor = 0;
            }
            KeyCode::Enter if !self.text.trim().is_empty() => {
                let text = self.text.trim().to_owned();
                self.typing = false;
                self.text.clear();
                return match self.step {
                    Step::Repo => {
                        self.go(Step::When);
                        vec![Action::ChooseRepo(text)]
                    }
                    _ => vec![Action::Start(text)],
                };
            }
            _ => {}
        }
        Vec::new()
    }
}
