use std::path::{Path, PathBuf};

use shep_app::ports::{FilesError, TaskFiles};
use shep_domain::TaskId;

/// Each task's folder under `$SHEP_HOME/shep2/tasks/<id>`.
pub struct FsTaskFiles {
    root: PathBuf,
}

impl FsTaskFiles {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }
}

fn err(e: impl std::fmt::Display) -> FilesError {
    FilesError(e.to_string())
}

impl TaskFiles for FsTaskFiles {
    fn task_dir(&self, task: TaskId) -> Result<PathBuf, FilesError> {
        let dir = self.root.join(task.to_string());
        std::fs::create_dir_all(&dir).map_err(err)?;
        Ok(dir)
    }

    fn read(&self, path: &Path) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }

    fn write(&self, path: &Path, text: &str) -> Result<(), FilesError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        std::fs::write(path, text).map_err(err)
    }

    fn remove(&self, path: &Path) {
        let _ = std::fs::remove_file(path);
    }

    fn list(&self, dir: &Path) -> Vec<PathBuf> {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return Vec::new();
        };
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        files.sort();
        files
    }
}
