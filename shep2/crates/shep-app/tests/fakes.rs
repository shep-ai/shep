use std::cell::{Cell, RefCell};

use shep_app::{Clock, SettingsRepository, StoreError, TaskRepository};
use shep_domain::{Settings, Task, TaskId, TaskSourceRef, UnixTime};

#[derive(Default)]
pub struct MemoryTasks {
    tasks: RefCell<Vec<Task>>,
}

impl TaskRepository for MemoryTasks {
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError> {
        let mut tasks = self.tasks.borrow_mut();
        let task = Task::new(TaskId(i64::try_from(tasks.len()).unwrap() + 1), source, now);
        tasks.push(task.clone());
        Ok(task)
    }
    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError> {
        Ok(self.tasks.borrow().iter().find(|t| t.id == id).cloned())
    }
    fn save(&self, task: &Task) -> Result<(), StoreError> {
        let mut tasks = self.tasks.borrow_mut();
        let slot = tasks
            .iter_mut()
            .find(|t| t.id == task.id)
            .ok_or_else(|| StoreError("missing".into()))?;
        *slot = task.clone();
        Ok(())
    }
    fn list(&self) -> Result<Vec<Task>, StoreError> {
        Ok(self.tasks.borrow().clone())
    }
}

#[derive(Default)]
pub struct MemorySettings(RefCell<Settings>);

impl SettingsRepository for MemorySettings {
    fn load_settings(&self) -> Result<Settings, StoreError> {
        Ok(self.0.borrow().clone())
    }
    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError> {
        *self.0.borrow_mut() = settings.clone();
        Ok(())
    }
}

/// A clock that moves one second every time it is read.
pub struct TickingClock(pub Cell<i64>);

impl Clock for TickingClock {
    fn now(&self) -> UnixTime {
        let t = self.0.get();
        self.0.set(t + 1);
        UnixTime(t)
    }
}
