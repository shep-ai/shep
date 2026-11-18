//! The MCP handshake: who this server is and that it serves tools.

// `#[tool_handler]` writes async handler methods, some with nothing to await; the lint cannot be
// silenced on the generated items themselves.
#![allow(clippy::unused_async_trait_impl)]

use rmcp::model::{Implementation, ServerCapabilities, ServerConfig};
use rmcp::{tool_handler, ServerHandler};

use crate::ShepMcp;

const NAME: &str = "shep";
const INSTRUCTIONS: &str = "Shep works through tasks overnight and opens a draft pull request \
    for each. add_task hands it an issue or a sentence; board shows what is ready, what needs the \
    person and what is still going; review merges, sends back with a note, or answers a question.";

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ShepMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(NAME, env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}
