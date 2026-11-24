//! The end of a task: merged by a person (its worktree and local branch go), or taken off the
//! board (its events stay).

use std::path::Path;

use shep_domain::{EventKind, Task, TaskEvent, TaskId};

use crate::{AppError, Shep};

impl Shep {
    /// Merges the task's pull request. Only ever on a person's Merge.
    pub(crate) fn merge(&self, task: &Task) -> Result<(), AppError> {
        let ports = self.ports();
        let (Some(pr), Some(repo)) = (&task.pr, ports.settings.load_settings()?.repo) else {
            return Ok(());
        };
        ports.forge.merge(Path::new(&repo), pr)?;
        Ok(())
    }

    /// After a merge the task's worktree and its local branch are not needed. The merge has
    /// happened either way, so a failure is recorded on the task rather than returned.
    pub(crate) fn clean_up(&self, task: &Task) {
        let ports = self.ports();
        let worktree = ports
            .runs
            .load_run(task.id)
            .ok()
            .flatten()
            .and_then(|r| r.worktree);
        let (Some(worktree), Ok(Some(repo))) =
            (worktree, ports.settings.load_settings().map(|s| s.repo))
        else {
            return;
        };
        let repo = Path::new(&repo);
        let removed = ports
            .git
            .remove_worktree(repo, &worktree)
            .and_then(|()| ports.git.delete_branch(repo, &worktree.branch));
        if let Err(e) = removed {
            let _ = ports.events.record(&TaskEvent {
                task_id: task.id,
                at: ports.clock.now(),
                kind: EventKind::StepFailed,
                detail: format!("could not remove the worktree after the merge: {e}"),
            });
        }
    }

    /// Takes a task off the board for good. Its events stay.
    pub fn remove(&self, id: TaskId) -> Result<(), AppError> {
        let _guard = self.lock()?;
        self.ports().tasks.delete(id)?;
        Ok(())
    }
}
