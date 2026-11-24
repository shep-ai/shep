use shep_domain::{ClockTime, ResetAt, UnixTime};

const SECS_PER_MINUTE: i64 = 60;
const SECS_PER_HOUR: i64 = 3600;
const SECS_PER_DAY: i64 = 86_400;

/// The local day number and time of day (to the minute) at `at`.
pub fn local(at: UnixTime, utc_offset: i64) -> (i64, ClockTime) {
    let secs = at.0 + utc_offset;
    let day = secs.div_euclid(SECS_PER_DAY);
    let of_day = secs.rem_euclid(SECS_PER_DAY);
    let clock = ClockTime {
        hour: u8::try_from(of_day / SECS_PER_HOUR).unwrap_or(0),
        minute: u8::try_from(of_day % SECS_PER_HOUR / SECS_PER_MINUTE).unwrap_or(0),
    };
    (day, clock)
}

/// When a usage limit lifts. `fallback` covers an agent that did not say.
pub fn reset_at(resets: ResetAt, now: UnixTime, utc_offset: i64, fallback: i64) -> UnixTime {
    match resets {
        ResetAt::At(t) => t,
        ResetAt::InSeconds(s) => UnixTime(now.0 + s),
        ResetAt::Unknown => UnixTime(now.0 + fallback),
        ResetAt::TimeOfDay(at) => {
            let local_now = now.0 + utc_offset;
            let day_start = local_now - local_now.rem_euclid(SECS_PER_DAY);
            let mut target = day_start
                + i64::from(at.hour) * SECS_PER_HOUR
                + i64::from(at.minute) * SECS_PER_MINUTE;
            if target <= local_now {
                target += SECS_PER_DAY;
            }
            UnixTime(target - utc_offset)
        }
    }
}
