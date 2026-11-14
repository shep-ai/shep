use shep_domain::{
    check_push, conversation_id, AgentJob, AgentStatus, ConversationRole, PushRefused, ResetAt,
    Run, RunStep, SessionId, Task, TaskBranch, TaskId, TaskSourceRef, UnixTime, MAX_CI_FIXES,
    MAX_CONFLICT_FIXES,
};

fn task(id: i64, text: &str) -> Task {
    Task::new(
        TaskId(id),
        TaskSourceRef::parse(text).unwrap(),
        UnixTime(1_793_000_000),
    )
}

#[test]
fn a_branch_names_the_task_and_stays_short_and_safe() {
    assert_eq!(
        TaskBranch::for_task(TaskId(412), "Fix login redirect loop").as_str(),
        "shep/412-fix-login-redirect-loop"
    );
    assert_eq!(
        TaskBranch::for_task(TaskId(3), "  Rate-limit /api/search!! (urgent) ").as_str(),
        "shep/3-rate-limit-api-search-urgent"
    );
    let long = TaskBranch::for_task(TaskId(1), &"word ".repeat(40));
    assert!(long.as_str().len() <= 48, "{}", long.as_str());
    assert!(!long.as_str().ends_with('-'));
    assert_eq!(
        TaskBranch::for_task(TaskId(9), "#9").as_str(),
        "shep/9-task"
    );
}

#[test]
fn shep_pushes_only_its_own_task_branches() {
    let branch = TaskBranch::for_task(TaskId(4), "Fix it");
    assert_eq!(check_push(branch.as_str(), "main"), Ok(()));
    assert_eq!(
        check_push("main", "main"),
        Err(PushRefused::DefaultBranch("main".into()))
    );
    assert_eq!(
        check_push("shep/x", "shep/x"),
        Err(PushRefused::DefaultBranch("shep/x".into()))
    );
    assert_eq!(
        check_push("feature/login", "main"),
        Err(PushRefused::NotATaskBranch("feature/login".into()))
    );
    assert_eq!(
        check_push("shep/", "main"),
        Err(PushRefused::NotATaskBranch("shep/".into()))
    );
}

#[test]
fn conversation_ids_are_uuids_unique_per_task_and_role() {
    let a = conversation_id(&task(1, "a"), ConversationRole::Coder);
    let b = conversation_id(&task(2, "b"), ConversationRole::Coder);
    let r = conversation_id(&task(1, "a"), ConversationRole::Reviewer);
    assert_ne!(a, b);
    assert_ne!(a, r);
    for id in [&a, &b, &r] {
        let groups: Vec<&str> = id.split('-').collect();
        assert_eq!(
            groups.iter().map(|g| g.len()).collect::<Vec<_>>(),
            [8, 4, 4, 4, 12],
            "{id}"
        );
        assert!(groups[2].starts_with('4'), "version 4: {id}");
        assert!(groups[3].starts_with('8'), "RFC 4122 variant: {id}");
        assert!(id.chars().all(|c| c == '-' || c.is_ascii_hexdigit()));
    }
    assert_eq!(a, conversation_id(&task(1, "a"), ConversationRole::Coder));
}

#[test]
fn a_new_run_prepares_first() {
    let run = Run::new(TaskId(5), UnixTime(10));
    assert_eq!(run.step, RunStep::Prepare);
    assert_eq!((run.ci_fixes, run.failures), (0, 0));
    assert_eq!(MAX_CI_FIXES, 3);
}

#[test]
fn jobs_after_the_first_continue_the_coders_conversation() {
    assert!(!AgentJob::Code.continues_conversation());
    assert!(!AgentJob::Review.continues_conversation());
    for job in [
        AgentJob::Answer,
        AgentJob::Revise,
        AgentJob::FixCi {
            attempt: 1,
            checks: vec!["lint".into()],
        },
        AgentJob::ResolveConflict {
            files: vec!["src/app.rs".into()],
        },
    ] {
        assert!(job.continues_conversation(), "{job:?}");
    }
    assert_eq!(AgentJob::Review.role(), ConversationRole::Reviewer);
    assert_eq!(AgentJob::Revise.role(), ConversationRole::Coder);
}

#[test]
fn statuses_say_when_the_agent_cannot_go_on_by_itself() {
    assert!(AgentStatus::UsageLimit {
        resets: ResetAt::Unknown
    }
    .is_usage_limit());
    assert!(!AgentStatus::Working.is_usage_limit());
}

#[test]
fn ci_checks_add_up_to_one_verdict() {
    use shep_domain::{CheckState, CiCheck, CiVerdict};
    let check = |name: &str, state| CiCheck {
        name: name.into(),
        state,
        link: None,
    };
    assert_eq!(CiVerdict::of(&[]), CiVerdict::None);
    assert_eq!(
        CiVerdict::of(&[
            check("a", CheckState::Passed),
            check("b", CheckState::Skipped)
        ]),
        CiVerdict::Green
    );
    assert_eq!(
        CiVerdict::of(&[
            check("a", CheckState::Passed),
            check("b", CheckState::Pending)
        ]),
        CiVerdict::Pending
    );
    assert_eq!(
        CiVerdict::of(&[
            check("lint", CheckState::Failed),
            check("b", CheckState::Pending),
            check("test", CheckState::Failed)
        ]),
        CiVerdict::Red(vec!["lint".into(), "test".into()])
    );
}

#[test]
fn the_running_session_is_the_agents_or_the_screenshot_commands() {
    let mut run = Run::new(TaskId(5), UnixTime(10));
    assert_eq!(run.session(), None);
    run.step = RunStep::Agent {
        job: AgentJob::Code,
        session: Some(SessionId("a".into())),
        interrupted: false,
    };
    assert_eq!(run.session(), Some(&SessionId("a".into())));
    run.step = RunStep::Screenshots {
        session: Some(SessionId("s".into())),
        since: UnixTime(10),
    };
    assert_eq!(run.session(), Some(&SessionId("s".into())));
    run.step = RunStep::Publish;
    assert_eq!(run.session(), None);
}

#[test]
fn a_run_saved_before_conflict_fixes_existed_still_loads() {
    let mut json = serde_json::to_value(Run::new(TaskId(5), UnixTime(10))).unwrap();
    json.as_object_mut().unwrap().remove("conflict_fixes");
    let run: Run = serde_json::from_value(json).unwrap();
    assert_eq!(run.conflict_fixes, 0);
    assert_eq!(
        MAX_CONFLICT_FIXES, 1,
        "the agent gets one try at a conflict"
    );
}
