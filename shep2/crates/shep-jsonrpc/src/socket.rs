use std::io;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;

const DIR_MODE: u32 = 0o700;
const SOCKET_MODE: u32 = 0o600;

/// Binds a socket only the current user can reach: its directory is `0700` (so nobody else can
/// get to it, even before the socket's own mode is set) and the socket is `0600`.
///
/// A leftover socket file that nobody answers on is replaced; a live one is refused with
/// [`io::ErrorKind::AddrInUse`], so two daemons never serve the same home.
pub fn bind_private(path: &Path) -> io::Result<UnixListener> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(DIR_MODE))?;
    }
    if path.exists() {
        if UnixStream::connect(path).is_ok() {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                format!("{} is already served", path.display()),
            ));
        }
        std::fs::remove_file(path)?;
    }
    let listener = UnixListener::bind(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(SOCKET_MODE))?;
    Ok(listener)
}
