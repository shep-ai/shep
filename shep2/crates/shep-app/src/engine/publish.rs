//! From the coder's last word to a pushed branch: commit what it left, take the repository's
//! screenshots, bring in the base branch if it moved, push, and open the draft pull request.
//! A conflict with the moved base goes back to the coder once; then the task needs you.

use shep_domain::{
    check_push, AgentJob, EventKind, Run, RunStep, Task, Worktree, MAX_CONFLICT_FIXES,
};

use super::agent::worktree;
use super::pr_body;
use super::{Engine, Flow, StepError, StepResult};
use crate::ports::BaseUpdate;

/// Added lines that start with these are merge conflict markers left in a file.
const CONFLICT_MARKERS: [&str; 2] = ["<<<<<<< ", ">>>>>>> "];
/// The header naming the file a patch section changes.
const PATCH_NEW_FILE: &str = "+++ ";
const PATCH_NEW_PATH: &str = "+++ b/";
const PATCH_ADDED: char = '+';

impl Engine {
    /// Commits what the agent left, then takes screenshots and publishes, unless nothing
    /// changed at all.
    pub(super) fn after_work(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        let git = &self.ports.git;
        git.commit_all(&worktree, &task.title)
            .map_err(|e| StepError::new("commit the agent's work", e))?;
        let ahead = git
            .commits_ahead(&worktree)
            .map_err(|e| StepError::new("count the commits", e))?;
        if ahead == 0 {
            return Ok(self.ask(
                task,
                run,
                "The agent finished without changing anything. What should it do?",
            ));
        }
        let now = self.now();
        run.advance(
            RunStep::Screenshots {
                session: None,
                since: now,
            },
            now,
        );
        Ok(Flow::Next)
    }

    /// Brings the moved base branch in, pushes the task branch and opens the draft pull
    /// request the first time.
    pub(super) fn publish(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        check_push(worktree.branch.as_str(), &worktree.base)
            .map_err(|e| StepError::new("push", e))?;
        if let Some(files) = self.bring_in_base(task, run, &worktree)? {
            return Ok(self.conflict(task, run, &worktree, files));
        }
        self.ports
            .git
            .push(&worktree)
            .map_err(|e| StepError::new("push the branch", e))?;
        run.conflict_fixes = 0;
        if task.pr.is_none() {
            let stat = self.ports.git.diff_stat(&worktree).unwrap_or_default();
            let body = pr_body::draft(task, &stat, self.agent_name());
            let pr = self
                .ports
                .forge
                .open_draft(&worktree, &task.title, &body)
                .map_err(|e| StepError::new("open the draft pull request", e))?;
            self.event(task.id, EventKind::PrOpened, &pr.url);
            self.shep.set_pr(task.id, pr)?;
        } else {
            self.event(task.id, EventKind::Pushed, worktree.branch.as_str());
        }
        run.checked_at = None;
        run.advance(RunStep::WatchCi { since: self.now() }, self.now());
        Ok(Flow::Wait)
    }

    /// Merges `origin/<base>` in. Returns the files both sides changed when that conflicts,
    /// or when the agent's own merge left conflict markers behind.
    fn bring_in_base(
        &self,
        task: &Task,
        run: &Run,
        worktree: &Worktree,
    ) -> Result<Option<Vec<String>>, StepError> {
        let update = self
            .ports
            .git
            .update_from_base(worktree)
            .map_err(|e| StepError::new("merge the base branch in", e))?;
        match update {
            BaseUpdate::Conflict(files) => return Ok(Some(files)),
            BaseUpdate::Merged => {
                let detail = format!("merged origin/{} into the task branch", worktree.base);
                self.event(task.id, EventKind::BaseMerged, &detail);
            }
            BaseUpdate::UpToDate => {}
        }
        if run.conflict_fixes == 0 {
            return Ok(None);
        }
        let patch = self
            .ports
            .git
            .diff(worktree)
            .map_err(|e| StepError::new("read the diff", e))?;
        let files = leftover_markers(&patch);
        Ok((!files.is_empty()).then_some(files))
    }

    /// The coder merges it itself, once; after that the task needs you.
    fn conflict(
        &self,
        task: &Task,
        run: &mut Run,
        worktree: &Worktree,
        files: Vec<String>,
    ) -> Flow {
        if run.conflict_fixes >= MAX_CONFLICT_FIXES {
            return self.ask(
                task,
                run,
                &format!(
                    "Both sides changed {}: origin/{} moved and the agent could not merge it \
                     into the task branch. The branch is kept; how should it go on?",
                    files.join(", "),
                    worktree.base
                ),
            );
        }
        run.conflict_fixes += 1;
        run.advance(
            RunStep::Agent {
                job: AgentJob::ResolveConflict { files },
                session: None,
                interrupted: false,
            },
            self.now(),
        );
        Flow::Next
    }
}

/// The files a patch adds conflict markers to.
fn leftover_markers(patch: &str) -> Vec<String> {
    let mut files: Vec<String> = Vec::new();
    let mut current: Option<&str> = None;
    for line in patch.lines() {
        if line.starts_with(PATCH_NEW_FILE) {
            current = line.strip_prefix(PATCH_NEW_PATH);
            continue;
        }
        let Some(added) = line.strip_prefix(PATCH_ADDED) else {
            continue;
        };
        let marked = CONFLICT_MARKERS.iter().any(|m| added.starts_with(m));
        if let (true, Some(file)) = (marked, current) {
            if !files.iter().any(|f| f == file) {
                files.push(file.to_owned());
            }
        }
    }
    files
}
