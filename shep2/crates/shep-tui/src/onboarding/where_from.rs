//! The first questions: where work lives, connecting those sources, and the moves that hand
//! work over in them.

use std::collections::BTreeMap;

use crossterm::event::{KeyCode, KeyEvent};
use shep_domain::SourceKind;

use super::{Action, Onboarding, Step};

/// The source being connected: which field is being filled, and what was typed so far.
#[derive(Debug, Clone, Default)]
pub(super) struct Form {
    pub kind: Option<SourceKind>,
    pub field: usize,
    pub values: BTreeMap<String, String>,
}

impl Onboarding {
    /// Whether the daemon reported sources at all (an older one does not).
    pub(super) fn has_sources(&self) -> bool {
        !self.setup.sources.is_empty()
    }

    /// The row after the sources: "Nowhere in particular, I'll just tell Shep".
    pub(super) fn nowhere_row(&self) -> usize {
        self.setup.sources.len()
    }

    pub(super) fn on_where_key(&mut self, key: KeyEvent) -> Vec<Action> {
        match key.code {
            KeyCode::Char(' ') if self.cursor < self.nowhere_row() => {
                let kind = self.setup.sources[self.cursor].kind;
                if let Some(at) = self.chosen.iter().position(|k| *k == kind) {
                    self.chosen.remove(at);
                } else {
                    self.chosen.push(kind);
                }
            }
            KeyCode::Enter if self.cursor >= self.nowhere_row() => {
                self.chosen.clear();
                self.go(Step::Agent);
            }
            KeyCode::Enter => {
                if self.chosen.is_empty() {
                    self.chosen.push(self.setup.sources[self.cursor].kind);
                }
                self.connect_next();
            }
            _ => {}
        }
        Vec::new()
    }

    /// Opens the form of the first chosen source that is not connected yet, or moves on.
    pub(super) fn connect_next(&mut self) {
        let next = self.chosen.iter().copied().find(|kind| {
            self.setup
                .sources
                .iter()
                .any(|s| s.kind == *kind && !s.connected)
        });
        match next {
            Some(kind) => {
                let notice = self.notice.take();
                self.go(Step::Connect);
                self.notice = notice;
                self.form = Form {
                    kind: Some(kind),
                    ..Form::default()
                };
                self.typing = true;
            }
            None => self.go(Step::Moves),
        }
    }

    pub(super) fn on_connect_key(&mut self, key: KeyEvent) -> Vec<Action> {
        let Some(kind) = self.form.kind else {
            return Vec::new();
        };
        let Some(source) = self.setup.sources.iter().find(|s| s.kind == kind) else {
            return Vec::new();
        };
        let fields = source.form.fields.clone();
        match key.code {
            KeyCode::Char(c) => self.text.push(c),
            KeyCode::Backspace => {
                self.text.pop();
            }
            KeyCode::Enter => {
                let Some(field) = fields.get(self.form.field) else {
                    return Vec::new();
                };
                let value = self.text.trim().to_owned();
                if value.is_empty() && !field.optional {
                    self.notice = Some(format!("{} is needed to connect.", field.label));
                    return Vec::new();
                }
                self.notice = None;
                if !value.is_empty() {
                    self.form.values.insert(field.key.clone(), value);
                }
                self.text.clear();
                self.form.field += 1;
                if self.form.field >= fields.len() {
                    let values = std::mem::take(&mut self.form.values);
                    self.form.field = 0;
                    return vec![Action::Connect { kind, values }];
                }
            }
            _ => {}
        }
        Vec::new()
    }

    /// The runner could not connect: say why and ask for the values again.
    pub fn failed(&mut self, why: &str) {
        self.notice = Some(why.to_owned());
        self.text.clear();
        self.form.field = 0;
        self.form.values.clear();
    }
}
