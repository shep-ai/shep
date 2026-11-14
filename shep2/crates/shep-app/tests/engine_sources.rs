//! Work handed over in a source (Linear here; every adapter looks the same to the engine):
//! picked up, acknowledged in place, asked and answered there, reported ready and merged there.

mod support;

use std::collections::BTreeMap;

use shep_app::ports::{HandOver, Reply, Update};
use shep_app::testing::{FakeSource, FAKE_TOKEN_KEY};
use shep_domain::{SourceKind, TaskSourceRef};
use support::*;

const KEY: &str = "ENG-342";
const TITLE: &str = "Invoice dates use the wrong timezone";
const BODY: &str = "Dates on invoices show UTC; they should use the customer's zone.";
/// Long enough for every per-source and per-task poll to be due again.
const LATER: i64 = 600;

fn item() -> HandOver {
    HandOver {
        source: source(),
        title: TITLE.into(),
        body: BODY.into(),
        url: format!("https://linear.app/acme/issue/{KEY}"),
    }
}

fn source() -> TaskSourceRef {
    TaskSourceRef::Linear { key: KEY.into() }
}

fn connect(w: &World) -> std::sync::Arc<FakeSource> {
    let values = BTreeMap::from([(FAKE_TOKEN_KEY.to_owned(), "lin_api_123".to_owned())]);
    w.shep.connect_source(SourceKind::Linear, &values).unwrap();
    w.f.sources.get(SourceKind::Linear)
}

fn now(w: &World) -> shep_domain::UnixTime {
    use shep_app::ports::Clock;
    w.f.clock.now()
}

fn updates(linear: &FakeSource) -> Vec<Update> {
    linear.reports().into_iter().map(|(_, u)| u).collect()
}

/// Handed over in Linear and picked up: task 1, queued and acknowledged.
fn handed_over() -> (World, std::sync::Arc<FakeSource>) {
    let w = world();
    let linear = connect(&w);
    linear.hand_over(item());
    w.engine.tick();
    (w, linear)
}

/// Handed over, worked on, and Ready on draft PR #101.
fn ready() -> (World, std::sync::Arc<FakeSource>) {
    let (w, linear) = handed_over();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    w.agent_finishes();
    w.engine.tick();
    w.f.forge
        .queue_checks(vec![check("build", CheckState::Passed)]);
    w.engine.tick();
    w.f.sessions.exit(&w.session().0, 0, "");
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Ready);
    w.engine.tick();
    (w, linear)
}

#[test]
fn work_handed_over_in_a_source_is_queued_and_acknowledged_there() {
    let (w, linear) = handed_over();
    let board = w.shep.board().unwrap();
    assert_eq!(board.queued.len(), 1);
    assert_eq!(board.queued[0].title, TITLE);
    assert_eq!(board.queued[0].source, source());
    assert_eq!(
        linear.reports(),
        [(
            source(),
            Update::Queued {
                starts: Some(ClockTime::parse("23:00").unwrap()),
                repo: Some("acme/app".into()),
            }
        )]
    );
    assert!(w.kinds(1).contains(&EventKind::HandedOver));
    assert!(w.kinds(1).contains(&EventKind::Reported));

    w.f.clock.advance(LATER);
    w.engine.tick();
    assert_eq!(w.shep.board().unwrap().queued.len(), 1, "still one task");
    assert_eq!(linear.reports().len(), 1, "acknowledged once");
}

#[test]
fn a_source_that_is_not_connected_is_not_read() {
    let w = world();
    let linear = w.f.sources.get(SourceKind::Linear);
    linear.hand_over(item());
    w.engine.tick();
    assert_eq!(linear.polls(), 0);
    assert_eq!(w.shep.board().unwrap().queued.len(), 0);
}

#[test]
fn a_source_is_read_once_per_poll_interval_and_a_failure_changes_nothing() {
    let w = world();
    let linear = connect(&w);
    linear.fail(Some("401 Unauthorized"));
    linear.hand_over(item());
    w.engine.tick();
    assert_eq!(w.shep.board().unwrap().queued.len(), 0);

    linear.fail(None);
    w.engine.tick();
    assert_eq!(w.shep.board().unwrap().queued.len(), 0, "not due yet");
    w.f.clock.advance(LATER);
    w.engine.tick();
    assert_eq!(w.shep.board().unwrap().queued.len(), 1);
}

#[test]
fn the_agent_reads_the_ticket_from_its_source() {
    let (w, _) = handed_over();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    assert!(w.prompt().contains(BODY), "{}", w.prompt());
    assert_eq!(
        w.f.git.worktrees()[0].branch.as_str(),
        "shep/1-invoice-dates-use-the-wrong-timezone"
    );
}

#[test]
fn a_question_is_asked_in_the_source_and_answered_there() {
    let (w, linear) = handed_over();
    w.shep.start(StartWhen::Now).unwrap();
    w.engine.tick();
    w.shep
        .ask(TaskId(1), "Which zone when the customer has none?")
        .unwrap();
    w.engine.tick();
    assert_eq!(
        updates(&linear).last(),
        Some(&Update::Asked {
            question: "Which zone when the customer has none?".into()
        })
    );

    w.f.clock.advance(5);
    let at = now(&w);
    linear.reply(
        &source(),
        Reply::Said {
            at,
            author: "dana".into(),
            text: "Use the account's zone".into(),
        },
    );
    w.f.clock.advance(LATER);
    w.engine.tick();
    let task = w.task(1);
    assert_eq!(task.state, TaskState::Working);
    assert_eq!(task.note.as_deref(), Some("Use the account's zone"));
}

#[test]
fn ready_and_merged_are_reported_in_the_source() {
    let (w, linear) = ready();
    let Some(Update::Ready { pr, summary, .. }) = updates(&linear).last().cloned() else {
        panic!("{:?}", linear.reports());
    };
    assert_eq!(pr.number, 101);
    assert!(summary.contains("CI green"), "{summary}");
    let reported = linear.reports().len();
    w.engine.tick();
    assert_eq!(linear.reports().len(), reported, "said once");

    w.shep.review(TaskId(1), ReviewAction::Merge).unwrap();
    w.engine.tick();
    assert!(matches!(
        updates(&linear).last(),
        Some(Update::Merged { .. })
    ));
}

#[test]
fn a_merge_button_in_the_source_merges_and_a_shep_note_sends_back() {
    let (w, linear) = ready();
    let now = now(&w);
    linear.reply(
        &source(),
        Reply::Said {
            at: now,
            author: "dana".into(),
            text: "wait, it's already fixed? what's Shep?".into(),
        },
    );
    linear.reply(
        &source(),
        Reply::Said {
            at: now,
            author: "ariel".into(),
            text: "shep: also trim spaces around the code".into(),
        },
    );
    w.f.clock.advance(LATER);
    w.engine.tick();
    let task = w.task(1);
    assert_eq!(task.state, TaskState::Working);
    assert_eq!(
        task.note.as_deref(),
        Some("also trim spaces around the code")
    );
}

#[test]
fn the_merge_button_merges() {
    let (w, linear) = ready();
    let now = now(&w);
    linear.reply(
        &source(),
        Reply::Merge {
            at: now,
            author: "ariel".into(),
        },
    );
    w.f.clock.advance(LATER);
    w.engine.tick();
    assert_eq!(w.state(1), TaskState::Merged);
    assert_eq!(w.f.forge.merged().len(), 1);
}

#[test]
fn merged_work_still_labelled_in_the_source_is_not_picked_up_again() {
    let (w, _) = ready();
    w.shep.review(TaskId(1), ReviewAction::Merge).unwrap();
    w.f.clock.advance(LATER);
    w.engine.tick();
    let board = w.shep.board().unwrap();
    assert_eq!(board.queued.len(), 0);
    assert_eq!(board.merged.len(), 1);
}

#[test]
fn a_task_added_by_link_is_acknowledged_in_its_source_too() {
    let w = world();
    let linear = connect(&w);
    linear.put(item());
    w.shep
        .add(&format!("https://linear.app/acme/issue/{KEY}"), None)
        .unwrap();
    w.engine.tick();
    assert!(matches!(updates(&linear)[..], [Update::Queued { .. }]));
}
