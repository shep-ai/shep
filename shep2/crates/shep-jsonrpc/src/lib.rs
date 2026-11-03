//! JSON-RPC 2.0 over a local Unix socket, one JSON message per line. Used by the Shep daemon
//! (for every surface) and by the PTY holder (for the daemon). It knows nothing about Shep.

mod client;
mod message;
mod server;
mod socket;

pub use client::{Client, ClientError};
pub use message::{Notification, RpcError};
pub use server::{serve, Handler, Peer};
pub use socket::bind_private;
