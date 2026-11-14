//! An MCP client talking to the server over an in-memory pipe, with a real `Shep` on fakes behind
//! it: exactly three tools, each one calling one core action.

use std::sync::Arc;

use rmcp::model::{CallToolRequestParams, CallToolResult};
use rmcp::service::RunningService;
use rmcp::{RoleClient, ServiceExt};
use serde_json::{json, Value};
use shep_app::testing::{Fakes, ManualClock};
use shep_app::{SettingsChange, Shep, ShepApi, TaskRepository};
use shep_domain::{AgentKind, ClockTime, PullRequest, TaskId, TaskState};
use shep_mcp::ShepMcp;

const REPO: &str = "/code/app";
const PIPE_BYTES: usize = 64 * 1024;

struct World {
    f: Fakes,
    shep: Arc<Shep>,
    client: RunningService<RoleClient, ()>,
}

async fn world() -> World {
    let f = Fakes {
        clock: Arc::new(ManualClock::fixed(1_000_000)),
        ..Fakes::default()
    };
    f.git.add_repo(REPO);
    f.forge.add_issue(7, "Fix login redirect loop", "");
    f.forge.add_issue(8, "Move avatars to S3", "");
    let shep = Arc::new(Shep::new(f.ports()));
    shep.update_settings(SettingsChange {
        agent: Some(AgentKind::ClaudeCode),
        repo: Some(REPO.into()),
        ..SettingsChange::default()
    })
    .unwrap();
    let (server_end, client_end) = tokio::io::duplex(PIPE_BYTES);
    let api: Arc<dyn ShepApi> = shep.clone();
    tokio::spawn(async move {
        let running = ShepMcp::new(api).serve(server_end).await.unwrap();
        let _ = running.waiting().await;
    });
    let client = ().serve(client_end).await.unwrap();
    World { f, shep, client }
}

impl World {
    async fn call(&self, tool: &str, args: Value) -> CallToolResult {
        let args = args.as_object().cloned().unwrap_or_default();
        self.client
            .call_tool(CallToolRequestParams::new(tool.to_owned()).with_arguments(args))
            .await
            .unwrap()
    }

    /// The tool's structured answer; fails the test when the tool reported an error.
    async fn ok(&self, tool: &str, args: Value) -> Value {
        let result = self.call(tool, args).await;
        assert_ne!(result.is_error, Some(true), "{tool} failed: {result:?}");
        result.structured_content.expect("a structured answer")
    }

    /// The words of a tool error.
    async fn err(&self, tool: &str, args: Value) -> String {
        let result = self.call(tool, args).await;
        assert_eq!(
            result.is_error,
            Some(true),
            "{tool} should fail: {result:?}"
        );
        result
            .content
            .iter()
            .filter_map(|c| c.as_text().map(|t| t.text.clone()))
            .collect()
    }

    fn put(&self, id: i64, state: TaskState) {
        let mut task = self.f.tasks.get(TaskId(id)).unwrap().unwrap();
        task.state = state;
        if state == TaskState::Ready {
            task.pr = Some(PullRequest {
                number: 100 + u64::try_from(id).unwrap(),
                url: format!("https://github.com/acme/app/pull/{}", 100 + id),
            });
        }
        if state == TaskState::NeedsYou {
            task.question = Some("Which bucket, prod or staging?".into());
        }
        self.f.tasks.save(&task).unwrap();
    }
}

#[tokio::test]
async fn there_are_exactly_three_tools() {
    let w = world().await;
    let tools = w.client.list_all_tools().await.unwrap();
    let mut names: Vec<&str> = tools.iter().map(|t| t.name.as_ref()).collect();
    names.sort_unstable();
    assert_eq!(names, ["add_task", "board", "review"]);
    let schema = |name: &str| {
        let tool = tools.iter().find(|t| t.name == name).unwrap();
        assert!(
            tool.description.as_deref().is_some_and(|d| !d.is_empty()),
            "{name} needs a description"
        );
        serde_json::to_value(tool.input_schema.as_ref()).unwrap()
    };
    assert!(schema("add_task")["properties"]["text"].is_object());
    assert!(schema("add_task")["properties"]["when"].is_object());
    assert_eq!(schema("add_task")["required"], json!(["text"]));
    assert!(schema("review")["properties"]["action"].is_object());
    assert!(schema("review")["properties"]["note"].is_object());
}

#[tokio::test]
async fn add_task_queues_for_tonight_by_default() {
    let w = world().await;
    let added = w.ok("add_task", json!({ "text": "#7" })).await;
    assert_eq!(added["id"], 1);
    assert_eq!(added["reference"], "#7");
    assert_eq!(added["state"], "Queued");
    assert_eq!(added["starts"], "23:00");
    assert_eq!(w.shep.board().unwrap().queued.len(), 1);

    let again = w
        .ok("add_task", json!({ "text": "#7", "when": "tonight" }))
        .await;
    assert_eq!(
        again["id"], 1,
        "adding the same issue twice returns the first"
    );
}

#[tokio::test]
async fn add_task_now_starts_it() {
    let w = world().await;
    let added = w
        .ok("add_task", json!({ "text": "#7", "when": "now" }))
        .await;
    assert_eq!(added["state"], "Working");
    assert_eq!(added["starts"], "now");
}

#[tokio::test]
async fn add_task_at_a_time_sets_the_shift() {
    let w = world().await;
    let added = w
        .ok(
            "add_task",
            json!({ "text": "Rate-limit /api/search", "when": "06:30" }),
        )
        .await;
    assert_eq!(added["state"], "Queued");
    assert_eq!(added["starts"], "06:30");
    let settings = w.shep.settings().unwrap();
    assert_eq!(settings.shift_start, ClockTime::parse("06:30").unwrap());
}

#[tokio::test]
async fn add_task_without_a_nightly_shift_waits_for_go() {
    let w = world().await;
    w.shep
        .update_settings(SettingsChange {
            nightly: Some(false),
            ..SettingsChange::default()
        })
        .unwrap();
    let added = w.ok("add_task", json!({ "text": "#7" })).await;
    assert_eq!(added["starts"], Value::Null);
}

#[tokio::test]
async fn add_task_says_what_was_wrong() {
    let w = world().await;
    let why = w
        .err("add_task", json!({ "text": "#7", "when": "after lunch" }))
        .await;
    assert!(why.contains("now, tonight or HH:MM"), "{why}");
    assert_eq!(w.shep.board().unwrap().queued.len(), 0);
    let why = w.err("add_task", json!({ "text": "  " })).await;
    assert_ne!(why, "");
}

#[tokio::test]
async fn board_counts_each_state_and_lists_the_tasks() {
    let w = world().await;
    w.ok("add_task", json!({ "text": "#7" })).await;
    w.ok("add_task", json!({ "text": "#8" })).await;
    w.ok("add_task", json!({ "text": "Dark mode for settings" }))
        .await;
    w.put(1, TaskState::Ready);
    w.put(2, TaskState::NeedsYou);

    let board = w.ok("board", json!({})).await;
    assert_eq!(board["ready"], 1);
    assert_eq!(board["needs_you"], 1);
    assert_eq!(board["working"], 0);
    assert_eq!(board["queued"], 1);
    let tasks = board["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 3);
    assert_eq!(tasks[0]["state"], "NeedsYou", "needs you first");
    assert_eq!(tasks[0]["question"], "Which bucket, prod or staging?");
    assert_eq!(tasks[1]["reference"], "#7");
    assert_eq!(tasks[1]["pr"], "https://github.com/acme/app/pull/101");
    assert_eq!(tasks[2]["title"], "Dark mode for settings");
}

#[tokio::test]
async fn review_merges_answers_and_sends_back() {
    let w = world().await;
    for text in ["#7", "#8"] {
        w.ok("add_task", json!({ "text": text })).await;
    }
    w.put(1, TaskState::Ready);
    w.put(2, TaskState::NeedsYou);

    let answered = w
        .ok(
            "review",
            json!({ "id": 2, "action": "answer", "note": "acme-prod-avatars" }),
        )
        .await;
    assert_eq!(answered["state"], "Working");
    let merged = w.ok("review", json!({ "id": 1, "action": "merge" })).await;
    assert_eq!(merged["state"], "Merged");
    assert_eq!(w.f.forge.merged().len(), 1);
}

#[tokio::test]
async fn review_needs_a_note_to_send_back_or_answer() {
    let w = world().await;
    w.ok("add_task", json!({ "text": "#7" })).await;
    w.put(1, TaskState::Ready);
    let why = w
        .err("review", json!({ "id": 1, "action": "send-back" }))
        .await;
    assert!(why.contains("note"), "{why}");
    let sent = w
        .ok(
            "review",
            json!({ "id": 1, "action": "send-back", "note": "Keep the old URL working" }),
        )
        .await;
    assert_eq!(sent["state"], "Working");
    let why = w.err("review", json!({ "id": 9, "action": "merge" })).await;
    assert!(why.contains('9'), "{why}");
}
