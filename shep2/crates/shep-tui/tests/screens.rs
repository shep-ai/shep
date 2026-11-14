//! Each screen rendered with Ratatui's test backend, compared with a reviewed snapshot.
//! Refresh after a deliberate change: `INSTA_UPDATE=always cargo test -p shep-tui`, then read
//! the new snapshots before committing them.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use shep_app::{Board, DiffStat, StepView, TaskDetail};
use shep_domain::{
    AgentKind, CheckState, CiCheck, EventKind, PullRequest, Task, TaskEvent, TaskId, TaskSourceRef,
    TaskState, UnixTime,
};
use shep_tui::model::Model;
use shep_tui::theme::Theme;
use shep_tui::{draw, ViewData};

const WIDTH: u16 = 110;
const HEIGHT: u16 = 30;

fn task(number: u64, title: &str, state: TaskState) -> Task {
    let mut t = Task::new(
        TaskId(i64::try_from(number).unwrap()),
        TaskSourceRef::parse(&format!("#{number}")).unwrap(),
        UnixTime(i64::try_from(number).unwrap()),
    );
    t.title = title.into();
    t.state = state;
    if state == TaskState::Ready {
        t.pr = Some(PullRequest {
            number: number + 1000,
            url: format!("https://github.com/acme/app/pull/{}", number + 1000),
        });
    }
    if state == TaskState::NeedsYou {
        t.question = Some("Which bucket, prod or staging?".into());
    }
    t
}

fn tasks() -> Vec<Task> {
    vec![
        task(433, "Rate-limit /api/search", TaskState::Queued),
        task(436, "Dark mode for settings", TaskState::Queued),
        task(425, "Empty state for projects page", TaskState::Working),
        task(430, "Move avatars to S3", TaskState::NeedsYou),
        task(412, "Fix login redirect loop", TaskState::Ready),
        task(418, "Add CSV export to reports", TaskState::Ready),
    ]
}

fn detail(t: &Task) -> TaskDetail {
    let (step, activity, summary) = match t.state {
        TaskState::Ready => (
            StepView::Ready,
            "ready · CI green",
            "CI green · +41 -12 · fixed 1 failure · screenshot",
        ),
        TaskState::Working => (StepView::Coding, "Herding commits…", ""),
        TaskState::NeedsYou => (
            StepView::NeedsYou,
            "needs you: Which bucket, prod or staging?",
            "",
        ),
        _ => (StepView::Queued, "queued", ""),
    };
    let events = (0..5)
        .map(|i| TaskEvent {
            task_id: t.id,
            at: UnixTime(10_000 - i * 700),
            kind: EventKind::AgentStarted,
            detail: String::new(),
        })
        .collect();
    TaskDetail {
        task: t.clone(),
        step,
        activity: activity.into(),
        summary: summary.into(),
        agent: Some(AgentKind::ClaudeCode),
        branch: Some(format!("shep/{}-x", t.id)),
        live: t.state == TaskState::Working,
        screen: (t.state == TaskState::Working).then(|| {
            "● Read src/pages/projects/index.tsx\n● Edit src/pages/projects/index.tsx  +18 -2\n⠋ Herding commits…\n".into()
        }),
        checks: vec![
            CiCheck { name: "build".into(), state: CheckState::Passed, link: None },
            CiCheck { name: "lint".into(), state: CheckState::Pending, link: None },
        ],
        stat: DiffStat { files: 2, added: 40, removed: 2 },
        diff: Some("diff --git a/x b/x\n@@ -1,3 +1,4 @@ src/pages/projects/index.tsx\n   if (projects.length === 0) {\n-    return <Table rows={[]} />;\n+    return <EmptyState title=\"No projects yet\" />;\n }".into()),
        proof: vec!["/tasks/425/proof/empty-state.png".into()],
        review: (t.state == TaskState::Ready).then(|| "Looks correct; one naming nit.".into()),
        events,
    }
}

fn snapshot(model: &Model, selected_detail: bool) -> String {
    let all: Vec<TaskDetail> = tasks().iter().map(detail).collect();
    let chosen = model
        .selected()
        .and_then(|id| all.iter().find(|d| d.task.id == id))
        .filter(|_| selected_detail);
    let view = ViewData {
        model,
        detail: chosen,
        details: &all,
        repo: "booking-app",
        starts: "23:00",
        clock: "02:14",
        merged_today: 0,
        frame: None,
        theme: Theme::new(false),
        live: None,
    };
    let mut terminal = Terminal::new(TestBackend::new(WIDTH, HEIGHT)).unwrap();
    terminal.draw(|f| draw(f, &view)).unwrap();
    let buffer = terminal.backend().buffer().clone();
    let mut text = String::new();
    for y in 0..HEIGHT {
        let row: String = (0..WIDTH)
            .map(|x| buffer[(x, y)].symbol().to_owned())
            .collect();
        text.push_str(row.trim_end());
        text.push('\n');
    }
    text
}

fn model() -> Model {
    let mut m = Model::new();
    m.set_board(Board::from_tasks(tasks()));
    m
}

fn press(m: &mut Model, keys: &str) {
    for c in keys.chars() {
        m.on_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
}

#[test]
fn board() {
    let mut m = model();
    press(&mut m, "j");
    insta::assert_snapshot!(snapshot(&m, true));
}

#[test]
fn board_asking_for_a_send_back_note() {
    let mut m = model();
    press(&mut m, "js");
    press(&mut m, "also /signup");
    insta::assert_snapshot!(snapshot(&m, true));
}

#[test]
fn split_view_on_a_working_task() {
    let mut m = model();
    press(&mut m, "2j");
    insta::assert_snapshot!(snapshot(&m, true));
}

#[test]
fn split_view_zoomed_on_the_diff() {
    let mut m = model();
    press(&mut m, "2j");
    m.on_key(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE));
    m.on_key(KeyEvent::new(KeyCode::Tab, KeyModifiers::NONE));
    press(&mut m, "z");
    insta::assert_snapshot!(snapshot(&m, true));
}

#[test]
fn watch_screen() {
    let mut m = model();
    press(&mut m, "3");
    insta::assert_snapshot!(snapshot(&m, true));
}

#[test]
fn an_empty_board_says_how_to_start() {
    let m = Model::new();
    insta::assert_snapshot!(snapshot(&m, false));
}
