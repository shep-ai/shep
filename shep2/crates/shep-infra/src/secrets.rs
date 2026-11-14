//! Where source tokens are kept: the macOS Keychain, the Linux secret service through
//! `secret-tool`, or, with neither, a file only this user can read. Never in settings, and never
//! on a command line where `ps` could show it.

use std::collections::BTreeMap;
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use crate::process::when_free;
use crate::ShepHome;

/// Every secret is stored under this service name, with its key as the account.
pub const SERVICE: &str = "shep2";
const FILE_NAME: &str = "secrets.json";
const PRIVATE_FILE: u32 = 0o600;
const PRIVATE_DIR: u32 = 0o700;
const SECRET_TOOL: &str = "secret-tool";
/// Without a session bus there is no secret service to talk to.
const SESSION_BUS_ENV: &str = "DBUS_SESSION_BUS_ADDRESS";

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("keychain: {0}")]
pub struct SecretError(pub String);

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, SecretError>;
    fn set(&self, key: &str, value: &str) -> Result<(), SecretError>;
    /// Forgetting a key that is not there is fine.
    fn delete(&self, key: &str) -> Result<(), SecretError>;
}

/// The best store this machine has.
pub fn for_this_machine(home: &ShepHome) -> Arc<dyn SecretStore> {
    #[cfg(target_os = "macos")]
    {
        let _ = home;
        Arc::new(mac::Keychain)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let bus = std::env::var_os(SESSION_BUS_ENV).is_some();
        match which(SECRET_TOOL) {
            Some(tool) if bus => Arc::new(SecretTool::new(tool)),
            _ => Arc::new(FileSecrets::new(home.dir().join(FILE_NAME))),
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn which(program: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(program))
            .find(|p| p.is_file())
    })
}

#[cfg(target_os = "macos")]
mod mac {
    use security_framework::passwords;

    use super::{SecretError, SecretStore, SERVICE};

    /// What the Keychain answers for a key it does not have.
    const NOT_FOUND: i32 = -25300;

    pub struct Keychain;

    impl SecretStore for Keychain {
        fn get(&self, key: &str) -> Result<Option<String>, SecretError> {
            match passwords::get_generic_password(SERVICE, key) {
                Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
                Err(e) if e.code() == NOT_FOUND => Ok(None),
                Err(e) => Err(SecretError(e.to_string())),
            }
        }
        fn set(&self, key: &str, value: &str) -> Result<(), SecretError> {
            passwords::set_generic_password(SERVICE, key, value.as_bytes())
                .map_err(|e| SecretError(e.to_string()))
        }
        fn delete(&self, key: &str) -> Result<(), SecretError> {
            match passwords::delete_generic_password(SERVICE, key) {
                Err(e) if e.code() != NOT_FOUND => Err(SecretError(e.to_string())),
                _ => Ok(()),
            }
        }
    }
}

/// libsecret's command-line tool; the secret goes in on stdin.
pub struct SecretTool {
    program: PathBuf,
}

impl SecretTool {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
        }
    }

    fn run(&self, verb: &str, key: &str, input: Option<&str>) -> Result<String, SecretError> {
        let mut args = vec![verb];
        if verb == "store" {
            args.extend(["--label", "Shep"]);
        }
        args.extend(["service", SERVICE, "account", key]);
        let mut command = Command::new(&self.program);
        command
            .args(&args)
            .stdin(if input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = when_free(|| command.spawn())
            .map_err(|e| SecretError(format!("could not run {SECRET_TOOL}: {e}")))?;
        if let (Some(input), Some(mut stdin)) = (input, child.stdin.take()) {
            stdin
                .write_all(input.as_bytes())
                .map_err(|e| SecretError(e.to_string()))?;
        }
        let out = child
            .wait_with_output()
            .map_err(|e| SecretError(e.to_string()))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            Err(SecretError(
                String::from_utf8_lossy(&out.stderr).trim().to_owned(),
            ))
        }
    }
}

impl SecretStore for SecretTool {
    fn get(&self, key: &str) -> Result<Option<String>, SecretError> {
        // `lookup` fails when there is nothing stored under the key.
        Ok(self.run("lookup", key, None).ok().filter(|v| !v.is_empty()))
    }
    fn set(&self, key: &str, value: &str) -> Result<(), SecretError> {
        self.run("store", key, Some(value)).map(|_| ())
    }
    fn delete(&self, key: &str) -> Result<(), SecretError> {
        self.run("clear", key, None).map(|_| ())
    }
}

/// A JSON file only this user can read, for machines with no keychain.
pub struct FileSecrets {
    path: PathBuf,
    lock: Mutex<()>,
}

impl FileSecrets {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn read(&self) -> Result<BTreeMap<String, String>, SecretError> {
        match std::fs::read_to_string(&self.path) {
            Ok(text) => serde_json::from_str(&text).map_err(|e| SecretError(e.to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(e) => Err(SecretError(e.to_string())),
        }
    }

    fn write(&self, all: &BTreeMap<String, String>) -> Result<(), SecretError> {
        let fail = |e: std::io::Error| SecretError(e.to_string());
        if let Some(dir) = self.path.parent() {
            make_private_dir(dir).map_err(fail)?;
        }
        let text = serde_json::to_string(all).map_err(|e| SecretError(e.to_string()))?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(PRIVATE_FILE)
            .open(&self.path)
            .map_err(fail)?;
        file.write_all(text.as_bytes()).map_err(fail)?;
        std::fs::set_permissions(&self.path, std::fs::Permissions::from_mode(PRIVATE_FILE))
            .map_err(fail)
    }

    fn change(&self, edit: impl FnOnce(&mut BTreeMap<String, String>)) -> Result<(), SecretError> {
        let _guard = self.lock.lock().map_err(|e| SecretError(e.to_string()))?;
        let mut all = self.read()?;
        edit(&mut all);
        self.write(&all)
    }
}

fn make_private_dir(dir: &Path) -> std::io::Result<()> {
    if dir.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)?;
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(PRIVATE_DIR))
}

impl SecretStore for FileSecrets {
    fn get(&self, key: &str) -> Result<Option<String>, SecretError> {
        Ok(self.read()?.get(key).cloned())
    }
    fn set(&self, key: &str, value: &str) -> Result<(), SecretError> {
        self.change(|all| {
            all.insert(key.to_owned(), value.to_owned());
        })
    }
    fn delete(&self, key: &str) -> Result<(), SecretError> {
        self.change(|all| {
            all.remove(key);
        })
    }
}
