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

/// What a finished command said.
pub struct Ran {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

impl Ran {
    /// The error output, or the normal output when the command wrote nothing to stderr.
    pub fn complaint(&self) -> &str {
        if self.stderr.trim().is_empty() {
            self.stdout.trim()
        } else {
            self.stderr.trim()
        }
    }
}

/// Runs a command to completion, whatever its exit status.
pub fn run_raw(
    program: &str,
    args: &[&str],
    dir: Option<&Path>,
    env: &[(&str, &str)],
) -> Result<Ran, String> {
    let mut command = Command::new(program);
    command.args(args).stdin(Stdio::null());
    if let Some(dir) = dir {
        command.current_dir(dir);
    }
    for (key, value) in env {
        command.env(key, value);
    }
    let out = command
        .output()
        .map_err(|e| format!("could not run {program}: {e}"))?;
    Ok(Ran {
        success: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// Runs a command to completion. `Ok` holds its trimmed stdout; `Err` says what failed, with
/// its stderr, in words fit for a person.
pub fn run(
    program: &str,
    args: &[&str],
    dir: Option<&Path>,
    env: &[(&str, &str)],
) -> Result<String, String> {
    let ran = run_raw(program, args, dir, env)?;
    if ran.success {
        return Ok(ran.stdout.trim().to_owned());
    }
    Err(format!(
        "{program} {} failed: {}",
        args.join(" "),
        ran.complaint()
    ))
}
