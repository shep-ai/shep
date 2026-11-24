use shep_domain::{
    PullRequest, ReviewAction, Task, TaskId, TaskSourceRef, TaskState, TransitionError, UnixTime,
};

fn queued() -> Task {
    Task::new(
        TaskId(1),
        TaskSourceRef::parse("Fix login redirect loop").unwrap(),
        UnixTime(100),
    )
}

#[test]
fn a_new_task_is_queued_and_titled_from_its_source() {
    let t = queued();
    assert_eq!(t.state, TaskState::Queued);
    assert_eq!(t.title, "Fix login redirect loop");
    assert_eq!(t.created_at, UnixTime(100));
    assert_eq!(t.updated_at, UnixTime(100));
}

#[test]
fn moving_updates_the_state_and_time() {
    let mut t = queued();
    t.move_to(TaskState::Working, UnixTime(200)).unwrap();
    assert_eq!(t.state, TaskState::Working);
    assert_eq!(t.updated_at, UnixTime(200));
}

#[test]
fn a_refused_move_changes_nothing() {
    let mut t = queued();
    let err = t.move_to(TaskState::Merged, UnixTime(200)).unwrap_err();
    assert_eq!(
        err,
        TransitionError {
            from: TaskState::Queued,
            to: TaskState::Merged
        }
    );
    assert_eq!(t.state, TaskState::Queued);
    assert_eq!(t.updated_at, UnixTime(100));
}

#[test]
fn asking_a_question_needs_you_and_answering_resumes_work() {
    let mut t = queued();
    t.move_to(TaskState::Working, UnixTime(200)).unwrap();
    t.ask("Which S3 bucket?", UnixTime(300)).unwrap();
    assert_eq!(t.state, TaskState::NeedsYou);
    assert_eq!(t.question.as_deref(), Some("Which S3 bucket?"));
    t.review(
        ReviewAction::Answer {
            text: "acme-prod-avatars".into(),
        },
        UnixTime(400),
    )
    .unwrap();
    assert_eq!(t.state, TaskState::Working);
    assert_eq!(t.question, None);
    assert_eq!(t.note.as_deref(), Some("acme-prod-avatars"));
}

#[test]
fn ready_work_is_merged_or_sent_back_with_a_note() {
    let mut t = queued();
    t.move_to(TaskState::Working, UnixTime(200)).unwrap();
    t.move_to(TaskState::Ready, UnixTime(300)).unwrap();
    t.review(
        ReviewAction::SendBack {
            note: "also trim spaces".into(),
        },
        UnixTime(400),
    )
    .unwrap();
    assert_eq!(t.state, TaskState::Working);
    assert_eq!(t.note.as_deref(), Some("also trim spaces"));
    t.move_to(TaskState::Ready, UnixTime(500)).unwrap();
    t.review(ReviewAction::Merge, UnixTime(600)).unwrap();
    assert_eq!(t.state, TaskState::Merged);
}

#[test]
fn merging_unfinished_work_is_refused() {
    let mut t = queued();
    assert!(t.review(ReviewAction::Merge, UnixTime(200)).is_err());
    assert_eq!(t.state, TaskState::Queued);
}

#[test]
fn a_new_task_has_no_pull_request_yet() {
    let t = Task::new(TaskId(1), TaskSourceRef::parse("#7").unwrap(), UnixTime(5));
    assert_eq!(t.pr, None);
    let pr = PullRequest {
        number: 12,
        url: "https://github.com/o/r/pull/12".into(),
    };
    assert_eq!(pr.to_string(), "https://github.com/o/r/pull/12");
}
