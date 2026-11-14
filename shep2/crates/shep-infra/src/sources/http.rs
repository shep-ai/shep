//! A small JSON client for the source APIs. It trusts the operating system's certificates (so
//! a company's own CA works), follows the proxy settings in the environment, and never puts a
//! token or a request header in an error.

use std::time::Duration;

use serde_json::Value;
use shep_app::ports::SourceError;
use ureq::tls::{RootCerts, TlsConfig};
use ureq::{Agent, Proxy};

const TIMEOUT: Duration = Duration::from_secs(30);
/// How much of a failed response's body an error quotes.
const ERROR_BODY_CHARS: usize = 300;
const LOOPBACK_HOSTS: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];
const USER_AGENT: &str = concat!("shep/", env!("CARGO_PKG_VERSION"));
const CONTENT_TYPE: &str = "Content-Type";
const JSON: &str = "application/json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verb {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

/// One API: a base URL and an agent. Paths are joined to the base; a full URL is used as is.
#[derive(Clone)]
pub struct Http {
    agent: Agent,
    base: String,
}

impl Http {
    pub fn new(base: &str) -> Self {
        let local = LOOPBACK_HOSTS
            .iter()
            .any(|h| base.contains(&format!("://{h}")));
        let proxy = if local { None } else { Proxy::try_from_env() };
        let tls = TlsConfig::builder()
            .root_certs(RootCerts::PlatformVerifier)
            .build();
        let agent: Agent = Agent::config_builder()
            .timeout_global(Some(TIMEOUT))
            .http_status_as_error(false)
            .user_agent(USER_AGENT)
            .proxy(proxy)
            .tls_config(tls)
            .build()
            .into();
        Self {
            agent,
            base: base.trim_end_matches('/').to_owned(),
        }
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn url(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            path.to_owned()
        } else {
            format!("{}/{}", self.base, path.trim_start_matches('/'))
        }
    }

    pub fn get(&self, path: &str, headers: &[(&str, &str)]) -> Result<Value, SourceError> {
        self.json(Verb::Get, path, headers, None)
    }

    pub fn post(
        &self,
        path: &str,
        headers: &[(&str, &str)],
        body: &Value,
    ) -> Result<Value, SourceError> {
        self.json(Verb::Post, path, headers, Some(body))
    }

    /// Sends JSON (or nothing) and reads JSON back; an empty answer reads as `null`.
    pub fn json(
        &self,
        verb: Verb,
        path: &str,
        headers: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<Value, SourceError> {
        let text = body.map(Value::to_string);
        let mut all: Vec<(&str, &str)> = headers.to_vec();
        if text.is_some() {
            all.push((CONTENT_TYPE, JSON));
        }
        let raw = self.send(verb, path, &all, text.as_deref().map(str::as_bytes))?;
        if raw.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&raw).map_err(|e| {
            SourceError(format!(
                "{} answered with something other than JSON: {e}",
                self.host()
            ))
        })
    }

    /// Sends raw bytes (an upload) and reads the answer as text.
    pub fn send(
        &self,
        verb: Verb,
        path: &str,
        headers: &[(&str, &str)],
        body: Option<&[u8]>,
    ) -> Result<String, SourceError> {
        let url = self.url(path);
        let fail = |e: ureq::Error| SourceError(format!("could not reach {}: {e}", self.host()));
        let response = match verb {
            Verb::Get | Verb::Delete => {
                let mut request = if verb == Verb::Get {
                    self.agent.get(&url)
                } else {
                    self.agent.delete(&url)
                };
                for (k, v) in headers {
                    request = request.header(*k, *v);
                }
                request.call().map_err(fail)?
            }
            Verb::Post | Verb::Put | Verb::Patch => {
                let mut request = match verb {
                    Verb::Post => self.agent.post(&url),
                    Verb::Put => self.agent.put(&url),
                    _ => self.agent.patch(&url),
                };
                for (k, v) in headers {
                    request = request.header(*k, *v);
                }
                request.send(body.unwrap_or_default()).map_err(fail)?
            }
        };
        let status = response.status().as_u16();
        let text = response
            .into_body()
            .read_to_string()
            .map_err(|e| SourceError(format!("{} sent an unreadable answer: {e}", self.host())))?;
        if (200..300).contains(&status) {
            return Ok(text);
        }
        let quoted: String = text.chars().take(ERROR_BODY_CHARS).collect();
        Err(SourceError(format!(
            "{} answered {status}: {}",
            self.host(),
            quoted.trim()
        )))
    }

    /// The host, for messages (never the path, which can carry ids).
    fn host(&self) -> &str {
        let rest = self.base.split("://").nth(1).unwrap_or(&self.base);
        rest.split('/').next().unwrap_or(rest)
    }
}
