//! Keys to commands, without a terminal.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use shep_app::Board;
use shep_domain::{PullRequest, Task, TaskId, TaskSourceRef, TaskState, UnixTime};
use shep_tui::model::{Command, Model, Pane, Screen};

fn task(id: i64, state: TaskState) -> Task {
    let mut t = Task::new(
        TaskId(id),
        TaskSourceRef::parse(&format!("#{id}")).unwrap(),
        UnixTime(id),
    );
    t.state = state;
    if state == TaskState::Ready {
        t.pr = Some(PullRequest {
            number: 100 + u64::try_from(id).unwrap(),
            url: format!("https://github.com/acme/app/pull/{}", 100 + id),
        });
    }
    if state == TaskState::NeedsYou {
        t.question = Some("Which bucket?".into());
    }
    t
}

fn model() -> Model {
    let board = Board::from_tasks(vec![
        task(1, TaskState::Queued),
        task(2, TaskState::Queued),
        task(3, TaskState::Working),
        task(4, TaskState::Ready),
        task(5, TaskState::NeedsYou),
    ]);
    let mut m = Model::new();
    m.set_board(board);
    m
}

fn key(c: char) -> KeyEvent {
    KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE)
}

fn code(code: KeyCode) -> KeyEvent {
    KeyEvent::new(code, KeyModifiers::NONE)
}

fn press(m: &mut Model, keys: &str) -> Vec<Command> {
    keys.chars().flat_map(|c| m.on_key(key(c))).collect()
}

#[test]
fn selection_starts_on_what_needs_a_decision() {
    let m = model();
    assert_eq!(
        m.selected(),
        Some(TaskId(5)),
        "needs you comes first in Ready"
    );
}

#[test]
fn j_k_move_within_a_column_and_h_l_between_columns() {
    let mut m = model();
    press(&mut m, "j");
    assert_eq!(m.selected(), Some(TaskId(4)));
    press(&mut m, "j");
    assert_eq!(m.selected(), Some(TaskId(4)), "stops at the end");
    press(&mut m, "h");
    assert_eq!(m.selected(), Some(TaskId(3)));
    press(&mut m, "hk");
    assert_eq!(m.selected(), Some(TaskId(1)));
    m.on_key(code(KeyCode::Down));
    assert_eq!(m.selected(), Some(TaskId(2)));
}

#[test]
fn m_merges_only_ready_work_and_enter_opens_its_pr() {
    let mut m = model();
    assert_eq!(press(&mut m, "m"), []);
    assert!(m.notice().unwrap().contains("Ready"));
    press(&mut m, "j");
    assert_eq!(press(&mut m, "m"), [Command::Merge(TaskId(4))]);
    assert_eq!(
        m.on_key(code(KeyCode::Enter)),
        [Command::Open("https://github.com/acme/app/pull/104".into())]
    );
    assert_eq!(press(&mut m, "g"), [Command::StartNow]);
}

#[test]
fn s_asks_for_a_note_and_a_answers_the_question() {
    let mut m = model();
    assert_eq!(press(&mut m, "a"), []);
    assert!(m.prompt().unwrap().0.contains("Which bucket?"));
    press(&mut m, "prod");
    m.on_key(code(KeyCode::Backspace));
    assert_eq!(
        m.on_key(code(KeyCode::Enter)),
        [Command::Answer(TaskId(5), "pro".into())]
    );
    assert_eq!(m.prompt(), None);

    press(&mut m, "j");
    press(&mut m, "s");
    press(&mut m, "also /signup");
    assert_eq!(
        m.on_key(code(KeyCode::Enter)),
        [Command::SendBack(TaskId(4), "also /signup".into())]
    );

    press(&mut m, "s");
    m.on_key(code(KeyCode::Esc));
    assert_eq!(m.prompt(), None, "esc cancels");
    assert_eq!(
        m.on_key(code(KeyCode::Enter)),
        [Command::Open("https://github.com/acme/app/pull/104".into())]
    );
}

#[test]
fn the_split_view_moves_focus_zooms_and_attaches() {
    let mut m = model();
    press(&mut m, "2");
    assert_eq!(m.screen(), Screen::Split);
    assert_eq!(m.focus(), Pane::Tasks);
    m.on_key(code(KeyCode::Tab));
    assert_eq!(m.focus(), Pane::Session);
    press(&mut m, "z");
    assert!(m.zoomed());
    press(&mut m, "z");
    m.on_key(code(KeyCode::BackTab));
    assert_eq!(m.focus(), Pane::Tasks);

    // The split list runs Needs you, Working, Ready, Queued.
    press(&mut m, "j");
    assert_eq!(m.selected(), Some(TaskId(3)));
    assert_eq!(m.on_key(code(KeyCode::Enter)), [Command::Attach(TaskId(3))]);
    assert_eq!(m.attached(), Some(TaskId(3)));
    assert_eq!(press(&mut m, "q"), [Command::Type(b"q".to_vec())]);
    assert_eq!(
        m.on_key(code(KeyCode::Enter)),
        [Command::Type(b"\r".to_vec())]
    );
    let detach = KeyEvent::new(KeyCode::Char(']'), KeyModifiers::CONTROL);
    assert_eq!(m.on_key(detach), [Command::Detach]);
    assert_eq!(m.attached(), None);
    m.on_key(code(KeyCode::Enter));
    let as_terminals_send_it = KeyEvent::new(KeyCode::Char('5'), KeyModifiers::CONTROL);
    assert_eq!(m.on_key(as_terminals_send_it), [Command::Detach]);
}

#[test]
fn screens_switch_and_q_quits() {
    let mut m = model();
    press(&mut m, "3");
    assert_eq!(m.screen(), Screen::Watch);
    press(&mut m, "1");
    assert_eq!(m.screen(), Screen::Board);
    assert_eq!(press(&mut m, "q"), [Command::Quit]);
    let ctrl_c = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
    assert_eq!(m.on_key(ctrl_c), [Command::Quit]);
}

#[test]
fn the_selection_follows_a_task_when_the_board_changes() {
    let mut m = model();
    press(&mut m, "j");
    assert_eq!(m.selected(), Some(TaskId(4)));
    m.set_board(Board::from_tasks(vec![
        task(4, TaskState::Merged),
        task(3, TaskState::Ready),
    ]));
    assert_eq!(
        m.selected(),
        Some(TaskId(3)),
        "a merged task leaves the board"
    );
}
