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

/// What `exec` says while some process still holds the program open for writing (a tool
/// being replaced, or a script another thread has just written).
const TEXT_FILE_BUSY: i32 = 26;
const BUSY_RETRIES: u32 = 20;
const BUSY_PAUSE: Duration = Duration::from_millis(10);

/// Starts a process, tried again for a moment while its program is busy being written.
pub(crate) fn when_free<T>(mut start: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let mut tries = 0;
    loop {
        match start() {
            Err(e) if e.raw_os_error() == Some(TEXT_FILE_BUSY) && tries < BUSY_RETRIES => {
                tries += 1;
                std::thread::sleep(BUSY_PAUSE);
            }
            other => return other,
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
    let out =
        when_free(|| command.output()).map_err(|e| format!("could not run {program}: {e}"))?;
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

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::time::Duration;

    use super::run;

    /// While any process holds a script open for writing, executing it fails with "Text file
    /// busy". A test thread writing a fake tool while another thread forks hits exactly this.
    #[test]
    fn a_script_still_held_open_for_writing_runs_once_it_is_released() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("tool");
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o755)
            .open(&script)
            .unwrap();
        file.write_all(b"#!/bin/sh\necho ran\n").unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(30));
            drop(file);
        });
        let out = run(script.to_str().unwrap(), &[], None, &[]).unwrap();
        release.join().unwrap();
        assert_eq!(out, "ran");
    }
}
