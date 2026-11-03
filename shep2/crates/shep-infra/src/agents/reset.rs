//! When a usage limit lifts, from the agent's own words: an epoch after `|`, a time of day
//! after "resets" or "try again at", or a duration after "try again in".

use shep_domain::{ClockTime, ResetAt, UnixTime};

const EPOCH_MARK: &str = "reached|";
const TIME_MARKS: [&str; 2] = ["resets", "try again at"];
const DURATION_MARK: &str = "try again in";
const HOURS_PER_HALF_DAY: u8 = 12;
const SECS_PER_HOUR: i64 = 3600;
const SECS_PER_MINUTE: i64 = 60;

/// `text` is lowercase and starts at the limit message.
pub fn parse(text: &str) -> ResetAt {
    if let Some(epoch) = after(text, EPOCH_MARK).and_then(leading_number) {
        return ResetAt::At(UnixTime(epoch));
    }
    if let Some(time) = TIME_MARKS
        .iter()
        .filter_map(|mark| after(text, mark))
        .find_map(|rest| last_clock(first_line(rest)))
    {
        return ResetAt::TimeOfDay(time);
    }
    if let Some(secs) = after(text, DURATION_MARK).and_then(|r| duration(first_line(r))) {
        return ResetAt::InSeconds(secs);
    }
    ResetAt::Unknown
}

fn after<'a>(text: &'a str, mark: &str) -> Option<&'a str> {
    text.find(mark).map(|i| &text[i + mark.len()..])
}

fn first_line(text: &str) -> &str {
    text.lines().next().unwrap_or_default()
}

fn leading_number(text: &str) -> Option<i64> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// The last `h[:mm] am|pm` (or `hh:mm`) in the text.
fn last_clock(text: &str) -> Option<ClockTime> {
    let bytes = text.as_bytes();
    let mut found = None;
    for start in 0..bytes.len() {
        // A number starts after something that is neither a digit nor a colon, so the
        // minutes of "3:05" are never read as an hour of their own.
        let starts_number = bytes[start].is_ascii_digit()
            && (start == 0 || !(bytes[start - 1].is_ascii_digit() || bytes[start - 1] == b':'));
        if starts_number {
            if let Some(clock) = clock_at(&text[start..]) {
                found = Some(clock);
            }
        }
    }
    found
}

fn clock_at(text: &str) -> Option<ClockTime> {
    let hour_digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if hour_digits.is_empty() || hour_digits.len() > 2 {
        return None;
    }
    let mut hour: u8 = hour_digits.parse().ok()?;
    let mut rest = &text[hour_digits.len()..];
    let mut minute = 0;
    let mut has_minutes = false;
    if let Some(after_colon) = rest.strip_prefix(':') {
        let minute_digits: String = after_colon
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        if minute_digits.len() != 2 {
            return None;
        }
        minute = minute_digits.parse().ok()?;
        rest = &after_colon[2..];
        has_minutes = true;
    }
    let rest = rest.trim_start();
    let pm = rest.starts_with("pm");
    if rest.starts_with("am") || pm {
        if hour == 0 || hour > HOURS_PER_HALF_DAY {
            return None;
        }
        hour %= HOURS_PER_HALF_DAY;
        if pm {
            hour += HOURS_PER_HALF_DAY;
        }
    } else if !has_minutes {
        return None;
    }
    ClockTime::parse(&format!("{hour:02}:{minute:02}")).ok()
}

/// "2 hours 13 minutes" → seconds.
fn duration(text: &str) -> Option<i64> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut secs = 0;
    for pair in words.windows(2) {
        let Ok(n) = pair[0].parse::<i64>() else {
            continue;
        };
        if pair[1].starts_with("hour") {
            secs += n * SECS_PER_HOUR;
        } else if pair[1].starts_with("min") {
            secs += n * SECS_PER_MINUTE;
        }
    }
    (secs > 0).then_some(secs)
}
