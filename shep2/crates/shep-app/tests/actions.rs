mod fakes;

use std::cell::Cell;

use fakes::{MemorySettings, MemoryTasks, TickingClock};
use shep_app::{AppError, SettingsChange, Shep, StartOutcome, StartWhen};
use shep_domain::{AgentKind, ClockTime, ReviewAction, SourceKind, TaskId, TaskState};

fn shep() -> Shep<MemoryTasks, MemorySettings, TickingClock> {
    Shep::new(
        MemoryTasks::default(),
        MemorySettings::default(),
        TickingClock(Cell::new(1000)),
    )
}

#[test]
fn add_queues_a_task_from_a_reference_or_a_sentence() {
    let s = shep();
    let a = s.add("#412").unwrap();
    let b = s.add("Rate-limit /api/search").unwrap();
    assert_eq!(
        (a.state, a.source.kind()),
        (TaskState::Queued, SourceKind::GitHub)
    );
    assert_eq!(
        (b.state, b.source.kind()),
        (TaskState::Queued, SourceKind::Shep)
    );
    assert_ne!(a.id, b.id);
}

#[test]
fn add_refuses_empty_input() {
    assert!(matches!(shep().add("  "), Err(AppError::Source(_))));
}

#[test]
fn start_now_starts_queued_tasks_up_to_the_parallel_limit_oldest_first() {
    let s = shep();
    let ids: Vec<TaskId> = (0..5)
        .map(|i| s.add(&format!("task {i}")).unwrap().id)
        .collect();
    let StartOutcome::Started(started) = s.start(StartWhen::Now).unwrap() else {
        panic!("expected Started")
    };
    assert_eq!(started.iter().map(|t| t.id).collect::<Vec<_>>(), ids[..3]);
    assert!(started.iter().all(|t| t.state == TaskState::Working));
    let StartOutcome::Started(none) = s.start(StartWhen::Now).unwrap() else {
        panic!("expected Started")
    };
    assert!(none.is_empty(), "the limit counts tasks already working");
}

#[test]
fn start_at_a_time_sets_the_shift_start() {
    let s = shep();
    s.add("a").unwrap();
    let at = ClockTime::parse("22:30").unwrap();
    assert_eq!(
        s.start(StartWhen::At(at)).unwrap(),
        StartOutcome::Scheduled { at, queued: 1 }
    );
    assert_eq!(s.settings().unwrap().shift_start, at);
    assert_eq!(s.board().unwrap().queued.len(), 1, "nothing starts yet");
}

#[test]
fn board_groups_tasks_in_review_order() {
    let s = shep();
    for i in 0..4 {
        s.add(&format!("task {i}")).unwrap();
    }
    s.start(StartWhen::Now).unwrap(); // 1, 2, 3 working; 4 queued
    s.finish(TaskId(1)).unwrap();
    s.ask(TaskId(2), "Which bucket?").unwrap();
    let b = s.board().unwrap();
    let ids = |v: &Vec<shep_domain::Task>| v.iter().map(|t| t.id.0).collect::<Vec<_>>();
    assert_eq!(ids(&b.needs_you), [2]);
    assert_eq!(ids(&b.ready), [1]);
    assert_eq!(ids(&b.working), [3]);
    assert_eq!(ids(&b.queued), [4]);
    assert!(b.merged.is_empty());
    assert_eq!(
        b.groups().map(|(state, _)| state).collect::<Vec<_>>(),
        [
            TaskState::NeedsYou,
            TaskState::Ready,
            TaskState::Working,
            TaskState::Queued,
            TaskState::Merged
        ]
    );
}

#[test]
fn review_merges_ready_work_and_answers_questions() {
    let s = shep();
    s.add("a").unwrap();
    s.add("b").unwrap();
    s.start(StartWhen::Now).unwrap();
    s.finish(TaskId(1)).unwrap();
    s.ask(TaskId(2), "Which bucket?").unwrap();
    assert_eq!(
        s.review(TaskId(1), ReviewAction::Merge).unwrap().state,
        TaskState::Merged
    );
    let answered = s
        .review(
            TaskId(2),
            ReviewAction::Answer {
                text: "prod".into(),
            },
        )
        .unwrap();
    assert_eq!(
        (answered.state, answered.note.as_deref()),
        (TaskState::Working, Some("prod"))
    );
}

#[test]
fn review_reports_unknown_tasks_and_refused_moves() {
    let s = shep();
    assert!(matches!(
        s.review(TaskId(9), ReviewAction::Merge),
        Err(AppError::NotFound(TaskId(9)))
    ));
    s.add("a").unwrap();
    assert!(matches!(
        s.review(TaskId(1), ReviewAction::Merge),
        Err(AppError::Transition(_))
    ));
}

#[test]
fn settings_change_only_what_is_given() {
    let s = shep();
    let after = s
        .update_settings(SettingsChange {
            agent: Some(AgentKind::Codex),
            parallelism: Some(5),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(after.agent, Some(AgentKind::Codex));
    assert_eq!(after.parallelism, 5);
    assert_eq!(after.shift_start, ClockTime::parse("23:00").unwrap());
    assert!(matches!(
        s.update_settings(SettingsChange {
            parallelism: Some(0),
            ..Default::default()
        }),
        Err(AppError::Settings(_))
    ));
}
