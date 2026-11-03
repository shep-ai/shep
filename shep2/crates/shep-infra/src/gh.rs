//! GitHub through the `gh` command: issues in, draft pull requests and CI status out.

use std::path::Path;

use serde::Deserialize;
use shep_app::ports::{Forge, ForgeError, Issue};
use shep_domain::{CheckState, CiCheck, PullRequest, TaskSourceRef, Worktree};

use crate::process::{run, run_raw};

/// Lines of a failed CI log kept for the agent.
const LOG_TAIL_LINES: usize = 300;
/// What `gh pr checks` says while a pull request has no checks yet.
const NO_CHECKS: &str = "no checks reported";
/// What GitHub says when a repository forbids a merge method.
const METHOD_NOT_ALLOWED: &str = "not allowed";
/// Tried in order until the repository accepts one.
const MERGE_METHODS: [&str; 3] = ["--squash", "--merge", "--rebase"];
const RUNS_SEGMENT: &str = "/actions/runs/";

pub struct GhForge {
    program: String,
}

impl GhForge {
    /// `program` is the `gh` to run (normally just `gh`, found on `PATH`).
    pub fn new(program: impl Into<String>) -> Self {
        Self {
            program: program.into(),
        }
    }

    fn gh(&self, dir: &Path, args: &[&str]) -> Result<String, ForgeError> {
        run(&self.program, args, Some(dir), &[]).map_err(ForgeError)
    }
}

#[derive(Deserialize)]
struct IssueJson {
    title: String,
    #[serde(default)]
    body: String,
    url: String,
}

#[derive(Deserialize)]
struct CheckJson {
    name: String,
    bucket: String,
    #[serde(default)]
    link: String,
}

fn bucket(name: &str) -> CheckState {
    match name {
        "pass" => CheckState::Passed,
        "fail" | "cancel" => CheckState::Failed,
        "skipping" => CheckState::Skipped,
        _ => CheckState::Pending,
    }
}

fn pr_number(url: &str) -> Result<u64, ForgeError> {
    url.trim()
        .rsplit('/')
        .next()
        .and_then(|n| n.parse().ok())
        .ok_or_else(|| ForgeError(format!("gh did not print a pull request URL: {url:?}")))
}

/// `…/actions/runs/<run id>/job/<job id>` → the run id.
fn run_id(link: &str) -> Option<&str> {
    let (_, rest) = link.split_once(RUNS_SEGMENT)?;
    rest.split('/').next().filter(|id| !id.is_empty())
}

impl Forge for GhForge {
    fn issue(&self, repo: &Path, source: &TaskSourceRef) -> Result<Option<Issue>, ForgeError> {
        let TaskSourceRef::GitHubIssue {
            repo: owner_repo,
            number,
        } = source
        else {
            return Ok(None);
        };
        let number = number.to_string();
        let mut args = vec!["issue", "view", &number, "--json", "title,body,url"];
        if let Some(r) = owner_repo {
            args.extend(["-R", r]);
        }
        let json = self.gh(repo, &args)?;
        let issue: IssueJson = serde_json::from_str(&json)
            .map_err(|e| ForgeError(format!("unexpected issue from gh: {e}")))?;
        Ok(Some(Issue {
            title: issue.title,
            body: issue.body,
            url: issue.url,
        }))
    }

    fn open_draft(
        &self,
        wt: &Worktree,
        title: &str,
        body: &str,
    ) -> Result<PullRequest, ForgeError> {
        let out = self.gh(
            Path::new(&wt.path),
            &[
                "pr",
                "create",
                "--draft",
                "--base",
                &wt.base,
                "--head",
                wt.branch.as_str(),
                "--title",
                title,
                "--body",
                body,
            ],
        )?;
        let url = out
            .lines()
            .rev()
            .find(|l| l.starts_with("https://"))
            .unwrap_or(&out)
            .trim()
            .to_owned();
        Ok(PullRequest {
            number: pr_number(&url)?,
            url,
        })
    }

    fn update_body(&self, wt: &Worktree, pr: &PullRequest, body: &str) -> Result<(), ForgeError> {
        let number = pr.number.to_string();
        self.gh(
            Path::new(&wt.path),
            &["pr", "edit", &number, "--body", body],
        )
        .map(|_| ())
    }

    /// `gh pr checks` exits non-zero while checks fail or run, so its output is read anyway.
    fn checks(&self, wt: &Worktree, pr: &PullRequest) -> Result<Vec<CiCheck>, ForgeError> {
        let number = pr.number.to_string();
        let ran = run_raw(
            &self.program,
            &["pr", "checks", &number, "--json", "name,bucket,link"],
            Some(Path::new(&wt.path)),
            &[],
        )
        .map_err(ForgeError)?;
        if ran.stdout.trim().is_empty() {
            if ran.success || ran.complaint().contains(NO_CHECKS) {
                return Ok(Vec::new());
            }
            return Err(ForgeError(ran.complaint().to_owned()));
        }
        let checks: Vec<CheckJson> = serde_json::from_str(&ran.stdout)
            .map_err(|e| ForgeError(format!("unexpected checks from gh: {e}")))?;
        Ok(checks
            .into_iter()
            .map(|c| CiCheck {
                state: bucket(&c.bucket),
                link: Some(c.link).filter(|l| !l.is_empty()),
                name: c.name,
            })
            .collect())
    }

    fn failed_log(&self, wt: &Worktree, check: &CiCheck) -> Result<String, ForgeError> {
        let id = check
            .link
            .as_deref()
            .and_then(run_id)
            .ok_or_else(|| ForgeError(format!("{} has no GitHub Actions log", check.name)))?;
        let log = self.gh(Path::new(&wt.path), &["run", "view", id, "--log-failed"])?;
        let lines: Vec<&str> = log.lines().collect();
        Ok(lines[lines.len().saturating_sub(LOG_TAIL_LINES)..].join("\n"))
    }

    fn merge(&self, repo: &Path, pr: &PullRequest) -> Result<(), ForgeError> {
        let number = pr.number.to_string();
        self.gh(repo, &["pr", "ready", &number])?;
        let mut last = ForgeError("no merge method was tried".into());
        for method in MERGE_METHODS {
            match self.gh(repo, &["pr", "merge", &number, method]) {
                Ok(_) => return Ok(()),
                Err(e) if e.0.contains(METHOD_NOT_ALLOWED) => last = e,
                Err(e) => return Err(e),
            }
        }
        Err(last)
    }
}
