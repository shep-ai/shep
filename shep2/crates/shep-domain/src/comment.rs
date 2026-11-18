//! Talking to Shep from GitHub: a pull request comment that starts with `shep:` sends a Ready
//! task back. Who may write it is decided by the caller (only the person Shep works for).

/// A comment that starts with this (in any case, after leading space) is meant for Shep.
pub const SEND_BACK_PREFIX: &str = "shep:";

/// The note a `shep: …` comment carries, or `None` when the comment is not for Shep or says
/// nothing after the prefix.
pub fn send_back_note(body: &str) -> Option<String> {
    let body = body.trim_start();
    let prefix = body.get(..SEND_BACK_PREFIX.len())?;
    if !prefix.eq_ignore_ascii_case(SEND_BACK_PREFIX) {
        return None;
    }
    let note = body[SEND_BACK_PREFIX.len()..].trim();
    (!note.is_empty()).then(|| note.to_owned())
}
