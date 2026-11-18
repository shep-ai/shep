//! Timestamps as the source APIs write them (RFC 3339) and as Shep keeps them (Unix seconds).

use chrono::{DateTime, SecondsFormat};
use shep_app::ports::SourceError;
use shep_domain::UnixTime;

/// Jira writes offsets without a colon (`+0000`), which RFC 3339 does not allow.
const OFFSET_WITHOUT_COLON: &str = "%Y-%m-%dT%H:%M:%S%.f%z";

/// `2026-11-13T18:10:00Z`, `2026-11-13T18:10:00.000Z` or Jira's `2026-11-13T18:10:00.000+0000`
/// as Unix seconds.
pub(crate) fn parse(text: &str) -> Result<UnixTime, SourceError> {
    DateTime::parse_from_rfc3339(text)
        .or_else(|_| DateTime::parse_from_str(text, OFFSET_WITHOUT_COLON))
        .map(|t| UnixTime(t.timestamp()))
        .map_err(|e| SourceError(format!("unreadable time {text:?}: {e}")))
}

/// Unix seconds as `2026-11-13T18:10:00Z`.
pub(crate) fn format(at: UnixTime) -> String {
    DateTime::from_timestamp(at.0, 0)
        .unwrap_or_default()
        .to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use shep_domain::UnixTime;

    #[test]
    fn round_trips_both_spellings() {
        let at = UnixTime(1_794_593_400);
        assert_eq!(super::format(at), "2026-11-13T18:10:00Z");
        assert_eq!(super::parse("2026-11-13T18:10:00Z").unwrap(), at);
        assert_eq!(super::parse("2026-11-13T18:10:00.000Z").unwrap(), at);
        assert_eq!(super::parse("2026-11-13T18:10:00.000+0000").unwrap(), at);
        assert!(super::parse("yesterday").is_err());
    }
}
