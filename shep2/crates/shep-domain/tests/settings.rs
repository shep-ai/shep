use shep_domain::{AgentKind, ClockTime, Settings, SettingsError};

#[test]
fn clock_times_parse_and_display_as_hh_mm() {
    assert_eq!(
        ClockTime::parse("23:00").unwrap(),
        ClockTime {
            hour: 23,
            minute: 0
        }
    );
    assert_eq!(ClockTime::parse("7:05").unwrap().to_string(), "07:05");
    for bad in ["24:00", "12:60", "noon", "12", ""] {
        assert!(
            matches!(ClockTime::parse(bad), Err(SettingsError::BadTime(_))),
            "{bad}"
        );
    }
}

#[test]
fn agents_parse_from_their_cli_names() {
    assert_eq!(
        AgentKind::parse("claude-code").unwrap(),
        AgentKind::ClaudeCode
    );
    assert_eq!(AgentKind::parse("codex").unwrap(), AgentKind::Codex);
    assert_eq!(AgentKind::parse("gemini").unwrap(), AgentKind::Gemini);
    assert!(matches!(
        AgentKind::parse("cursor"),
        Err(SettingsError::UnknownAgent(_))
    ));
    for a in AgentKind::ALL {
        assert_eq!(AgentKind::parse(a.cli_name()).unwrap(), a);
    }
}

#[test]
fn defaults_start_at_eleven_with_three_at_a_time_and_no_agent_chosen() {
    let s = Settings::default();
    assert_eq!(s.agent, None);
    assert_eq!(
        s.shift_start,
        ClockTime {
            hour: 23,
            minute: 0
        }
    );
    assert_eq!(s.parallelism, 3);
}

#[test]
fn parallelism_must_be_between_one_and_twelve() {
    assert!(Settings::check_parallelism(1).is_ok());
    assert!(Settings::check_parallelism(12).is_ok());
    assert!(matches!(
        Settings::check_parallelism(0),
        Err(SettingsError::BadParallelism(0))
    ));
    assert!(matches!(
        Settings::check_parallelism(13),
        Err(SettingsError::BadParallelism(13))
    ));
}

#[test]
fn settings_saved_before_repo_existed_still_load() {
    let old = r#"{"agent":null,"shift_start":{"hour":23,"minute":0},"parallelism":3}"#;
    let s: Settings = serde_json::from_str(old).unwrap();
    assert_eq!(s.repo, None);
    assert_eq!(s, Settings::default());
}
