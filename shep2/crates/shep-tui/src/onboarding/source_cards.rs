//! The cards for where work lives: picking sources, connecting them, and the moves that hand
//! work over there.

use ratatui::text::{Line, Span};
use shep_app::SourceStatus;

use super::card::{check, hint, muted, text, Card};
use super::Onboarding;
use crate::theme::Theme;

/// Shown instead of each character of a secret.
const SECRET_DOT: char = '•';
const NOWHERE: &str = "Nowhere in particular, I'll just tell Shep";
const NAME_WIDTH: usize = 16;

impl Onboarding {
    pub(super) fn where_card(&self, t: Theme) -> Card {
        let mut lines = vec![
            text(t, "Where do tasks come from today?"),
            muted(t, "Pick all that apply. Shep fits into them."),
            Line::default(),
        ];
        for (i, s) in self.setup.sources.iter().enumerate() {
            let mark = if self.chosen.contains(&s.kind) {
                "✓ "
            } else {
                "  "
            };
            let note = if s.connected {
                Span::styled(format!("connected · {}", s.account), t.ready())
            } else {
                Span::raw("")
            };
            let label = format!("{mark}{:<NAME_WIDTH$}", s.name);
            lines.push(self.pick(t, i, &label, note));
        }
        lines.push(self.pick(
            t,
            self.nowhere_row(),
            &format!("  {NOWHERE}"),
            Span::raw(""),
        ));
        lines.extend([Line::default(), hint(t, "space pick   enter continue")]);
        ("where work lives", lines)
    }

    pub(super) fn connect_card(&self, t: Theme) -> Card {
        let Some(source) = self.connecting() else {
            return ("connect", Vec::new());
        };
        let mut lines = vec![
            text(t, &format!("Connect {}", source.name)),
            Line::default(),
        ];
        for (i, field) in source.form.fields.iter().enumerate() {
            let now = i == self.form.field;
            let value = if now {
                self.text.clone()
            } else {
                self.form
                    .values
                    .get(&field.key)
                    .cloned()
                    .unwrap_or_default()
            };
            let shown = if field.secret {
                SECRET_DOT.to_string().repeat(value.chars().count())
            } else {
                value
            };
            let cursor = if now { "▏" } else { "" };
            let optional = if field.optional { " (optional)" } else { "" };
            lines.push(Line::from(vec![
                Span::styled(format!("{}{optional}: ", field.label), t.text()),
                Span::styled(format!("{shown}{cursor}"), t.accent()),
            ]));
            if now && !field.hint.is_empty() {
                lines.push(muted(t, &format!("  {}", field.hint)));
            }
        }
        lines.extend([
            Line::default(),
            muted(
                t,
                "Tokens stay in this machine's keychain. Shep reads only what you hand it, and \
                 writes only replies, status changes and links.",
            ),
            Line::default(),
            hint(t, "enter next"),
        ]);
        ("connect them", lines)
    }

    pub(super) fn moves_card(&self, t: Theme) -> Card {
        let mut lines = vec![text(t, "Same moves you make today"), Line::default()];
        for source in self.chosen_sources() {
            lines.push(check(
                t,
                true,
                format!("{} · {}", source.name, source.account),
            ));
            for step in &source.form.hand_over {
                lines.push(muted(t, &format!("    {step}")));
            }
        }
        lines.extend([
            Line::default(),
            muted(
                t,
                "Shep replies in the same ticket or thread, and moves the status the way your \
                 team already does.",
            ),
            Line::default(),
            hint(t, "enter continue"),
        ]);
        ("how you'll hand work over", lines)
    }

    fn connecting(&self) -> Option<&SourceStatus> {
        let kind = self.form.kind?;
        self.setup.sources.iter().find(|s| s.kind == kind)
    }

    fn chosen_sources(&self) -> impl Iterator<Item = &SourceStatus> {
        self.setup
            .sources
            .iter()
            .filter(|s| self.chosen.contains(&s.kind))
    }
}
