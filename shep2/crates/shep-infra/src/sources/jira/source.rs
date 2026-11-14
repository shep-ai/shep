//! The Jira adapter: JQL search for hand-overs, ADF comments, transitions and remote links.

use serde_json::{json, Value};
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{PullRequest, SourceKind, TaskSourceRef, UnixTime};

use super::adf;
use crate::sources::http::{self, Http};
use crate::sources::tracker::{self, parse_time, same_name, Said, TONIGHT};

const MYSELF: &str = "/rest/api/3/myself";
const STATUSES: &str = "/rest/api/3/status";
const SEARCH: &str = "/rest/api/3/search/jql";
const ISSUE: &str = "/rest/api/3/issue";
const TRANSITIONS: &str = "transitions";
/// `expand` that lists the fields a transition's screen asks for.
const TRANSITION_FIELDS: &str = "expand=transitions.fields";
const COMMENTS: &str = "comment";
const NEWEST_COMMENTS_FIRST: &str = "orderBy=-created";
const REMOTE_LINK: &str = "remotelink";
const BROWSE: &str = "browse";
const AUTHORIZATION: &str = "Authorization";
const BASIC: &str = "Basic";
const ACCEPT: &str = "Accept";
const JSON: &str = "application/json";
const FIELDS: [&str; 3] = ["summary", "description", "status"];
const HAND_OVER_LABEL: &str = "shep";
/// Where a ready issue goes, best match first.
const REVIEW_STATUSES: [&str; 4] = ["In Review", "Review", "Code Review", "In Code Review"];
const NOT_DONE: &str = "statusCategory != Done";
const MINE_OR_NOBODYS: &str = "(assignee = currentUser() OR assignee is EMPTY)";
const PAGE_SIZE: usize = 50;
const MAX_PAGES: usize = 10;
const COMMENTS_PAGE: usize = 100;
const PR_APP_TYPE: &str = "com.github";
const PR_APP_NAME: &str = "GitHub";
const PR_ICON: &str = "https://github.com/favicon.ico";
const PR_RELATIONSHIP: &str = "pull request";

/// One Jira site, connected as a person (email and API token).
pub struct Jira {
    http: Http,
    site: String,
    auth: String,
    project: Option<String>,
}

/// An issue key is letters, digits and `_` with a dash and a number; nothing else goes in a path.
pub(super) fn check_key(key: &str) -> Result<(), SourceError> {
    let ok = !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(SourceError(format!("{key:?} is not a Jira key")))
    }
}

impl Jira {
    /// `auth` is the base64 of `email:token`.
    pub(super) fn new(http: Http, site: &str, auth: &str, project: Option<String>) -> Self {
        Self {
            http,
            site: site.to_owned(),
            auth: format!("{BASIC} {auth}"),
            project,
        }
    }

    fn headers(&self) -> [(&str, &str); 2] {
        [(AUTHORIZATION, self.auth.as_str()), (ACCEPT, JSON)]
    }

    fn get(&self, path: &str) -> Result<Value, SourceError> {
        self.http.get(path, &self.headers())
    }

    fn post(&self, path: &str, body: &Value) -> Result<Value, SourceError> {
        self.http.post(path, &self.headers(), body)
    }

    fn issue_path(source: &TaskSourceRef) -> Result<String, SourceError> {
        let TaskSourceRef::Jira { key } = source else {
            return Err(SourceError(format!("{source} is not a Jira issue")));
        };
        check_key(key)?;
        Ok(format!("{ISSUE}/{key}"))
    }

    fn scoped(&self, jql: &str) -> String {
        match &self.project {
            Some(key) => format!("project = \"{key}\" AND {jql}"),
            None => jql.to_owned(),
        }
    }

    /// Issues matching `jql`, up to `limit`, following pages.
    fn search(&self, jql: &str, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let mut found = Vec::new();
        if limit == 0 {
            return Ok(found);
        }
        let mut next: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut body =
                json!({ "jql": jql, "fields": FIELDS, "maxResults": limit.min(PAGE_SIZE) });
            if let Some(token) = &next {
                body["nextPageToken"] = json!(token);
            }
            let page = self.post(SEARCH, &body)?;
            for issue in page["issues"].as_array().into_iter().flatten() {
                found.push(self.hand_over(issue)?);
            }
            next = page["nextPageToken"].as_str().map(str::to_owned);
            if found.len() >= limit || next.is_none() || page["isLast"] == json!(true) {
                break;
            }
        }
        found.truncate(limit);
        Ok(found)
    }

    fn hand_over(&self, issue: &Value) -> Result<HandOver, SourceError> {
        let key = issue["key"]
            .as_str()
            .ok_or_else(|| SourceError("Jira sent an issue without a key".into()))?;
        let fields = &issue["fields"];
        Ok(HandOver {
            source: TaskSourceRef::Jira {
                key: key.to_owned(),
            },
            title: fields["summary"].as_str().unwrap_or_default().to_owned(),
            body: adf::plain_text(&fields["description"]),
            url: format!("https://{}/{BROWSE}/{key}", self.site),
        })
    }

    /// Moves the issue to the first of `statuses` its workflow offers without asking for more.
    fn move_to(&self, issue: &str, statuses: &[&str]) -> Result<(), SourceError> {
        let offered = self.get(&format!("{issue}/{TRANSITIONS}?{TRANSITION_FIELDS}"))?;
        let transitions: Vec<&Value> = offered[TRANSITIONS]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|t| !needs_form(t))
            .collect();
        let chosen = statuses.iter().find_map(|wanted| {
            transitions
                .iter()
                .find(|t| same_name(t["to"]["name"].as_str().unwrap_or_default(), wanted))
        });
        if let Some(transition) = chosen {
            let id = transition["id"].clone();
            self.post(
                &format!("{issue}/{TRANSITIONS}"),
                &json!({ "transition": { "id": id } }),
            )?;
        }
        Ok(())
    }

    /// Adds the pull request under "Web links"; the same PR updates the same link.
    fn link(&self, issue: &str, pr: &PullRequest, summary: &str) -> Result<(), SourceError> {
        let body = json!({
            "globalId": pr.url,
            "application": { "type": PR_APP_TYPE, "name": PR_APP_NAME },
            "relationship": PR_RELATIONSHIP,
            "object": {
                "url": pr.url,
                "title": format!("Pull request #{}", pr.number),
                "summary": summary,
                "icon": { "url16x16": PR_ICON, "title": PR_APP_NAME }
            }
        });
        self.post(&format!("{issue}/{REMOTE_LINK}"), &body)
            .map(drop)
    }
}

/// A transition whose screen requires a field Shep cannot fill (a resolution, a sprint).
fn needs_form(transition: &Value) -> bool {
    transition["fields"].as_object().is_some_and(|fields| {
        fields
            .values()
            .any(|f| f["required"] == json!(true) && f["hasDefaultValue"] != json!(true))
    })
}

impl TaskSource for Jira {
    fn kind(&self) -> SourceKind {
        SourceKind::Jira
    }

    fn connection(&self) -> Result<String, SourceError> {
        let me = self.get(MYSELF)?;
        let name = me["displayName"].as_str().unwrap_or_default();
        Ok(match &self.project {
            Some(key) => format!("{} · {name} · {key}", self.site),
            None => format!("{} · {name}", self.site),
        })
    }

    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let statuses = self.get(STATUSES)?;
        let has_tonight = statuses
            .as_array()
            .into_iter()
            .flatten()
            .any(|s| same_name(s["name"].as_str().unwrap_or_default(), TONIGHT));
        // JQL refuses a status the site does not have, so only ask for one that exists.
        let label = format!("labels = \"{HAND_OVER_LABEL}\"");
        let handed = if has_tonight {
            format!("(status = \"{TONIGHT}\" OR {label})")
        } else {
            label
        };
        let jql = self.scoped(&format!("{handed} AND {NOT_DONE} ORDER BY updated DESC"));
        self.search(&jql, PAGE_SIZE * MAX_PAGES)
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let path = format!("{}?fields={}", Self::issue_path(source)?, FIELDS.join(","));
        match self.get(&path) {
            Ok(issue) => self.hand_over(&issue).map(Some),
            Err(e) if http::is_gone(&e) => Ok(None),
            Err(e) => Err(e),
        }
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let issue = Self::issue_path(source)?;
        // Status changes first and the comment last: a retry after a failure says it once.
        match update {
            Update::Queued { .. } => self.move_to(&issue, &[TONIGHT])?,
            Update::Ready { pr, summary, .. } => {
                self.link(&issue, pr, summary)?;
                self.move_to(&issue, &REVIEW_STATUSES)?;
            }
            Update::Asked { .. } | Update::Merged { .. } | Update::Stopped { .. } => {}
        }
        let body = json!({ "body": adf::document(&tracker::message(update)) });
        self.post(&format!("{issue}/{COMMENTS}"), &body).map(drop)
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let issue = Self::issue_path(source)?;
        let path = format!("{issue}/{COMMENTS}?{NEWEST_COMMENTS_FIRST}&maxResults={COMMENTS_PAGE}");
        let page = self.get(&path)?;
        let said = page["comments"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| {
                Ok(Said {
                    at: parse_time(c["created"].as_str().unwrap_or_default())?,
                    author: c["author"]["displayName"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned(),
                    text: adf::plain_text(&c["body"]),
                })
            })
            .collect::<Result<Vec<_>, SourceError>>()?;
        Ok(tracker::replies_since(said, since))
    }

    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let jql = self.scoped(&format!(
            "{NOT_DONE} AND {MINE_OR_NOBODYS} ORDER BY created DESC"
        ));
        self.search(&jql, limit)
    }
}
