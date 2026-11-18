//! A Slack message as its permalink names it:
//! `https://<team>.slack.com/archives/<channel>/p<ts without the dot>`, plus
//! `?thread_ts=<parent ts>&cid=<channel>` when the message is a reply in a thread.

use shep_app::ports::SourceError;
use shep_domain::TaskSourceRef;

const ARCHIVES: &str = "/archives/";
const TS_PREFIX: char = 'p';
/// A message `ts` is seconds, a dot and six digits; the permalink drops the dot.
const TS_FRACTION_DIGITS: usize = 6;
const THREAD_TS_PARAM: &str = "thread_ts";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MessageLink {
    pub channel: String,
    /// The message's own `ts`, like `1700000000.000100`.
    pub ts: String,
    /// The parent's `ts` when the message is a reply in a thread.
    pub thread_ts: Option<String>,
}

impl MessageLink {
    pub fn parse(url: &str) -> Option<Self> {
        let (path, query) = url.split_once('?').unwrap_or((url, ""));
        let (_, rest) = path.split_once(ARCHIVES)?;
        let mut segments = rest.split('/').filter(|s| !s.is_empty());
        let channel = segments.next()?;
        let digits = segments.next()?.strip_prefix(TS_PREFIX)?;
        let valid_channel =
            !channel.is_empty() && channel.chars().all(|c| c.is_ascii_alphanumeric());
        if !valid_channel || digits.len() <= TS_FRACTION_DIGITS || !is_digits(digits) {
            return None;
        }
        let (seconds, fraction) = digits.split_at(digits.len() - TS_FRACTION_DIGITS);
        let ts = format!("{seconds}.{fraction}");
        let thread_ts = query
            .split('&')
            .filter_map(|pair| pair.split_once('='))
            .find(|(key, _)| *key == THREAD_TS_PARAM)
            .map(|(_, value)| value.to_owned())
            .filter(|parent| ts_seconds(parent).is_some() && *parent != ts);
        Some(Self {
            channel: channel.to_owned(),
            ts,
            thread_ts,
        })
    }

    /// The link inside a task's source reference.
    pub fn from_ref(source: &TaskSourceRef) -> Result<Self, SourceError> {
        let TaskSourceRef::Slack { url } = source else {
            return Err(SourceError(format!("{source} is not a Slack message")));
        };
        Self::parse(url).ok_or_else(|| {
            SourceError(format!(
                "{url} is not a Slack message link; copy one with \"Copy link\" on the message"
            ))
        })
    }

    /// The thread Shep answers in: the parent of a reply, or the message itself.
    pub fn thread(&self) -> &str {
        self.thread_ts.as_deref().unwrap_or(&self.ts)
    }
}

/// The whole seconds of a Slack `ts`.
pub fn ts_seconds(ts: &str) -> Option<i64> {
    let (seconds, fraction) = ts.split_once('.').unwrap_or((ts, "0"));
    if !is_digits(seconds) || !is_digits(fraction) {
        return None;
    }
    seconds.parse().ok()
}

/// Orders `ts` values (seconds, then the fraction).
pub fn ts_order(ts: &str) -> (i64, i64) {
    let (seconds, fraction) = ts.split_once('.').unwrap_or((ts, "0"));
    (
        seconds.parse().unwrap_or_default(),
        fraction.parse().unwrap_or_default(),
    )
}

fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}
