//! The GraphQL Shep sends to Linear. Every operation is named (`ShepRead`, `ShepComment`, …)
//! so a request says what it is in logs and recorded fixtures.

use serde_json::{json, Value};

/// What Shep reads of an issue it may take.
const HAND_OVER_FIELDS: &str = "fragment HandOverFields on Issue { id identifier title \
    description url createdAt labels { nodes { name } } state { name type } }";

pub(super) const VIEWER: &str =
    "query ShepViewer { viewer { id name } organization { name urlKey } }";
pub(super) const TEAM: &str =
    "query ShepTeam($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id key name } } }";
const WAITING: &str = "query ShepWaiting($filter: IssueFilter!, $first: Int!) { \
    issues(filter: $filter, first: $first, orderBy: updatedAt) { nodes { ...HandOverFields } } }";
const OFFER: &str = "query ShepOffer($filter: IssueFilter!, $first: Int!) { \
    issues(filter: $filter, first: $first, orderBy: createdAt) { nodes { ...HandOverFields } } }";
const READ: &str = "query ShepRead($id: String!) { issue(id: $id) { ...HandOverFields } }";
pub(super) const PLACE: &str = "query ShepPlace($id: String!) { issue(id: $id) { id \
    team { id key states { nodes { id name type } } } } }";
pub(super) const REPLIES: &str = "query ShepReplies($id: String!, $filter: CommentFilter, \
    $first: Int!) { issue(id: $id) { comments(filter: $filter, first: $first) { \
    nodes { id body createdAt user { id name displayName } } } } }";
pub(super) const COMMENT: &str = "mutation ShepComment($input: CommentCreateInput!) { \
    commentCreate(input: $input) { success comment { id } } }";
pub(super) const MOVE: &str = "mutation ShepMove($id: String!, $input: IssueUpdateInput!) { \
    issueUpdate(id: $id, input: $input) { success issue { id state { name } } } }";
pub(super) const ATTACH: &str = "mutation ShepAttach($input: AttachmentCreateInput!) { \
    attachmentCreate(input: $input) { success attachment { id } } }";

/// The mutation result fields, by document.
pub(super) const COMMENT_RESULT: &str = "commentCreate";
pub(super) const MOVE_RESULT: &str = "issueUpdate";
pub(super) const ATTACH_RESULT: &str = "attachmentCreate";

/// Workflow state types (`WorkflowState.type`).
pub(super) const DONE_TYPES: [&str; 2] = ["completed", "canceled"];
const NOT_STARTED_TYPES: [&str; 2] = ["backlog", "unstarted"];

pub(super) fn waiting() -> String {
    with_fields(WAITING)
}

pub(super) fn offer() -> String {
    with_fields(OFFER)
}

pub(super) fn read() -> String {
    with_fields(READ)
}

fn with_fields(document: &str) -> String {
    format!("{document}\n{HAND_OVER_FIELDS}")
}

/// Open issues with the label, or in the state, that hands work to Shep.
pub(super) fn waiting_filter(label: &str, state: &str, team: Option<&str>) -> Value {
    let mut filter = json!({
        "or": [
            { "labels": { "name": { "eqIgnoreCase": label } } },
            { "state": { "name": { "eqIgnoreCase": state } } },
        ],
        "state": { "type": { "nin": DONE_TYPES } },
    });
    in_team(&mut filter, team);
    filter
}

/// Issues nobody has started.
pub(super) fn offer_filter(team: Option<&str>) -> Value {
    let mut filter = json!({ "state": { "type": { "in": NOT_STARTED_TYPES } } });
    in_team(&mut filter, team);
    filter
}

/// Comments written at or after `since` (RFC 3339).
pub(super) fn since_filter(since: &str) -> Value {
    json!({ "createdAt": { "gte": since } })
}

fn in_team(filter: &mut Value, team: Option<&str>) {
    if let Some(key) = team {
        filter["team"] = json!({ "key": { "eq": key } });
    }
}
