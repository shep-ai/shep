use std::os::unix::fs::PermissionsExt;

use shep_app::ports::{AgentProviders, AgentRequest};
use shep_domain::{AgentKind, AgentStatus, BlockKind, ClockTime, ResetAt, UnixTime};
use shep_infra::CliAgents;

const CONVERSATION: &str = "6914a2c0-5e70-4000-8000-000000000007";

fn agents() -> CliAgents {
    CliAgents::with_search_path(Vec::new())
}

fn args(kind: AgentKind, resume: bool) -> (String, Vec<String>) {
    let c = agents().provider(kind).command(&AgentRequest {
        prompt: "Fix it",
        conversation: CONVERSATION,
        resume,
    });
    (c.program, c.args)
}

#[test]
fn each_agent_runs_unattended_and_resumes_its_own_conversation() {
    assert_eq!(
        args(AgentKind::ClaudeCode, false),
        (
            "claude".into(),
            vec![
                "-p".into(),
                "Fix it".into(),
                "--dangerously-skip-permissions".into(),
                "--session-id".into(),
                CONVERSATION.into()
            ]
        )
    );
    assert_eq!(
        args(AgentKind::ClaudeCode, true).1[3..],
        ["--resume".to_owned(), CONVERSATION.to_owned()]
    );
    assert_eq!(
        args(AgentKind::Codex, false),
        (
            "codex".into(),
            ["exec", "--sandbox", "danger-full-access", "Fix it"]
                .map(String::from)
                .to_vec()
        )
    );
    assert_eq!(
        args(AgentKind::Codex, true).1,
        [
            "exec",
            "--sandbox",
            "danger-full-access",
            "resume",
            "--last",
            "Fix it"
        ]
        .map(String::from)
    );
    assert_eq!(
        args(AgentKind::Gemini, false),
        (
            "gemini".into(),
            ["-p", "Fix it", "-y"].map(String::from).to_vec()
        )
    );
    assert_eq!(
        args(AgentKind::Gemini, true).1,
        ["-p", "Fix it", "-y", "--resume", "latest"].map(String::from)
    );
}

fn read(kind: AgentKind, screen: &str) -> Option<AgentStatus> {
    agents().provider(kind).read_screen(screen)
}

fn limit(resets: ResetAt) -> AgentStatus {
    AgentStatus::UsageLimit { resets }
}

fn at(hour: u8, minute: u8) -> ResetAt {
    ResetAt::TimeOfDay(ClockTime { hour, minute })
}

#[test]
fn usage_limits_are_read_with_their_reset_time() {
    use AgentKind::{ClaudeCode, Codex, Gemini};
    let cases = [
        (
            ClaudeCode,
            "You've hit your session limit · resets 3:45pm",
            at(15, 45),
        ),
        (
            ClaudeCode,
            "You've hit your weekly limit · resets Mon 12:00am",
            at(0, 0),
        ),
        (
            ClaudeCode,
            "Usage limit reached · limit resets 3am",
            at(3, 0),
        ),
        (
            ClaudeCode,
            "You've hit your Opus limit · resets 11:30pm",
            at(23, 30),
        ),
        (
            ClaudeCode,
            "Claude AI usage limit reached|1753441200",
            ResetAt::At(UnixTime(1_753_441_200)),
        ),
        (
            ClaudeCode,
            "You've hit your monthly spend limit",
            ResetAt::Unknown,
        ),
        (
            Codex,
            "You\u{2019}ve hit your usage limit. Upgrade to Plus to continue using Codex \
             (https://chatgpt.com/explore/plus), or try again at 3:05 PM.",
            at(15, 5),
        ),
        (
            Codex,
            "You've hit your usage limit. Try again at Nov 4th, 2026 12:15 AM.",
            at(0, 15),
        ),
        (
            Codex,
            "You\u{2019}ve hit your usage limit. Try again later.",
            ResetAt::Unknown,
        ),
        (
            Gemini,
            "Usage limit reached for gemini-3-pro.\nAccess resets at 3:05 PM PST.",
            at(15, 5),
        ),
        (
            Gemini,
            "You have exhausted your daily quota on this model.",
            ResetAt::Unknown,
        ),
    ];
    for (kind, screen, resets) in cases {
        assert_eq!(
            read(kind, screen),
            Some(limit(resets)),
            "{kind:?}: {screen}"
        );
    }
}

#[test]
fn look_alikes_are_not_limits() {
    for screen in [
        "You've used 85% of your session limit · resets 3:45pm",
        "API Error: Server is temporarily limiting requests (not your usage limit)",
        "Added a usage limit reached banner\nto the billing page\n\n\n\n\n\n\n\nDone.",
    ] {
        assert!(
            !read(AgentKind::ClaudeCode, screen).is_some_and(|s| s.is_usage_limit()),
            "{screen}"
        );
    }
}

#[test]
fn prompts_and_activity_are_read_from_the_screen() {
    assert_eq!(
        read(
            AgentKind::ClaudeCode,
            "Do you want to proceed?\n❯ 1. Yes\n  2. No"
        ),
        Some(AgentStatus::Blocked {
            kind: Some(BlockKind::Permission),
            message: None
        })
    );
    assert_eq!(
        read(
            AgentKind::ClaudeCode,
            "✻ Thinking… (12s · esc to interrupt)"
        ),
        Some(AgentStatus::Working)
    );
    assert!(matches!(
        read(AgentKind::Codex, "Allow command? [y/n]"),
        Some(AgentStatus::Blocked { .. })
    ));
    assert!(matches!(
        read(AgentKind::Gemini, "│ Allow execution of: rm -rf"),
        Some(AgentStatus::Blocked { .. })
    ));
    assert_eq!(read(AgentKind::Codex, "plain output"), None);
}

#[test]
fn an_agent_is_installed_when_its_cli_is_on_the_search_path() {
    let dir = tempfile::tempdir().unwrap();
    let codex = dir.path().join("codex");
    std::fs::write(&codex, "#!/bin/sh\n").unwrap();
    std::fs::set_permissions(&codex, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(dir.path().join("claude"), "not executable").unwrap();
    let agents = CliAgents::with_search_path(vec![dir.path().to_path_buf()]);
    assert!(agents.provider(AgentKind::Codex).installed());
    assert!(!agents.provider(AgentKind::ClaudeCode).installed());
    assert!(!agents.provider(AgentKind::Gemini).installed());
}
