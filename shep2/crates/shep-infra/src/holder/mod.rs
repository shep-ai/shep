//! The PTY holder: a process of its own that runs agent sessions in real terminals, so they
//! keep running when the daemon restarts or upgrades. The daemon talks to it over JSON-RPC on
//! `$SHEP_HOME/shep2/run/holder.sock`; anyone may attach to a session to watch and type.
//! (The holder as a separate process follows herdr's design, Apache-2.0.)

mod client;
mod protocol;
mod server;
mod session;

pub use client::{Attach, HolderSessions};
pub use server::{run, serve};
