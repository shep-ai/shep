//! Which build of `shep` this is, so a daemon left running by an older (or newer) install is
//! replaced instead of answering with code that no longer matches.

use std::time::UNIX_EPOCH;

/// Overrides the build identity (tests use it to act out an upgrade).
const BUILD_ENV: &str = "SHEP_BUILD_ID";

/// The version, plus the size and modification time of this binary: installing another build
/// changes them, even at the same version.
pub fn this_build() -> String {
    if let Ok(id) = std::env::var(BUILD_ENV) {
        return id;
    }
    let file = std::env::current_exe()
        .and_then(std::fs::metadata)
        .map(|m| {
            let modified = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            format!("{}-{modified}", m.len())
        })
        .unwrap_or_default();
    format!("{}-{file}", env!("CARGO_PKG_VERSION"))
}
