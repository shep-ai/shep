//! Keeping the machine awake while a shift runs: `caffeinate` on macOS, `systemd-inhibit` on
//! Linux. The inhibitor watches the daemon's pid, so it ends even if the daemon dies.

use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, MutexGuard};

use shep_app::ports::KeepAwake;

const MACOS: &str = "macos";
const LINUX: &str = "linux";
const SYSTEMD_INHIBIT: &str = "systemd-inhibit";

/// The command that keeps `os` awake until process `pid` ends, if there is one.
pub fn inhibitor_command(os: &str, pid: u32, has_systemd_inhibit: bool) -> Option<Vec<String>> {
    let pid = pid.to_string();
    let words: Vec<String> = match os {
        // -i: no idle sleep; -s: no system sleep on AC power; -w: until the daemon exits.
        MACOS => ["caffeinate", "-i", "-s", "-w", &pid]
            .map(String::from)
            .to_vec(),
        LINUX if has_systemd_inhibit => [
            SYSTEMD_INHIBIT,
            "--what=idle:sleep",
            "--who=Shep",
            "--why=Shep is working through tonight's tasks",
            "--mode=block",
            "tail",
            &format!("--pid={pid}"),
            "-f",
            "/dev/null",
        ]
        .map(String::from)
        .to_vec(),
        _ => return None,
    };
    Some(words)
}

pub struct SystemKeepAwake {
    command: Option<Vec<String>>,
    inhibitor: Mutex<Option<Child>>,
}

impl SystemKeepAwake {
    /// The right inhibitor for this machine, tied to this process.
    pub fn for_this_machine() -> Self {
        let has_inhibit = crate::CliAgents::from_env().finds(SYSTEMD_INHIBIT);
        Self::with_command(inhibitor_command(
            std::env::consts::OS,
            std::process::id(),
            has_inhibit,
        ))
    }

    /// `None` keeps nothing awake (a machine with no inhibitor).
    pub fn with_command(command: Option<Vec<String>>) -> Self {
        Self {
            command,
            inhibitor: Mutex::new(None),
        }
    }

    pub fn inhibitor_pid(&self) -> Option<u32> {
        self.lock().as_ref().map(Child::id)
    }

    fn lock(&self) -> MutexGuard<'_, Option<Child>> {
        self.inhibitor
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

impl KeepAwake for SystemKeepAwake {
    fn hold(&self) {
        let Some((program, args)) = self.command.as_ref().and_then(|c| c.split_first()) else {
            return;
        };
        let mut inhibitor = self.lock();
        let running = inhibitor
            .as_mut()
            .is_some_and(|child| matches!(child.try_wait(), Ok(None)));
        if running {
            return;
        }
        *inhibitor = Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok();
    }

    fn release(&self) {
        if let Some(mut child) = self.lock().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for SystemKeepAwake {
    fn drop(&mut self) {
        self.release();
    }
}
