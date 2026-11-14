//! When an added task should start: now, with tonight's shift, or at a time of day.

use shep_domain::ClockTime;

const NOW: &str = "now";
const TONIGHT: &str = "tonight";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Now,
    Tonight,
    At(ClockTime),
}

impl When {
    /// Leaving it out means tonight.
    pub fn parse(text: Option<&str>) -> Result<Self, String> {
        let Some(text) = text.map(str::trim).filter(|t| !t.is_empty()) else {
            return Ok(Self::Tonight);
        };
        match text.to_ascii_lowercase().as_str() {
            NOW => Ok(Self::Now),
            TONIGHT => Ok(Self::Tonight),
            other => ClockTime::parse(other)
                .map(Self::At)
                .map_err(|_| format!("when is {NOW}, {TONIGHT} or HH:MM, not {text:?}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_now_tonight_and_a_time() {
        assert_eq!(When::parse(None), Ok(When::Tonight));
        assert_eq!(When::parse(Some(" ")), Ok(When::Tonight));
        assert_eq!(When::parse(Some("Now")), Ok(When::Now));
        assert_eq!(When::parse(Some("tonight")), Ok(When::Tonight));
        assert_eq!(
            When::parse(Some("23:15")),
            Ok(When::At(ClockTime::parse("23:15").unwrap()))
        );
        assert!(When::parse(Some("25:00")).is_err());
    }
}
