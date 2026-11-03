use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use shep_domain::{Run, Settings, Task, TaskEvent, TaskId, TaskSourceRef, UnixTime};

use crate::ports::{EventLog, RunRepository};
use crate::{Clock, SettingsRepository, StoreError, TaskRepository};

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
    offset: AtomicI64,
}

impl ManualClock {
    pub fn fixed(at: i64) -> Self {
        Self {
            now: AtomicI64::new(at),
            step: 0,
            offset: AtomicI64::new(0),
        }
    }
    pub fn ticking(from: i64) -> Self {
        Self {
            now: AtomicI64::new(from),
            step: 1,
            offset: AtomicI64::new(0),
        }
    }
    pub fn advance(&self, secs: i64) {
        self.now.fetch_add(secs, Ordering::SeqCst);
    }
    pub fn set_utc_offset(&self, secs: i64) {
        self.offset.store(secs, Ordering::SeqCst);
    }
}

impl Clock for ManualClock {
    fn now(&self) -> UnixTime {
        UnixTime(self.now.fetch_add(self.step, Ordering::SeqCst))
    }
    fn utc_offset(&self) -> i64 {
        self.offset.load(Ordering::SeqCst)
    }
}

#[derive(Default)]
pub struct MemoryRuns(Mutex<Vec<Run>>);

impl RunRepository for MemoryRuns {
    fn load_run(&self, task: TaskId) -> Result<Option<Run>, StoreError> {
        let runs = self.0.lock().map_err(poisoned)?;
        Ok(runs.iter().find(|r| r.task_id == task).cloned())
    }
    fn save_run(&self, run: &Run) -> Result<(), StoreError> {
        let mut runs = self.0.lock().map_err(poisoned)?;
        runs.retain(|r| r.task_id != run.task_id);
        runs.push(run.clone());
        Ok(())
    }
}

#[derive(Default)]
pub struct MemoryEvents(Mutex<Vec<TaskEvent>>);

impl EventLog for MemoryEvents {
    fn record(&self, event: &TaskEvent) -> Result<(), StoreError> {
        self.0.lock().map_err(poisoned)?.push(event.clone());
        Ok(())
    }
    fn events(&self, task: TaskId) -> Result<Vec<TaskEvent>, StoreError> {
        let events = self.0.lock().map_err(poisoned)?;
        Ok(events
            .iter()
            .filter(|e| e.task_id == task)
            .cloned()
            .collect())
    }
}
