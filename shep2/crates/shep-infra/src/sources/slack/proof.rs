//! Proof (screenshots) into the thread with Slack's external upload: ask for an upload URL per
//! file, send the bytes there, then share them all in the thread at once.

use std::path::PathBuf;

use serde_json::json;
use shep_app::ports::SourceError;

use super::api::{Api, COMPLETE_UPLOAD, UPLOAD_URL};

pub fn upload(
    api: &Api,
    channel: &str,
    thread_ts: &str,
    files: &[PathBuf],
) -> Result<(), SourceError> {
    let mut shared = Vec::new();
    for path in files {
        // A proof file that is gone by morning is left out rather than holding back the PR.
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let length = bytes.len().to_string();
        let slot = api.post_form(UPLOAD_URL, &[("filename", &name), ("length", &length)])?;
        let (Some(url), Some(id)) = (slot["upload_url"].as_str(), slot["file_id"].as_str()) else {
            return Err(SourceError(
                "Slack gave no place to upload the proof".into(),
            ));
        };
        api.upload(url, &bytes)?;
        shared.push(json!({ "id": id, "title": name }));
    }
    if shared.is_empty() {
        return Ok(());
    }
    let body = json!({ "files": shared, "channel_id": channel, "thread_ts": thread_ts });
    api.post(COMPLETE_UPLOAD, &body)?;
    Ok(())
}
