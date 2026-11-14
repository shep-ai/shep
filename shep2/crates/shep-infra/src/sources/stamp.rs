//! Timestamps as the source APIs write them (RFC 3339) and as Shep keeps them (Unix seconds).

use chrono::{DateTime, SecondsFormat};
use shep_app::ports::SourceError;
use shep_domain::UnixTime;

/// `2026-11-13T18:10:00Z` or `2026-11-13T18:10:00.000Z` as Unix seconds.
pub(crate) fn parse(text: &str) -> Result<UnixTime, SourceError> {
    DateTime::parse_from_rfc3339(text)
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
        assert!(super::parse("yesterday").is_err());
    }
}
