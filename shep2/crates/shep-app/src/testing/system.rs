use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use shep_domain::TaskId;

use super::lock;
use crate::ports::{FilesError, KeepAwake, TaskFiles};

/// Files in memory; a task's folder is `/tasks/<id>`.
#[derive(Default)]
pub struct MemoryFiles(Mutex<BTreeMap<PathBuf, String>>);

impl MemoryFiles {
    pub fn put(&self, path: impl Into<PathBuf>, text: &str) {
        lock(&self.0).insert(path.into(), text.to_owned());
    }
    pub fn get(&self, path: impl AsRef<Path>) -> Option<String> {
        lock(&self.0).get(path.as_ref()).cloned()
    }
}

impl TaskFiles for MemoryFiles {
    fn task_dir(&self, task: TaskId) -> Result<PathBuf, FilesError> {
        Ok(PathBuf::from(format!("/tasks/{task}")))
    }
    fn read(&self, path: &Path) -> Option<String> {
        self.get(path)
    }
    fn write(&self, path: &Path, text: &str) -> Result<(), FilesError> {
        self.put(path, text);
        Ok(())
    }
    fn remove(&self, path: &Path) {
        lock(&self.0).remove(path);
    }
    fn list(&self, dir: &Path) -> Vec<PathBuf> {
        lock(&self.0)
            .keys()
            .filter(|p| p.parent() == Some(dir))
            .cloned()
            .collect()
    }
}

#[derive(Default)]
pub struct FakeAwake {
    held: AtomicBool,
    holds: AtomicU32,
}

impl FakeAwake {
    pub fn is_held(&self) -> bool {
        self.held.load(Ordering::SeqCst)
    }
    /// How many times a hold actually started (not repeated holds).
    pub fn holds(&self) -> u32 {
        self.holds.load(Ordering::SeqCst)
    }
}

impl KeepAwake for FakeAwake {
    fn hold(&self) {
        if !self.held.swap(true, Ordering::SeqCst) {
            self.holds.fetch_add(1, Ordering::SeqCst);
        }
    }
    fn release(&self) {
        self.held.store(false, Ordering::SeqCst);
    }
}
