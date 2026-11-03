use std::time::{SystemTime, UNIX_EPOCH};

use shep_app::Clock;
use shep_domain::UnixTime;

/// The real wall clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> UnixTime {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs());
        UnixTime(i64::try_from(secs).unwrap_or(i64::MAX))
    }

    fn utc_offset(&self) -> i64 {
        i64::from(chrono::Local::now().offset().local_minus_utc())
    }
}
