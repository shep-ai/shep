//! Connected sources: connecting and disconnecting them, what they offer as first tasks, and
//! turning work handed over there into a task.

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use shep_domain::{EventKind, SourceKind, SourceSetting, Task, TaskEvent};

use crate::ports::{HandOver, Prefill, SourceForm, TaskSource};
use crate::view::{Candidate, SourceStatus};
use crate::{AppError, Shep};

/// A connected source's kind and its adapter.
pub(crate) type Connected = (SourceKind, Arc<dyn TaskSource>);

/// A first task needs at least this many words of title and description together.
const CLEAR_ENOUGH_WORDS: usize = 12;

impl Shep {
    pub(crate) fn source_statuses(&self) -> Result<Vec<SourceStatus>, AppError> {
        let settings = self.ports().settings.load_settings()?;
        Ok(SourceKind::CONNECTABLE
            .into_iter()
            .map(|kind| self.status(kind, settings.source(kind)))
            .collect())
    }

    fn status(&self, kind: SourceKind, setting: Option<&SourceSetting>) -> SourceStatus {
        let problem = setting.and_then(|s| {
            self.ports()
                .sources
                .source(s)
                .and_then(|source| source.connection())
                .err()
                .map(|e| e.0)
        });
        SourceStatus {
            kind,
            name: kind.display_name().into(),
            connected: setting.is_some(),
            account: setting.map(|s| s.account.clone()).unwrap_or_default(),
            problem,
            form: self.filled_form(kind),
        }
    }

    /// The source's form, with the values Shep can find itself already in.
    fn filled_form(&self, kind: SourceKind) -> SourceForm {
        let mut form = self.ports().sources.form(kind);
        for field in &mut form.fields {
            field.value = match field.prefill {
                Some(Prefill::RepositorySlug) => self.repository_slug(),
                None => None,
            };
        }
        form
    }

    /// `owner/name` of the repository Shep works in, when it is on GitHub.
    fn repository_slug(&self) -> Option<String> {
        let repo = self.ports().settings.load_settings().ok()?.repo?;
        self.ports().git.describe(Path::new(&repo)).ok()?.slug
    }

    pub(crate) fn connect_to(
        &self,
        kind: SourceKind,
        values: &BTreeMap<String, String>,
    ) -> Result<SourceStatus, AppError> {
        let mut values = values.clone();
        for field in self.filled_form(kind).fields {
            let empty = values.get(&field.key).is_none_or(|v| v.trim().is_empty());
            if let (true, Some(value)) = (empty, field.value) {
                values.insert(field.key, value);
            }
        }
        let setting = self.ports().sources.connect(kind, &values)?;
        let _guard = self.lock()?;
        let mut settings = self.ports().settings.load_settings()?;
        settings.connect(setting.clone());
        self.ports().settings.save_settings(&settings)?;
        Ok(self.status(kind, Some(&setting)))
    }

    pub(crate) fn disconnect_from(&self, kind: SourceKind) -> Result<(), AppError> {
        self.ports().sources.disconnect(kind)?;
        let _guard = self.lock()?;
        let mut settings = self.ports().settings.load_settings()?;
        if settings.disconnect(kind) {
            self.ports().settings.save_settings(&settings)?;
        }
        Ok(())
    }

    pub(crate) fn source_candidates(&self, limit: usize) -> Result<Vec<Candidate>, AppError> {
        let mut found = Vec::new();
        for (kind, source) in self.connected_sources()? {
            // One source being down does not hide what the others offer.
            let Ok(items) = source.candidates(limit) else {
                continue;
            };
            found.extend(items.into_iter().map(|item| Candidate {
                kind,
                vague: vague(&item),
                item,
            }));
        }
        Ok(found)
    }

    /// The adapters of every connected source.
    pub(crate) fn connected_sources(&self) -> Result<Vec<Connected>, AppError> {
        let settings = self.ports().settings.load_settings()?;
        Ok(settings
            .sources
            .iter()
            .filter_map(|s| {
                let source = self.ports().sources.source(s).ok()?;
                Some((s.kind, source))
            })
            .collect())
    }

    /// The adapter for where this task came from, when that source is connected.
    pub(crate) fn source_of(&self, task: &Task) -> Option<Arc<dyn TaskSource>> {
        let settings = self.ports().settings.load_settings().ok()?;
        let setting = settings.source(task.source.kind())?;
        self.ports().sources.source(setting).ok()
    }

    /// A task for work handed over in a source, unless Shep ever had a task for it (merged
    /// work keeps its label, so it is handed over again on every poll).
    pub(crate) fn take_hand_over(&self, item: &HandOver) -> Result<Option<Task>, AppError> {
        let _guard = self.lock()?;
        let ports = self.ports();
        if ports.tasks.list()?.iter().any(|t| t.source == item.source) {
            return Ok(None);
        }
        let now = ports.clock.now();
        let mut task = ports.tasks.create(item.source.clone(), now)?;
        if !item.title.trim().is_empty() {
            item.title.trim().clone_into(&mut task.title);
            ports.tasks.save(&task)?;
        }
        ports.events.record(&TaskEvent {
            task_id: task.id,
            at: now,
            kind: EventKind::HandedOver,
            detail: item.url.clone(),
        })?;
        Ok(Some(task))
    }
}

fn vague(item: &HandOver) -> bool {
    let words = item.title.split_whitespace().count() + item.body.split_whitespace().count();
    words < CLEAR_ENOUGH_WORDS
}
