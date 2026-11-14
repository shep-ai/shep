//! Shep's MCP server: three tools, so any agent that speaks MCP can hand work to Shep without the
//! person leaving it. Each tool calls one core action on a [`ShepApi`] (the daemon, in `shep mcp`).

mod answer;
mod handler;
mod when;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router, Json, ServiceExt};
use schemars::JsonSchema;
use serde::Deserialize;
use shep_app::{ShepApi, StartWhen};
use shep_domain::{ReviewAction, Task, TaskId, TaskState};

pub use answer::{Added, BoardAnswer, TaskLine};
pub use when::When;

const STARTS_NOW: &str = "now";
const STARTS_WHEN_FREE: &str = "when a running task finishes";
#[derive(Debug, Deserialize, JsonSchema)]
pub struct AddTask {
    /// An issue (`#412`), a link to a ticket or message, or a sentence describing the work.
    pub text: String,
    /// `now`, `tonight` (the default) or a time like `23:00`.
    pub when: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ReviewKind {
    /// Merge the draft pull request (it must be Ready).
    Merge,
    /// Send a Ready task back to the agent with a note.
    SendBack,
    /// Answer the question of a task that needs you.
    Answer,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct Review {
    /// The task's `id` from `board` or `add_task`.
    pub id: i64,
    pub action: ReviewKind,
    /// What to change (send-back) or the answer (answer).
    pub note: Option<String>,
}

#[derive(Clone)]
pub struct ShepMcp {
    api: Arc<dyn ShepApi>,
    /// Where the agent runs: the first task added makes this Shep's repository.
    dir: Option<PathBuf>,
    pub(crate) tool_router: ToolRouter<Self>,
}

#[tool_router]
impl ShepMcp {
    pub fn new(api: Arc<dyn ShepApi>) -> Self {
        Self {
            api,
            dir: None,
            tool_router: Self::tool_router(),
        }
    }

    #[must_use]
    pub fn in_dir(mut self, dir: Option<PathBuf>) -> Self {
        self.dir = dir;
        self
    }

    /// Queue an issue or a sentence for Shep, for tonight unless told otherwise.
    #[tool(description = "Queue an issue or a sentence")]
    async fn add_task(&self, Parameters(args): Parameters<AddTask>) -> Result<Json<Added>, String> {
        let when = When::parse(args.when.as_deref())?;
        let dir = self.dir.clone();
        self.blocking(move |api| add_task(api, &args.text, when, dir.as_deref()))
            .await
            .map(Json)
    }

    /// Every task and its state.
    #[tool(description = "Every task and its state")]
    async fn board(&self) -> Result<Json<BoardAnswer>, String> {
        self.blocking(|api| {
            let board = api.board().map_err(|e| e.to_string())?;
            Ok(BoardAnswer::from(&board))
        })
        .await
        .map(Json)
    }

    /// A person's decision on a task.
    #[tool(description = "Merge, send back or answer")]
    async fn review(&self, Parameters(args): Parameters<Review>) -> Result<Json<TaskLine>, String> {
        let action = review_action(args.action, args.note)?;
        self.blocking(move |api| {
            let task = api
                .review(TaskId(args.id), action)
                .map_err(|e| e.to_string())?;
            Ok(TaskLine::from(&task))
        })
        .await
        .map(Json)
    }

    /// Core calls block (over the socket they wait on the daemon), so they run off the async
    /// executor.
    async fn blocking<T, F>(&self, call: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&dyn ShepApi) -> Result<T, String> + Send + 'static,
    {
        let api = self.api.clone();
        tokio::task::spawn_blocking(move || call(api.as_ref()))
            .await
            .map_err(|e| e.to_string())?
    }
}

fn add_task(
    api: &dyn ShepApi,
    text: &str,
    when: When,
    dir: Option<&Path>,
) -> Result<Added, String> {
    let err = |e: shep_app::AppError| e.to_string();
    let task = api.add(text, dir).map_err(err)?;
    let (task, starts) = match when {
        When::Now => {
            api.start(StartWhen::Now).map_err(err)?;
            let task = current(api, task)?;
            let starts = if task.state == TaskState::Queued {
                STARTS_WHEN_FREE
            } else {
                STARTS_NOW
            };
            (task, Some(starts.to_owned()))
        }
        When::At(at) => {
            api.start(StartWhen::At(at)).map_err(err)?;
            (task, Some(at.to_string()))
        }
        When::Tonight => {
            let settings = api.settings().map_err(err)?;
            let starts = settings.nightly.then(|| settings.shift_start.to_string());
            (task, starts)
        }
    };
    Ok(Added {
        task: TaskLine::from(&task),
        starts,
    })
}

/// The task as it is now, after starting the shift moved it.
fn current(api: &dyn ShepApi, task: Task) -> Result<Task, String> {
    let board = api.board().map_err(|e| e.to_string())?;
    let found = board
        .groups()
        .flat_map(|(_, tasks)| tasks.iter())
        .find(|t| t.id == task.id)
        .cloned();
    Ok(found.unwrap_or(task))
}

fn review_action(kind: ReviewKind, note: Option<String>) -> Result<ReviewAction, String> {
    let note = note.map(|n| n.trim().to_owned()).filter(|n| !n.is_empty());
    match (kind, note) {
        (ReviewKind::Merge, _) => Ok(ReviewAction::Merge),
        (ReviewKind::SendBack, Some(note)) => Ok(ReviewAction::SendBack { note }),
        (ReviewKind::Answer, Some(text)) => Ok(ReviewAction::Answer { text }),
        (ReviewKind::SendBack | ReviewKind::Answer, None) => {
            Err("send-back and answer need a note: what to change, or the answer".into())
        }
    }
}

/// Serves the three tools over stdin and stdout until the client hangs up.
pub async fn serve_stdio(api: Arc<dyn ShepApi>, dir: Option<PathBuf>) -> std::io::Result<()> {
    let running = ShepMcp::new(api)
        .in_dir(dir)
        .serve(rmcp::transport::stdio())
        .await
        .map_err(std::io::Error::other)?;
    running.waiting().await.map_err(std::io::Error::other)?;
    Ok(())
}

/// [`serve_stdio`] on its own runtime, for a caller that is not async.
pub fn run_stdio(api: Arc<dyn ShepApi>, dir: Option<PathBuf>) -> std::io::Result<()> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(serve_stdio(api, dir))
}
