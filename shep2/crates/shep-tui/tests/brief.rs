use shep_app::{Brief, BriefItem, Overnight};
use shep_domain::{Task, TaskId, TaskSourceRef, TaskState, UnixTime};
use shep_tui::brief::{actions, lines, BriefKey};

fn item(n: u64, title: &str, state: TaskState, summary: &str) -> BriefItem {
    let mut task = Task::new(
        TaskId(i64::try_from(n).unwrap()),
        TaskSourceRef::parse(&format!("#{n}")).unwrap(),
        UnixTime(0),
    );
    task.title = title.into();
    task.state = state;
    BriefItem {
        task,
        summary: summary.into(),
    }
}

/// Thu 30 Oct 2025 07:02 UTC.
const AT: i64 = 1_761_807_720;

fn brief() -> Brief {
    Brief {
        at: UnixTime(AT),
        items: vec![
            item(
                430,
                "Move avatars to S3",
                TaskState::NeedsYou,
                "needs you: which bucket?",
            ),
            item(
                412,
                "Fix login redirect loop",
                TaskState::Ready,
                "CI green · +41 -12 · screenshot",
            ),
        ],
        while_you_slept: Some("CI failed once overnight; Shep fixed it.".into()),
        overnight: Some(Overnight {
            from: UnixTime(AT - 8 * 3600 - 2 * 60),
            to: UnixTime(AT - 12 * 60),
            parked_secs: 43 * 60,
        }),
        done: 1,
        total: 2,
        mergeable: 1,
        green: vec![TaskId(412)],
        stopped: Vec::new(),
    }
}

#[test]
fn the_brief_reads_like_the_design() {
    let text = lines(&brief(), "booking-app", 0, false).join("\n");
    let expected = "\
☾ → dawn  morning brief · Thu 30 Oct · 07:02 · booking-app
────────────────────────────────────────────────────────────

 ! #430  Move avatars to S3        needs you: which bucket?
 ✓ #412  Fix login redirect loop   CI green · +41 -12 · screenshot

 ☾ while you slept  CI failed once overnight; Shep fixed it.
   overnight        23:00 → 06:50 · parked 43 min at a usage limit · 1 of 2 done

 [m] merge the 1 green   [r] review one by one   [a] answer #430   [o] open in the Mac app";
    assert_eq!(text, expected);
}

#[test]
fn a_task_shep_stopped_is_listed_with_the_reason() {
    let mut b = brief();
    b.stopped = vec!["Stopped: Rate-limit /api/search — issue closed".into()];
    let text = lines(&b, "booking-app", 0, false).join("\n");
    assert!(
        text.contains(
            " ☾ while you slept  CI failed once overnight; Shep fixed it.\n                    \
             Stopped: Rate-limit /api/search — issue closed\n"
        ),
        "{text}"
    );

    b.while_you_slept = None;
    let text = lines(&b, "booking-app", 0, false).join("\n");
    assert!(
        text.contains(" ☾ while you slept  Stopped: Rate-limit /api/search — issue closed\n"),
        "{text}"
    );
}

#[test]
fn the_actions_offer_only_what_applies() {
    let mut b = brief();
    assert_eq!(
        actions(&b).iter().map(|(k, _)| *k).collect::<Vec<_>>(),
        [
            BriefKey::MergeGreen,
            BriefKey::Review,
            BriefKey::Answer(TaskId(430)),
            BriefKey::OpenMac
        ]
    );
    b.green.clear();
    b.items.remove(0);
    assert_eq!(
        actions(&b).iter().map(|(k, _)| *k).collect::<Vec<_>>(),
        [BriefKey::Review, BriefKey::OpenMac]
    );
}

#[test]
fn titles_line_up_whatever_the_reference() {
    let mut b = brief();
    b.items[0].task.source = TaskSourceRef::parse("Store uploads").unwrap();
    b.items[0].task.title = "Store uploads".into();
    let text = lines(&b, "app", 0, false);
    // In characters: the marks before the titles differ in bytes.
    let at = |l: &str, word: &str| l[..l.find(word).unwrap()].chars().count();
    assert_eq!(at(&text[3], "Store"), at(&text[4], "Fix"), "{text:#?}");
}

#[test]
fn local_time_follows_the_offset() {
    let text = lines(&brief(), "booking-app", 2 * 3600, false).join("\n");
    assert!(text.contains("Thu 30 Oct · 09:02"), "{text}");
    assert!(text.contains("01:00 → 08:50"), "{text}");
}
