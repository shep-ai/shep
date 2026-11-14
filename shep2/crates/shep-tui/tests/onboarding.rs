use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use shep_app::{AgentOption, RepoFacts, Setup, Suggestion};
use shep_domain::{AgentKind, Settings};
use shep_tui::onboarding::{Action, Onboarding, Step};

fn setup(github: Option<&str>) -> Setup {
    let agent = |kind: AgentKind, installed| AgentOption {
        kind,
        name: kind.display_name().into(),
        installed,
        install: "npm install -g x".into(),
        chosen: false,
    };
    Setup {
        agents: vec![
            agent(AgentKind::ClaudeCode, true),
            agent(AgentKind::Codex, false),
            agent(AgentKind::Gemini, true),
        ],
        github: github.map(str::to_owned),
        repo: Some(RepoFacts {
            path: "/code/booking-app".into(),
            slug: Some("acme/booking-app".into()),
            clean: true,
        }),
        suggestions: vec![
            Suggestion {
                number: 412,
                title: "Fix login redirect loop".into(),
            },
            Suggestion {
                number: 418,
                title: "Add CSV export".into(),
            },
        ],
        settings: Settings::default(),
        ready: false,
    }
}

fn key(c: KeyCode) -> KeyEvent {
    KeyEvent::new(c, KeyModifiers::NONE)
}

fn typed(o: &mut Onboarding, text: &str) {
    for c in text.chars() {
        o.on_key(key(KeyCode::Char(c)));
    }
}

#[test]
fn the_happy_path_ends_in_a_started_task() {
    let mut o = Onboarding::new(setup(Some("ariel")));
    assert_eq!(o.step(), Step::Welcome);
    o.on_key(key(KeyCode::Char('x')));
    assert_eq!(o.step(), Step::Agent);
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::ChooseAgent(AgentKind::ClaudeCode)]
    );
    assert_eq!(o.step(), Step::GitHub);
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Repo);
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::When);
    o.on_key(key(KeyCode::Right));
    o.on_key(key(KeyCode::Char('n')));
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::Schedule {
            nightly: true,
            parallel: 4,
            keep_awake: false
        }]
    );
    assert_eq!(o.step(), Step::FirstTask);
    o.on_key(key(KeyCode::Down));
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::Start("#418".into())]
    );
}

#[test]
fn an_agent_that_is_not_installed_cannot_be_chosen() {
    let mut o = Onboarding::new(setup(Some("ariel")));
    o.on_key(key(KeyCode::Enter));
    o.on_key(key(KeyCode::Down));
    assert_eq!(o.on_key(key(KeyCode::Enter)), []);
    assert!(o.notice().unwrap().contains("npm install -g x"));
    assert_eq!(o.step(), Step::Agent);
    assert_eq!(o.on_key(key(KeyCode::Char('r'))), [Action::Recheck]);
}

#[test]
fn github_must_be_signed_in_to_go_on() {
    let mut o = Onboarding::new(setup(None));
    o.on_key(key(KeyCode::Enter));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::GitHub);
    assert_eq!(o.on_key(key(KeyCode::Enter)), []);
    assert_eq!(o.step(), Step::GitHub);
    assert_eq!(o.on_key(key(KeyCode::Char('r'))), [Action::Recheck]);
    o.set_setup(setup(Some("ariel")));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::Repo);
}

#[test]
fn another_repository_or_a_sentence_can_be_typed() {
    let mut o = Onboarding::new(setup(Some("ariel")));
    for _ in 0..3 {
        o.on_key(key(KeyCode::Enter));
    }
    assert_eq!(o.step(), Step::Repo);
    o.on_key(key(KeyCode::Down));
    o.on_key(key(KeyCode::Enter));
    typed(&mut o, "/code/other");
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::ChooseRepo("/code/other".into())]
    );
    o.on_key(key(KeyCode::Up));
    o.on_key(key(KeyCode::Enter));
    o.on_key(key(KeyCode::Enter));
    assert_eq!(o.step(), Step::FirstTask);
    typed(&mut o, "Fix the typo on the pricing page");
    assert_eq!(
        o.on_key(key(KeyCode::Enter)),
        [Action::Start("Fix the typo on the pricing page".into())]
    );
    assert_eq!(o.on_key(key(KeyCode::Esc)), [Action::Quit]);
}
