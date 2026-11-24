//! The terminal UI's state and what each key does. Pure: keys go in, [`Command`]s come out, and
//! the runner carries them out through the core API.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use shep_app::Board;
use shep_domain::{Task, TaskId, TaskState};

use crate::keys::to_bytes;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Board,
    Split,
    Watch,
}

/// The board's three columns; Needs you sits at the top of Ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Column {
    Queued,
    Working,
    Ready,
}

const COLUMNS: [Column; 3] = [Column::Queued, Column::Working, Column::Ready];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pane {
    Tasks,
    Session,
    Diff,
    Ci,
}

const PANES: [Pane; 4] = [Pane::Tasks, Pane::Session, Pane::Diff, Pane::Ci];

/// What a key asks the runner to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Merge(TaskId),
    SendBack(TaskId, String),
    Answer(TaskId, String),
    StartNow,
    Open(String),
    Attach(TaskId),
    Detach,
    Type(Vec<u8>),
    Quit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Asking {
    Answer(TaskId, String),
    SendBack(TaskId),
}

#[derive(Debug, Clone, Default)]
pub struct Model {
    screen: Option<Screen>,
    board: Board,
    selected: Option<TaskId>,
    column: Option<Column>,
    focus: Option<Pane>,
    zoomed: bool,
    asking: Option<(Asking, String)>,
    attached: Option<TaskId>,
    notice: Option<String>,
}

impl Model {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn screen(&self) -> Screen {
        self.screen.unwrap_or(Screen::Board)
    }
    pub fn board(&self) -> &Board {
        &self.board
    }
    pub fn selected(&self) -> Option<TaskId> {
        self.selected
    }
    pub fn selected_task(&self) -> Option<&Task> {
        let id = self.selected?;
        self.split_list().into_iter().find(|t| t.id == id)
    }
    pub fn column(&self) -> Column {
        self.column.unwrap_or(Column::Ready)
    }
    pub fn focus(&self) -> Pane {
        self.focus.unwrap_or(Pane::Tasks)
    }
    pub fn zoomed(&self) -> bool {
        self.zoomed
    }
    pub fn attached(&self) -> Option<TaskId> {
        self.attached
    }
    pub fn notice(&self) -> Option<&str> {
        self.notice.as_deref()
    }
    /// The question being asked and what has been typed so far.
    pub fn prompt(&self) -> Option<(String, String)> {
        let (asking, text) = self.asking.as_ref()?;
        let label = match asking {
            Asking::Answer(id, question) => format!("answer {id} · {question}"),
            Asking::SendBack(id) => format!("send {id} back with a note"),
        };
        Some((label, text.clone()))
    }

    /// The tasks in one board column, in the order shown.
    pub fn column_tasks(&self, column: Column) -> Vec<&Task> {
        match column {
            Column::Queued => self.board.queued.iter().collect(),
            Column::Working => self.board.working.iter().collect(),
            Column::Ready => self
                .board
                .needs_you
                .iter()
                .chain(&self.board.ready)
                .collect(),
        }
    }

    /// The split view's list: Needs you, Working, Ready, Queued.
    pub fn split_list(&self) -> Vec<&Task> {
        self.board
            .needs_you
            .iter()
            .chain(&self.board.working)
            .chain(&self.board.ready)
            .chain(&self.board.queued)
            .collect()
    }

    /// Takes a new board, keeping the selection on the same task when it is still there.
    pub fn set_board(&mut self, board: Board) {
        self.board = board;
        if let Some(column) = self.selected.and_then(|id| {
            COLUMNS
                .into_iter()
                .find(|c| self.column_tasks(*c).iter().any(|t| t.id == id))
        }) {
            self.column = Some(column);
            return;
        }
        let preferred = [
            self.column(),
            Column::Ready,
            Column::Working,
            Column::Queued,
        ];
        let found = preferred
            .into_iter()
            .find_map(|c| self.column_tasks(c).first().map(|t| (c, t.id)));
        self.column = found.map(|(c, _)| c).or(self.column);
        self.selected = found.map(|(_, id)| id);
    }

    /// Shows a line of feedback until the next key.
    pub fn say_out(&mut self, words: impl Into<String>) {
        self.notice = Some(words.into());
    }

    /// Focuses a task (after onboarding started it).
    pub fn select(&mut self, id: TaskId) {
        self.selected = Some(id);
    }

    /// The runner could not attach (or the agent ended).
    pub fn detached(&mut self, why: Option<String>) {
        self.attached = None;
        self.notice = why;
    }

    pub fn on_key(&mut self, key: KeyEvent) -> Vec<Command> {
        if self.attached.is_some() {
            return self.on_attached_key(key);
        }
        if self.asking.is_some() {
            return self.on_prompt_key(key);
        }
        self.notice = None;
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        match key.code {
            KeyCode::Char('c') if ctrl => vec![Command::Quit],
            KeyCode::Char('q') => vec![Command::Quit],
            KeyCode::Char('1') => self.show(Screen::Board),
            KeyCode::Char('2') => self.show(Screen::Split),
            KeyCode::Char('3') => self.show(Screen::Watch),
            KeyCode::Char('j') | KeyCode::Down => self.step(1),
            KeyCode::Char('k') | KeyCode::Up => self.step(-1),
            KeyCode::Char('h') | KeyCode::Left => self.step_column(-1),
            KeyCode::Char('l') | KeyCode::Right => self.step_column(1),
            KeyCode::Tab => self.step_pane(1),
            KeyCode::BackTab => self.step_pane(-1),
            KeyCode::Char('z') if self.screen() == Screen::Split => {
                self.zoomed = !self.zoomed;
                Vec::new()
            }
            KeyCode::Char('g') => vec![Command::StartNow],
            KeyCode::Char('m') => self.merge(),
            KeyCode::Char('s') => self.ask_send_back(),
            KeyCode::Char('a') => self.ask_answer(),
            KeyCode::Enter => self.enter(),
            _ => Vec::new(),
        }
    }

    fn show(&mut self, screen: Screen) -> Vec<Command> {
        self.screen = Some(screen);
        self.zoomed = false;
        Vec::new()
    }

    fn step(&mut self, by: isize) -> Vec<Command> {
        let list: Vec<TaskId> = if self.screen() == Screen::Split {
            self.split_list().iter().map(|t| t.id).collect()
        } else {
            self.column_tasks(self.column())
                .iter()
                .map(|t| t.id)
                .collect()
        };
        if let Some(next) = moved(&list, self.selected, by) {
            self.selected = Some(next);
        }
        Vec::new()
    }

    fn step_column(&mut self, by: isize) -> Vec<Command> {
        if self.screen() != Screen::Board {
            return Vec::new();
        }
        let at = COLUMNS
            .iter()
            .position(|c| *c == self.column())
            .unwrap_or(0);
        let index = self.index_in_column().unwrap_or(0);
        let mut next = at;
        loop {
            let Some(n) = next.checked_add_signed(by).filter(|n| *n < COLUMNS.len()) else {
                return Vec::new();
            };
            next = n;
            let tasks = self.column_tasks(COLUMNS[next]);
            if let Some(task) = tasks.get(index.min(tasks.len().saturating_sub(1))) {
                self.selected = Some(task.id);
                self.column = Some(COLUMNS[next]);
                return Vec::new();
            }
        }
    }

    fn index_in_column(&self) -> Option<usize> {
        let id = self.selected?;
        self.column_tasks(self.column())
            .iter()
            .position(|t| t.id == id)
    }

    fn step_pane(&mut self, by: isize) -> Vec<Command> {
        if self.screen() == Screen::Split {
            let at = PANES.iter().position(|p| *p == self.focus()).unwrap_or(0);
            let len = PANES.len().cast_signed();
            let next = (at.cast_signed() + by).rem_euclid(len).cast_unsigned();
            self.focus = Some(PANES[next]);
        }
        Vec::new()
    }

    fn merge(&mut self) -> Vec<Command> {
        match self.selected_task() {
            Some(t) if t.state == TaskState::Ready => vec![Command::Merge(t.id)],
            _ => self.say("Only Ready tasks merge."),
        }
    }

    fn ask_send_back(&mut self) -> Vec<Command> {
        match self.selected_task() {
            Some(t) if t.state == TaskState::Ready => {
                self.asking = Some((Asking::SendBack(t.id), String::new()));
                Vec::new()
            }
            _ => self.say("Only Ready tasks go back."),
        }
    }

    fn ask_answer(&mut self) -> Vec<Command> {
        match self.selected_task() {
            Some(t) if t.state == TaskState::NeedsYou => {
                let question = t.question.clone().unwrap_or_default();
                self.asking = Some((Asking::Answer(t.id, question), String::new()));
                Vec::new()
            }
            _ => self.say("Nothing is asking right now."),
        }
    }

    fn enter(&mut self) -> Vec<Command> {
        let Some(task) = self.selected_task().cloned() else {
            return Vec::new();
        };
        if self.screen() == Screen::Split && task.state == TaskState::Working {
            self.attached = Some(task.id);
            return vec![Command::Attach(task.id)];
        }
        match task.pr {
            Some(pr) => vec![Command::Open(pr.url)],
            None => self.say("No pull request yet."),
        }
    }

    fn on_prompt_key(&mut self, key: KeyEvent) -> Vec<Command> {
        let Some((asking, text)) = self.asking.as_mut() else {
            return Vec::new();
        };
        match key.code {
            KeyCode::Esc => self.asking = None,
            KeyCode::Backspace => {
                text.pop();
            }
            KeyCode::Char(c) => text.push(c),
            KeyCode::Enter if !text.trim().is_empty() => {
                let text = text.trim().to_owned();
                let command = match asking {
                    Asking::Answer(id, _) => Command::Answer(*id, text),
                    Asking::SendBack(id) => Command::SendBack(*id, text),
                };
                self.asking = None;
                return vec![command];
            }
            _ => {}
        }
        Vec::new()
    }

    fn on_attached_key(&mut self, key: KeyEvent) -> Vec<Command> {
        // Terminals send ctrl-] as 0x1D, which crossterm reads as ctrl-5.
        let detach = matches!(key.code, KeyCode::Char(']' | '5'));
        if detach && key.modifiers.contains(KeyModifiers::CONTROL) {
            self.attached = None;
            return vec![Command::Detach];
        }
        to_bytes(key).map(Command::Type).into_iter().collect()
    }

    fn say(&mut self, words: &str) -> Vec<Command> {
        self.notice = Some(words.to_owned());
        Vec::new()
    }
}

/// The id `by` places from `current` in `list`, stopping at the ends.
fn moved(list: &[TaskId], current: Option<TaskId>, by: isize) -> Option<TaskId> {
    let at = current.and_then(|id| list.iter().position(|t| *t == id));
    let next = match at {
        Some(at) => at
            .saturating_add_signed(by)
            .min(list.len().saturating_sub(1)),
        None => 0,
    };
    list.get(next).copied()
}
