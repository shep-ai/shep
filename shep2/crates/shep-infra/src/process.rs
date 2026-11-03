//! Starting Shep's own background processes (the daemon, the PTY holder) so they outlive the
//! process that started them.

use std::fs::OpenOptions;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Starts `program args…` in its own process group, with no terminal input and its output
/// appended to `log`. A Ctrl-C in the starting terminal does not reach it, and it keeps running
/// when the starter exits.
pub fn spawn_detached(program: &Path, args: &[&str], log: &Path) -> std::io::Result<Child> {
    if let Some(dir) = log.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let out = OpenOptions::new().create(true).append(true).open(log)?;
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(out.try_clone()?)
        .stderr(out)
        .process_group(0)
        .spawn()
}

/// Polls `ready` until it holds or `limit` passes.
pub fn wait_until(limit: Duration, mut ready: impl FnMut() -> bool) -> bool {
    const POLL: Duration = Duration::from_millis(20);
    let deadline = Instant::now() + limit;
    loop {
        if ready() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(POLL);
    }
}
