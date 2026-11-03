//! What Shep asks the agent to do, for each kind of job. The words are the product: one
//! question at most, proof saved where Shep can find it, and no pushing.

use std::fmt::Write;
use std::path::Path;

use shep_domain::{AgentJob, Task, Worktree};

/// The environment every agent session gets, so tools and hooks can find Shep's files.
pub const AGENT_ENV_TASK: &str = "SHEP_TASK_ID";
pub const AGENT_ENV_QUESTION_FILE: &str = "SHEP_QUESTION_FILE";
pub const AGENT_ENV_PROOF_DIR: &str = "SHEP_PROOF_DIR";
pub const AGENT_ENV_REVIEW_FILE: &str = "SHEP_REVIEW_FILE";

/// Everything a prompt may mention.
pub struct PromptContext<'a> {
    pub task: &'a Task,
    /// The issue's text, when the task came from a tracker.
    pub details: Option<&'a str>,
    pub worktree: &'a Worktree,
    pub question_file: &'a Path,
    pub proof_dir: &'a Path,
    pub review_file: &'a Path,
    pub diff_file: &'a Path,
    /// The question asked before an answer, if any.
    pub asked: Option<&'a str>,
    /// The CI log for a fix.
    pub ci_log: Option<&'a Path>,
}

pub fn build(job: &AgentJob, interrupted: bool, c: &PromptContext<'_>) -> String {
    let mut prompt = String::new();
    if interrupted {
        prompt.push_str(
            "You were interrupted (a usage limit, a restart, or a crash). Continue where you \
             stopped; check what is already done before redoing it.\n\n",
        );
    }
    match job {
        AgentJob::Code => prompt.push_str(&code(c)),
        AgentJob::Answer => prompt.push_str(&answer(c)),
        AgentJob::Revise => prompt.push_str(&revise(c)),
        AgentJob::FixCi { attempt, checks } => prompt.push_str(&fix_ci(c, *attempt, checks)),
        AgentJob::Review => return review(c),
    }
    prompt.push_str(&rules(c));
    prompt
}

fn code(c: &PromptContext<'_>) -> String {
    let mut text = format!(
        "You are working on a task someone handed to Shep, to be finished by morning:\n\n\
         # {}\n\n",
        c.task.title
    );
    if let Some(details) = c.details.filter(|d| !d.trim().is_empty()) {
        text.push_str(details.trim());
        text.push_str("\n\n");
    }
    let _ = writeln!(
        text,
        "You are in a git worktree on branch `{}`, made from `origin/{}`. Make the change, \
         with tests where the project has them, and commit it with clear messages.",
        c.worktree.branch, c.worktree.base
    );
    text
}

fn answer(c: &PromptContext<'_>) -> String {
    let asked = c.asked.unwrap_or("(the question is not recorded)");
    format!(
        "Earlier you (or Shep) asked the person:\n\n> {asked}\n\nThey answered:\n\n> {}\n\n\
         Carry on with the task with that in mind, and commit your work.\n",
        note(c)
    )
}

fn revise(c: &PromptContext<'_>) -> String {
    format!(
        "The person reviewed your pull request and sent it back:\n\n> {}\n\nMake those \
         changes and commit them. They will land on the same pull request.\n",
        note(c)
    )
}

fn fix_ci(c: &PromptContext<'_>, attempt: u8, checks: &[String]) -> String {
    let log = c
        .ci_log
        .map(|p| format!(" The failing log is in {}.", p.display()))
        .unwrap_or_default();
    format!(
        "CI failed on your pull request: {}.{log} Find the cause, fix it, and commit the fix. \
         This is fix {attempt} of {}.\n",
        checks.join(", "),
        shep_domain::MAX_CI_FIXES
    )
}

fn review(c: &PromptContext<'_>) -> String {
    format!(
        "You are a second-opinion reviewer. Another agent made a change for this task:\n\n\
         # {}\n\nThe diff is in {}; the code is in {}. Read it as a careful senior reviewer: \
         is it correct, does it do what the task asks, is anything risky (security, data \
         loss)? Do not change any files. Write your review in a few short sentences, plain \
         text, to {}.\n",
        c.task.title,
        c.diff_file.display(),
        c.worktree.path,
        c.review_file.display()
    )
}

fn rules(c: &PromptContext<'_>) -> String {
    format!(
        "\nRules:\n\
         - Do not push and do not open a pull request; Shep does that, as a draft.\n\
         - Proof: run the relevant tests and save the command and its output to {}/tests.txt. \
         If the change shows in a UI, save screenshots (PNG) in {}.\n\
         - If you cannot go on without a decision from the person, write one short question \
         to {} and stop. Ask at most one question.\n",
        c.proof_dir.display(),
        c.proof_dir.display(),
        c.question_file.display()
    )
}

fn note<'a>(c: &PromptContext<'a>) -> &'a str {
    c.task.note.as_deref().unwrap_or("(no note)")
}
