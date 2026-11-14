//! What each onboarding step shows: one centred card per step.

use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

use super::{Onboarding, Step};
use crate::splash::WORDMARK;
use crate::theme::Theme;

const CARD_WIDTH: u16 = 72;
const CARD_HEIGHT: u16 = 22;
pub(super) const GH_LOGIN: &str = "gh auth login --web";

pub(super) type Card = (&'static str, Vec<Line<'static>>);

pub(super) fn text(t: Theme, s: &str) -> Line<'static> {
    Line::from(Span::styled(s.to_owned(), t.text()))
}
pub(super) fn muted(t: Theme, s: &str) -> Line<'static> {
    Line::from(Span::styled(s.to_owned(), t.muted()))
}
pub(super) fn hint(t: Theme, s: &str) -> Line<'static> {
    Line::from(Span::styled(s.to_owned(), t.accent()))
}
pub(super) fn check(t: Theme, ok: bool, words: String) -> Line<'static> {
    let (mark, style) = if ok {
        ("✓ ", t.ready())
    } else {
        ("✗ ", t.needs_you())
    };
    Line::from(vec![
        Span::styled(mark, style),
        Span::styled(words, t.text()),
    ])
}

impl Onboarding {
    pub fn render(&self, f: &mut Frame, t: Theme) {
        let area = f.area();
        f.render_widget(Block::new().style(t.base()), area);
        let card = centered(area, CARD_WIDTH, CARD_HEIGHT);
        let (title, mut lines) = self.card(t);
        if let Some(n) = &self.notice {
            lines.push(Line::default());
            lines.push(Line::from(Span::styled(n.clone(), t.needs_you())));
        }
        let block = Block::new()
            .borders(Borders::ALL)
            .border_style(t.border())
            .title(Span::styled(format!(" {title} "), t.muted()));
        f.render_widget(
            Paragraph::new(lines)
                .wrap(Wrap { trim: false })
                .block(block),
            card,
        );
    }

    fn card(&self, t: Theme) -> Card {
        match self.step {
            Step::Welcome => welcome(t),
            Step::Where => self.where_card(t),
            Step::Connect => self.connect_card(t),
            Step::Moves => self.moves_card(t),
            Step::Agent => self.agent(t),
            Step::GitHub => self.github(t),
            Step::Repo => self.repo(t),
            Step::When => self.when(t),
            Step::FirstTask => self.first_task(t),
        }
    }

    pub(super) fn pick(
        &self,
        t: Theme,
        i: usize,
        text: &str,
        note: Span<'static>,
    ) -> Line<'static> {
        let selected = i == self.cursor && !self.typing;
        let marker = if selected { "› " } else { "  " };
        let line = Line::from(vec![
            Span::styled(format!("{marker}{text}"), t.text()),
            note,
        ]);
        if selected {
            line.style(t.selected())
        } else {
            line
        }
    }

    fn agent(&self, t: Theme) -> Card {
        let mut lines = vec![text(t, "Which agent should do the work?"), Line::default()];
        for (i, a) in self.setup.agents.iter().enumerate() {
            let note = if a.installed {
                Span::styled("  found", t.ready())
            } else {
                Span::styled("  not installed", t.muted())
            };
            lines.push(self.pick(t, i, &format!("{:<14}", a.name), note));
        }
        lines.extend([
            Line::default(),
            muted(
                t,
                "Shep runs the CLI you already use, with your login. It never stores your keys.",
            ),
            Line::default(),
            hint(t, "enter use it   ↑↓ choose   r check again"),
        ]);
        ("pick the agent", lines)
    }

    fn github(&self, t: Theme) -> Card {
        let lines = match &self.setup.github {
            Some(login) => vec![
                check(t, true, format!("signed in as @{login}")),
                check(t, true, "can read issues and open pull requests".into()),
                Line::default(),
                hint(t, "enter continue"),
            ],
            None => vec![
                check(t, false, "GitHub isn't signed in.".into()),
                muted(
                    t,
                    "Shep reads issues and opens draft PRs through the gh CLI.",
                ),
                Line::default(),
                Line::from(vec![
                    Span::styled("$ ", t.muted()),
                    Span::styled(GH_LOGIN, t.text()),
                ]),
                muted(t, "Run it in another terminal (it opens your browser)."),
                Line::default(),
                hint(t, "r check again"),
            ],
        };
        ("sign in to GitHub", lines)
    }

    fn repo(&self, t: Theme) -> Card {
        let mut lines = Vec::new();
        if let Some(repo) = &self.setup.repo {
            let name = repo.slug.clone().unwrap_or_else(|| repo.path.clone());
            lines.push(Line::from(vec![
                Span::styled("This folder is ", t.text()),
                Span::styled(name.clone(), t.accent()),
            ]));
            lines.push(Line::default());
            lines.push(self.pick(t, 0, &format!("use {name}"), Span::raw("")));
            lines.push(self.pick(t, 1, "choose another repository", Span::raw("")));
            lines.push(Line::default());
            let (mark, words, style) = if repo.clean {
                ("✓ ", "working tree clean", t.ready())
            } else {
                (
                    "! ",
                    "uncommitted changes stay untouched: every task gets its own worktree",
                    t.accent(),
                )
            };
            lines.push(Line::from(vec![
                Span::styled(mark, style),
                Span::styled(words, t.text()),
            ]));
        } else {
            lines.push(text(t, "Which repository should Shep work in?"));
        }
        if self.typing {
            lines.push(Line::default());
            lines.push(Line::from(vec![
                Span::styled("path: ", t.muted()),
                Span::styled(format!("{}▏", self.text), t.text()),
            ]));
        }
        ("confirm the repository", lines)
    }

    fn when(&self, t: Theme) -> Card {
        let at = self.setup.settings.shift_start;
        let awake = if self.keep_awake { "Y/n" } else { "y/N" };
        let lines = vec![
            text(t, "When should Shep work on your tasks?"),
            Line::default(),
            self.pick(t, 0, &format!("every night at {at}"), Span::raw("")),
            self.pick(t, 1, "only when I run shep go", Span::raw("")),
            Line::default(),
            Line::from(vec![
                Span::styled("Keep this machine awake during a shift? ", t.text()),
                Span::styled(awake, t.accent()),
            ]),
            muted(t, "On a Mac, only while it is plugged in."),
            Line::default(),
            Line::from(vec![
                Span::styled("Tasks in parallel ", t.text()),
                Span::styled(self.parallel.to_string(), t.accent()),
                Span::styled("  (← → to change)", t.muted()),
            ]),
            Line::default(),
            muted(t, "Change any of this later with shep config."),
        ];
        ("when to work", lines)
    }

    fn first_task(&self, t: Theme) -> Card {
        let mut lines = vec![text(t, "Good candidates for tonight:"), Line::default()];
        let mark = |row: usize| {
            if self.picked.contains(&row) {
                "✓ "
            } else {
                "  "
            }
        };
        for (i, c) in self.setup.candidates.iter().enumerate() {
            let note = if c.vague {
                Span::styled("  too vague", t.needs_you())
            } else {
                Span::raw("")
            };
            let label = format!(
                "{}{} {} {}",
                mark(i),
                c.kind.cli_name().to_ascii_uppercase(),
                c.item.source,
                c.item.title
            );
            lines.push(self.pick(t, i, &label, note));
        }
        let offset = self.setup.candidates.len();
        for (i, s) in self.setup.suggestions.iter().enumerate() {
            let label = format!("{}#{} {}", mark(offset + i), s.number, s.title);
            lines.push(self.pick(t, offset + i, &label, Span::raw("")));
        }
        if offset + self.setup.suggestions.len() == 0 {
            lines.push(muted(t, "No open issues found."));
        }
        lines.extend([
            Line::default(),
            muted(t, "small, clear issues work best first"),
            Line::default(),
            Line::from(vec![
                Span::styled("or describe one: ", t.text()),
                Span::styled(format!("{}▏", self.text), t.accent()),
            ]),
            Line::default(),
            hint(
                t,
                "enter start it now   space pick   t hand the picked ones over tonight",
            ),
        ]);
        ("first task, right now", lines)
    }
}

fn welcome(t: Theme) -> Card {
    let mut lines: Vec<Line> = WORDMARK.iter().map(|l| hint(t, l)).collect();
    lines.extend([
        Line::default(),
        muted(t, "first run · let's get you one pull request"),
        Line::default(),
        hint(t, "press any key"),
    ]);
    ("welcome", lines)
}

fn centered(area: Rect, width: u16, height: u16) -> Rect {
    let [_, v, _] = Layout::vertical([
        Constraint::Fill(1),
        Constraint::Length(height.min(area.height)),
        Constraint::Fill(1),
    ])
    .areas(area);
    let [_, h, _] = Layout::horizontal([
        Constraint::Fill(1),
        Constraint::Length(width.min(area.width)),
        Constraint::Fill(1),
    ])
    .areas(v);
    h
}
