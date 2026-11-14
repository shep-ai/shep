//! Onboarding starts where the work lives: pick sources, connect them, see the moves that hand
//! work over, then choose first tasks from what they offer.

use std::collections::BTreeMap;

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use shep_app::ports::{FormField, HandOver, SourceForm};
use shep_app::{AgentOption, Candidate, Setup, SourceStatus};
use shep_domain::{AgentKind, Settings, SourceKind, TaskSourceRef};
use shep_tui::onboarding::{Action, Onboarding, Step};
use shep_tui::theme::Theme;

const SECRET: &str = "lin_api_s3cret";

fn field(key: &str, secret: bool) -> FormField {
    FormField {
        key: key.into(),
        label: if secret {
            "API key".into()
        } else {
            "Team".into()
        },
        secret,
        hint: "Linear → Settings → API".into(),
        optional: !secret,
    }
}

fn status(kind: SourceKind, connected: bool) -> SourceStatus {
    SourceStatus {
        kind,
        name: kind.display_name().into(),
        connected,
        account: if connected {
            "Acme".into()
        } else {
            String::new()
        },
        problem: None,
        form: SourceForm {
            fields: vec![field("token", true), field("team", false)],
            hand_over: vec![format!("Add the label shep in {}", kind.display_name())],
        },
    }
}

fn setup(connected: &[SourceKind]) -> Setup {
    Setup {
        agents: vec![AgentOption {
            kind: AgentKind::ClaudeCode,
            name: "Claude Code".into(),
            installed: true,
            install: String::new(),
            chosen: true,
        }],
        github: Some("ariel".into()),
        repo: None,
        suggestions: Vec::new(),
        settings: Settings::default(),
        ready: false,
        sources: SourceKind::CONNECTABLE
            .into_iter()
            .map(|k| status(k, connected.contains(&k)))
            .collect(),
        candidates: vec![
            candidate("ENG-342", "Invoice dates use the wrong timezone", false),
            candidate("ENG-360", "Rethink onboarding", true),
        ],
    }
}

fn candidate(key: &str, title: &str, vague: bool) -> Candidate {
    Candidate {
        kind: SourceKind::Linear,
        item: HandOver {
            source: TaskSourceRef::Linear { key: key.into() },
            title: title.into(),
            body: String::new(),
            url: format!("https://linear.app/acme/issue/{key}"),
        },
        vague,
    }
}

fn key(c: KeyCode) -> KeyEvent {
    KeyEvent::new(c, KeyModifiers::NONE)
}

fn press(o: &mut Onboarding, codes: &[KeyCode]) -> Vec<Action> {
    codes.iter().flat_map(|c| o.on_key(key(*c))).collect()
}

fn typed(o: &mut Onboarding, text: &str) {
    for c in text.chars() {
        o.on_key(key(KeyCode::Char(c)));
    }
}

fn screen(o: &Onboarding) -> String {
    let mut t = Terminal::new(TestBackend::new(90, 26)).unwrap();
    t.draw(|f| o.render(f, Theme::new(false))).unwrap();
    let buffer = t.backend().buffer().clone();
    buffer
        .content()
        .iter()
        .map(ratatui::buffer::Cell::symbol)
        .collect()
}

/// Welcome, then "Where do tasks come from today?" with Linear (second row) picked.
fn at_where_with_linear() -> Onboarding {
    let mut o = Onboarding::new(setup(&[]));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Where);
    press(&mut o, &[KeyCode::Down, KeyCode::Char(' ')]);
    o
}

#[test]
fn it_starts_by_asking_where_work_lives() {
    let o = at_where_with_linear();
    let text = screen(&o);
    assert!(text.contains("Where do tasks come from today?"), "{text}");
    assert!(text.contains("Nowhere in particular"), "{text}");
}

#[test]
fn nowhere_in_particular_goes_straight_to_the_agent() {
    let mut o = Onboarding::new(setup(&[]));
    o.on_key(key(KeyCode::Enter));
    for _ in 0..SourceKind::CONNECTABLE.len() {
        o.on_key(key(KeyCode::Down));
    }
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Agent);
}

#[test]
fn a_chosen_source_is_connected_with_its_secret_kept_off_the_screen() {
    let mut o = at_where_with_linear();
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Connect);
    typed(&mut o, SECRET);
    let text = screen(&o);
    assert!(!text.contains(SECRET), "{text}");
    assert!(text.contains("API key"), "{text}");
    o.on_key(key(KeyCode::Enter));
    typed(&mut o, "ENG");
    let actions = o.on_key(key(KeyCode::Enter));
    assert_eq!(
        actions,
        [Action::Connect {
            kind: SourceKind::Linear,
            values: BTreeMap::from([
                ("team".to_owned(), "ENG".to_owned()),
                ("token".to_owned(), SECRET.to_owned()),
            ]),
        }]
    );

    o.set_setup(setup(&[SourceKind::Linear]));
    assert_eq!(o.step(), Step::Moves, "every chosen source is connected");
    assert!(screen(&o).contains("Add the label shep in Linear"));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Agent);
}

#[test]
fn a_failed_connection_says_why_and_asks_again() {
    let mut o = at_where_with_linear();
    o.on_key(key(KeyCode::Enter));
    typed(&mut o, "wrong");
    press(&mut o, &[KeyCode::Enter, KeyCode::Enter]);
    o.failed("Linear answered 401: Authentication required");
    assert_eq!(o.step(), Step::Connect);
    assert!(o.notice().unwrap().contains("401"));
    typed(&mut o, SECRET);
    let actions = press(&mut o, &[KeyCode::Enter, KeyCode::Enter]);
    assert!(matches!(&actions[..], [Action::Connect { values, .. }] if values["token"] == SECRET));
}

#[test]
fn first_tasks_come_from_the_sources_and_several_can_go_tonight() {
    let mut o = Onboarding::new(setup(&[SourceKind::Linear]));
    o.on_key(key(KeyCode::Enter));
    press(&mut o, &[KeyCode::Down, KeyCode::Char(' '), KeyCode::Enter]);
    assert_eq!(o.step(), Step::Moves, "already connected");
    press(&mut o, &[KeyCode::Enter, KeyCode::Enter]);
    assert_eq!(o.step(), Step::GitHub);
    press(&mut o, &[KeyCode::Enter]);
    assert_eq!(o.step(), Step::Repo);
    o.on_key(key(KeyCode::Enter));
    typed(&mut o, "/code/app");
    o.on_key(key(KeyCode::Enter));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::FirstTask);
    let text = screen(&o);
    assert!(
        text.contains("ENG-342 Invoice dates use the wrong timezone"),
        "{text}"
    );
    assert!(text.contains("too vague"), "{text}");

    assert_eq!(
        press(&mut o, &[KeyCode::Char(' '), KeyCode::Char('t')]),
        [Action::Queue(vec![
            "https://linear.app/acme/issue/ENG-342".into()
        ])]
    );
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::Start(
            "https://linear.app/acme/issue/ENG-342".into()
        )]
    );
}
