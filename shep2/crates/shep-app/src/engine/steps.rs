//! Prepare, publish, watch CI and complete: everything around the agent's work.

use std::path::PathBuf;

use shep_domain::{
    check_push, AgentJob, CiVerdict, EventKind, Run, RunStep, Task, TaskBranch, UnixTime,
    MAX_CI_FIXES, TASK_BRANCH_PREFIX,
};

use super::agent::worktree;
use super::paths::{with_extension, TaskPaths};
use super::pr_body::{self, Proof};
use super::{Engine, Flow, StepError, StepResult};

const TEXT_PROOF: [&str; 3] = ["txt", "log", "md"];
const IMAGE_PROOF: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];
const NO_REVIEW: &str = "The reviewer gave no opinion.";
const SECS_PER_MINUTE: i64 = 60;

/// A person answered or sent the work back: start another pass on the same worktree.
pub(super) fn begin_pass(run: &mut Run, now: UnixTime) {
    if run.worktree.is_none() {
        run.advance(RunStep::Prepare, now);
        return;
    }
    let job = if run.step == RunStep::Done {
        AgentJob::Revise
    } else {
        AgentJob::Answer
    };
    run.ci_fixes = 0;
    run.advance(
        RunStep::Agent {
            job,
            session: None,
            interrupted: false,
        },
        now,
    );
}

impl Engine {
    /// Reads the source (title and text), then makes the task's worktree from origin.
    pub(super) fn prepare(&self, task: &Task, run: &mut Run) -> StepResult {
        let repo = self.repo()?;
        let paths = TaskPaths::new(self.task_dir(task)?);
        let issue = self
            .ports
            .forge
            .issue(&repo, &task.source)
            .map_err(|e| StepError::new("read the issue", e))?;
        let mut title = task.title.clone();
        if let Some(issue) = issue {
            if issue.title != task.title {
                title = self.shep.retitle(task.id, &issue.title)?.title;
            }
            let text = format!("{}\n\n{}", issue.url, issue.body);
            self.ports
                .files
                .write(&paths.issue(), &text)
                .map_err(|e| StepError::new("save the issue", e))?;
        }
        let branch = TaskBranch::for_task(task.id, &title);
        let worktree = self
            .ports
            .git
            .prepare_worktree(&repo, &branch)
            .map_err(|e| StepError::new("make the worktree", e))?;
        self.event(task.id, EventKind::WorktreeReady, &worktree.path);
        run.worktree = Some(worktree);
        run.advance(
            RunStep::Agent {
                job: AgentJob::Code,
                session: None,
                interrupted: false,
            },
            self.now(),
        );
        Ok(Flow::Next)
    }

    /// Pushes the task branch and opens the draft pull request the first time.
    pub(super) fn publish(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        check_push(worktree.branch.as_str(), &worktree.base)
            .map_err(|e| StepError::new("push", e))?;
        self.ports
            .git
            .push(&worktree)
            .map_err(|e| StepError::new("push the branch", e))?;
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

    /// Green (or no CI) goes on to the second opinion; red goes back to the agent, up to
    /// three times; CI that never finishes needs a person.
    pub(super) fn watch_ci(&self, task: &Task, run: &mut Run, since: UnixTime) -> StepResult {
        let now = self.now();
        if run
            .checked_at
            .is_some_and(|at| now.0 - at.0 < self.config.ci_poll_secs)
        {
            return Ok(Flow::Wait);
        }
        let worktree = worktree(run)?;
        let pr = task
            .pr
            .clone()
            .ok_or_else(|| StepError::new("watch CI", "the task has no pull request"))?;
        let checks = self
            .ports
            .forge
            .checks(&worktree, &pr)
            .map_err(|e| StepError::new("read CI", e))?;
        run.checked_at = Some(now);
        let waited = now.0 - since.0;
        match CiVerdict::of(&checks) {
            CiVerdict::Green => {
                self.event(task.id, EventKind::CiGreen, "all checks pass");
                Ok(self.to_review(run))
            }
            CiVerdict::None if waited >= self.config.ci_no_checks_grace_secs => {
                self.event(task.id, EventKind::NoCi, "no CI checks ran");
                Ok(self.to_review(run))
            }
            CiVerdict::Pending if waited > self.config.ci_timeout_secs => Ok(self.ask(
                task,
                run,
                &format!(
                    "CI has not finished after {} minutes. Look at the pull request's checks?",
                    self.config.ci_timeout_secs / SECS_PER_MINUTE
                ),
            )),
            CiVerdict::None | CiVerdict::Pending => Ok(Flow::Wait),
            CiVerdict::Red(names) => {
                let failed = names.join(", ");
                self.event(task.id, EventKind::CiFailed, &format!("{failed} failed"));
                if run.ci_fixes >= MAX_CI_FIXES {
                    return Ok(self.ask(
                        task,
                        run,
                        &format!(
                            "CI is still red after {MAX_CI_FIXES} fixes: {failed}. The branch and \
                             the CI logs are kept. How should the agent go on?"
                        ),
                    ));
                }
                run.ci_fixes += 1;
                let paths = TaskPaths::new(self.task_dir(task)?);
                if let Some(check) = checks.iter().find(|c| names.contains(&c.name)) {
                    let log = self
                        .ports
                        .forge
                        .failed_log(&worktree, check)
                        .unwrap_or_else(|e| format!("(the log could not be read: {e})"));
                    let _ = self.ports.files.write(&paths.ci_log(run.ci_fixes), &log);
                }
                run.advance(
                    RunStep::Agent {
                        job: AgentJob::FixCi {
                            attempt: run.ci_fixes,
                            checks: names,
                        },
                        session: None,
                        interrupted: false,
                    },
                    now,
                );
                Ok(Flow::Next)
            }
        }
    }

    fn to_review(&self, run: &mut Run) -> Flow {
        run.advance(
            RunStep::Agent {
                job: AgentJob::Review,
                session: None,
                interrupted: false,
            },
            self.now(),
        );
        Flow::Next
    }

    /// The reviewer is done: put the proof and the second opinion on the pull request, and the
    /// task is Ready.
    pub(super) fn complete(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        let paths = TaskPaths::new(self.task_dir(task)?);
        let review = self
            .ports
            .files
            .read(&paths.review())
            .map(|r| r.trim().to_owned())
            .filter(|r| !r.is_empty())
            .unwrap_or_else(|| NO_REVIEW.to_owned());
        self.event(task.id, EventKind::Reviewed, &review);
        run.review = Some(review.clone());
        let pr = task
            .pr
            .clone()
            .ok_or_else(|| StepError::new("update the pull request", "it is missing"))?;
        let proof = self.proof(task, &paths, &worktree, &pr.url);
        let events = self.ports.events.events(task.id).unwrap_or_default();
        let body = pr_body::ready(&pr_body::Ready {
            task,
            diff_stat: &self.ports.git.diff_stat(&worktree).unwrap_or_default(),
            agent: self.agent_name(),
            review: &review,
            proof: &proof,
            events: &events,
            utc_offset: self.ports.clock.utc_offset(),
        });
        self.ports
            .forge
            .update_body(&worktree, &pr, &body)
            .map_err(|e| StepError::new("update the pull request", e))?;
        self.shep.finish(task.id)?;
        self.event(task.id, EventKind::Ready, &pr.url);
        run.advance(RunStep::Done, self.now());
        Ok(Flow::Wait)
    }

    /// Test output from the proof folder, and screenshots published on a branch of their own
    /// so they never enter the task's diff.
    fn proof(
        &self,
        task: &Task,
        paths: &TaskPaths,
        worktree: &shep_domain::Worktree,
        pr_url: &str,
    ) -> Proof {
        let files = self.ports.files.list(&paths.proof_dir());
        let texts: Vec<(String, String)> = with_extension(&files, &TEXT_PROOF)
            .filter_map(|p| Some((super::paths::file_name(p), self.ports.files.read(p)?)))
            .collect();
        let images: Vec<PathBuf> = with_extension(&files, &IMAGE_PROOF).cloned().collect();
        let mut proof = Proof {
            texts,
            images: Vec::new(),
            images_kept_at: None,
        };
        if images.is_empty() {
            return proof;
        }
        let branch = format!("{TASK_BRANCH_PREFIX}proof/{}", task.id);
        match self.ports.git.publish_files(worktree, &branch, &images) {
            Ok(commit) => {
                proof.images = images
                    .iter()
                    .map(|p| {
                        let name = super::paths::file_name(p);
                        let url = pr_body::blob_url(pr_url, &commit, &name);
                        (name, url)
                    })
                    .collect();
            }
            Err(e) => {
                self.event(
                    task.id,
                    EventKind::StepFailed,
                    &format!("could not publish screenshots: {e}"),
                );
                proof.images_kept_at = Some(paths.proof_dir());
            }
        }
        proof
    }

    fn agent_name(&self) -> Option<&'static str> {
        self.ports
            .settings
            .load_settings()
            .ok()
            .and_then(|s| s.agent)
            .map(shep_domain::AgentKind::cli_name)
    }
}
