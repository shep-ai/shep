//! GitHub through the `gh` command: issues in, draft pull requests and CI status out, and
//! what the engine watches between steps (comments, issue states).

mod json;

use std::path::Path;

use shep_app::ports::{Forge, ForgeError, Issue, IssueRef, IssueState, PrComment};
use shep_domain::{CiCheck, PullRequest, TaskSourceRef, Worktree};

use crate::process::{run, run_raw};
use json::{bucket, parse, CheckJson, IssueJson};

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

    /// `gh issue view <n> --json <fields> [-R owner/repo]` for an issue source; `None` for
    /// any other source.
    fn view_issue(
        &self,
        repo: &Path,
        source: &TaskSourceRef,
        fields: &str,
    ) -> Result<Option<String>, ForgeError> {
        let TaskSourceRef::GitHubIssue {
            repo: owner_repo,
            number,
        } = source
        else {
            return Ok(None);
        };
        let number = number.to_string();
        let mut args = vec!["issue", "view", &number, "--json", fields];
        if let Some(r) = owner_repo {
            args.extend(["-R", r]);
        }
        self.gh(repo, &args).map(Some)
    }
}

/// The most issues one `shep add --label` queues.
const LABEL_LIMIT: &str = "200";

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
    /// `None` when gh is missing or not signed in: onboarding offers `gh auth login`.
    fn whoami(&self) -> Result<Option<String>, ForgeError> {
        let Ok(ran) = run_raw(&self.program, &["api", "user", "--jq", ".login"], None, &[]) else {
            return Ok(None);
        };
        let login = ran.stdout.trim();
        Ok((ran.success && !login.is_empty()).then(|| login.to_owned()))
    }

    fn open_issues(&self, repo: &Path, limit: usize) -> Result<Vec<IssueRef>, ForgeError> {
        let limit = limit.to_string();
        let json = self.gh(
            repo,
            &[
                "issue",
                "list",
                "--state",
                "open",
                "--json",
                "number,title",
                "--limit",
                &limit,
            ],
        )?;
        json::issue_refs(&json)
    }

    fn labelled(&self, repo: &Path, label: &str) -> Result<Vec<IssueRef>, ForgeError> {
        let json = self.gh(
            repo,
            &[
                "issue",
                "list",
                "--label",
                label,
                "--state",
                "open",
                "--json",
                "number,title",
                "--limit",
                LABEL_LIMIT,
            ],
        )?;
        json::issue_refs(&json)
    }

    fn issue(&self, repo: &Path, source: &TaskSourceRef) -> Result<Option<Issue>, ForgeError> {
        let Some(json) = self.view_issue(repo, source, "title,body,url")? else {
            return Ok(None);
        };
        let issue: IssueJson = parse("issue", &json)?;
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
        let checks: Vec<CheckJson> = parse("checks", &ran.stdout)?;
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

    fn comments(&self, repo: &Path, pr: &PullRequest) -> Result<Vec<PrComment>, ForgeError> {
        let number = pr.number.to_string();
        let out = self.gh(repo, &["pr", "view", &number, "--json", "comments"])?;
        json::comments(&out)
    }

    fn issue_state(
        &self,
        repo: &Path,
        source: &TaskSourceRef,
    ) -> Result<Option<IssueState>, ForgeError> {
        self.view_issue(repo, source, "state")?
            .map(|out| json::issue_state(&out))
            .transpose()
    }

    fn close(&self, repo: &Path, pr: &PullRequest, comment: &str) -> Result<(), ForgeError> {
        let number = pr.number.to_string();
        self.gh(repo, &["pr", "close", &number, "--comment", comment])
            .map(|_| ())
    }
}
