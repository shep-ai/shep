//! The Shep daemon's protocol. Every surface (CLI, terminal UI, MCP, Mac app) reaches the four
//! core actions through it: JSON-RPC 2.0 over a user-only Unix socket, described by an OpenRPC
//! schema generated from the Rust types ([`openrpc::document`]).

mod client;
mod method;
pub mod openrpc;
mod server;

pub use client::{BoardChanges, RemoteShep};
pub use method::{AddParams, Method, NoParams, ReviewParams, StartParams, UpdateSettingsParams};
pub use server::RpcServer;

/// The notification a subscriber receives with the whole board after every change.
pub const BOARD_CHANGED: &str = "board.changed";
