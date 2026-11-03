//! In-memory fakes for every port. Enabled with the `testing` feature; used by this crate's
//! tests and by the surfaces' tests.

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};

use shep_domain::{Settings, Task, TaskId, TaskSourceRef, UnixTime};

use crate::{Clock, Ports, SettingsRepository, StoreError, TaskRepository};

fn poisoned<T>(_: T) -> StoreError {
    StoreError("fake store lock poisoned".into())
}

#[derive(Default)]
pub struct MemoryTasks {
    tasks: Mutex<Vec<Task>>,
}

impl TaskRepository for MemoryTasks {
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError> {
        let mut tasks = self.tasks.lock().map_err(poisoned)?;
        let next = i64::try_from(tasks.len()).map_err(|e| StoreError(e.to_string()))? + 1;
        let task = Task::new(TaskId(next), source, now);
        tasks.push(task.clone());
        Ok(task)
    }
    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError> {
        let tasks = self.tasks.lock().map_err(poisoned)?;
        Ok(tasks.iter().find(|t| t.id == id).cloned())
    }
    fn save(&self, task: &Task) -> Result<(), StoreError> {
        let mut tasks = self.tasks.lock().map_err(poisoned)?;
        let slot = tasks
            .iter_mut()
            .find(|t| t.id == task.id)
            .ok_or_else(|| StoreError(format!("no task {}", task.id)))?;
        *slot = task.clone();
        Ok(())
    }
    fn list(&self) -> Result<Vec<Task>, StoreError> {
        Ok(self.tasks.lock().map_err(poisoned)?.clone())
    }
}

#[derive(Default)]
pub struct MemorySettings(Mutex<Settings>);

impl SettingsRepository for MemorySettings {
    fn load_settings(&self) -> Result<Settings, StoreError> {
        Ok(self.0.lock().map_err(poisoned)?.clone())
    }
    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError> {
        *self.0.lock().map_err(poisoned)? = settings.clone();
        Ok(())
    }
}

/// A clock tests move by hand. `ticking` clocks also move one second on every read, so
/// successive changes get distinct, ordered timestamps.
pub struct ManualClock {
    now: AtomicI64,
    step: i64,
}

impl ManualClock {
    pub fn fixed(at: i64) -> Self {
        Self {
            now: AtomicI64::new(at),
            step: 0,
        }
    }
    pub fn ticking(from: i64) -> Self {
        Self {
            now: AtomicI64::new(from),
            step: 1,
        }
    }
    pub fn advance(&self, secs: i64) {
        self.now.fetch_add(secs, Ordering::SeqCst);
    }
}

impl Clock for ManualClock {
    fn now(&self) -> UnixTime {
        UnixTime(self.now.fetch_add(self.step, Ordering::SeqCst))
    }
}

/// One set of fakes, kept so a test can inspect them after handing [`Ports`] to the code.
pub struct Fakes {
    pub tasks: Arc<MemoryTasks>,
    pub settings: Arc<MemorySettings>,
    pub clock: Arc<ManualClock>,
}

impl Default for Fakes {
    fn default() -> Self {
        Self {
            tasks: Arc::default(),
            settings: Arc::default(),
            clock: Arc::new(ManualClock::ticking(1000)),
        }
    }
}

impl Fakes {
    pub fn ports(&self) -> Ports {
        Ports {
            tasks: self.tasks.clone(),
            settings: self.settings.clone(),
            clock: self.clock.clone(),
        }
    }
}
