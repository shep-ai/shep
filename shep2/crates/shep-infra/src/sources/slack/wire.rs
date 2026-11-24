//! Opening Socket Mode's websocket: TLS with the operating system's verifier (as the Web API
//! client does), through the environment's HTTP proxy with `CONNECT` when one is set. Errors
//! never quote the URL, whose ticket is a credential.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine as _;
use rustls::ClientConfig;
use rustls_platform_verifier::BuilderVerifierExt;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Connector, WebSocket};
use ureq::http::Uri;
use ureq::{Proxy, ProxyProtocol};

pub type Ws = WebSocket<MaybeTlsStream<TcpStream>>;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const SECURE_SCHEME: &str = "wss";
const PLAIN_SCHEME: &str = "ws";
const SECURE_PORT: u16 = 443;
const PLAIN_PORT: u16 = 80;
const LOOPBACK_HOSTS: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];
/// A proxy's answer to `CONNECT` is a few headers; more than this is not a proxy.
const MAX_PROXY_ANSWER: usize = 8 * 1024;
const HEADERS_END: &[u8] = b"\r\n\r\n";
const PROXY_OK: &str = " 200";

/// Connects and completes the handshake; reads then wait at most `tick`, so the caller can
/// notice it was told to stop.
pub fn connect(url: &str, tick: Duration) -> Result<Ws, String> {
    let uri: Uri = url
        .parse()
        .map_err(|_| "Slack gave an unreadable socket address".to_owned())?;
    let host = uri
        .host()
        .ok_or("Slack's socket address has no host")?
        .to_owned();
    let secure = match uri.scheme_str() {
        Some(SECURE_SCHEME) => true,
        Some(PLAIN_SCHEME) => false,
        _ => return Err("Slack's socket address is not a websocket".to_owned()),
    };
    let port = uri
        .port_u16()
        .unwrap_or(if secure { SECURE_PORT } else { PLAIN_PORT });
    let proxy = if LOOPBACK_HOSTS.contains(&host.as_str()) {
        None
    } else {
        Proxy::try_from_env().filter(|p| !p.is_no_proxy(&uri))
    };
    let stream = match &proxy {
        Some(proxy) => tunnel(proxy, &host, port)?,
        None => dial(&host, port)?,
    };
    stream
        .set_read_timeout(Some(CONNECT_TIMEOUT))
        .and_then(|()| stream.set_write_timeout(Some(CONNECT_TIMEOUT)))
        .map_err(|e| format!("could not set up the socket: {e}"))?;
    let connector = if secure {
        Connector::Rustls(Arc::new(tls()?))
    } else {
        Connector::Plain
    };
    let (ws, _) =
        tungstenite::client_tls_with_config(url, stream, None, Some(connector)).map_err(|e| {
            format!(
                "could not open Slack's socket on {host}: {}",
                handshake_error(&e)
            )
        })?;
    tcp(&ws)?
        .set_read_timeout(Some(tick))
        .map_err(|e| format!("could not set up the socket: {e}"))?;
    Ok(ws)
}

fn handshake_error<S: tungstenite::handshake::HandshakeRole>(
    e: &tungstenite::HandshakeError<S>,
) -> String {
    match e {
        tungstenite::HandshakeError::Failure(tungstenite::Error::Http(response)) => {
            format!("it answered {}", response.status())
        }
        tungstenite::HandshakeError::Failure(tungstenite::Error::Io(io)) => io.to_string(),
        tungstenite::HandshakeError::Failure(tungstenite::Error::Tls(tls)) => tls.to_string(),
        tungstenite::HandshakeError::Failure(_) => "the handshake failed".to_owned(),
        tungstenite::HandshakeError::Interrupted(_) => "the handshake timed out".to_owned(),
    }
}

/// The TCP stream under the websocket.
pub fn tcp(ws: &Ws) -> Result<&TcpStream, String> {
    match ws.get_ref() {
        MaybeTlsStream::Plain(tcp) => Ok(tcp),
        MaybeTlsStream::Rustls(tls) => Ok(tls.get_ref()),
        _ => Err("an unexpected kind of socket".to_owned()),
    }
}

fn tls() -> Result<ClientConfig, String> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .and_then(BuilderVerifierExt::with_platform_verifier)
        .map(rustls::ConfigBuilder::<ClientConfig, _>::with_no_client_auth)
        .map_err(|e| format!("could not set up TLS: {e}"))
}

fn dial(host: &str, port: u16) -> Result<TcpStream, String> {
    let unreachable = |e: &dyn std::fmt::Display| format!("could not reach {host}: {e}");
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|e| unreachable(&e))?;
    let mut last = String::from("no address");
    for address in addresses {
        match TcpStream::connect_timeout(&address, CONNECT_TIMEOUT) {
            Ok(stream) => return Ok(stream),
            Err(e) => last = e.to_string(),
        }
    }
    Err(unreachable(&last))
}

/// A TCP stream to `host:port` through an HTTP proxy's `CONNECT`.
pub fn tunnel(proxy: &Proxy, host: &str, port: u16) -> Result<TcpStream, String> {
    if proxy.protocol() != ProxyProtocol::Http {
        return Err(format!(
            "the proxy in the environment is {:?}; Slack's socket goes only through HTTP proxies",
            proxy.protocol()
        ));
    }
    let mut stream = dial(proxy.host(), proxy.port())?;
    stream
        .set_read_timeout(Some(CONNECT_TIMEOUT))
        .map_err(|e| format!("could not set up the proxy connection: {e}"))?;
    let target = format!("{host}:{port}");
    let mut ask = format!("CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n");
    if let Some(user) = proxy.username() {
        let pair = format!("{user}:{}", proxy.password().unwrap_or_default());
        let encoded = base64::engine::general_purpose::STANDARD.encode(pair);
        ask = format!("{ask}Proxy-Authorization: Basic {encoded}\r\n");
    }
    ask.push_str("\r\n");
    let refused = |why: &str| format!("the proxy would not reach {host}: {why}");
    stream
        .write_all(ask.as_bytes())
        .map_err(|e| refused(&e.to_string()))?;
    let mut answer = Vec::new();
    let mut byte = [0u8; 1];
    while !answer.ends_with(HEADERS_END) {
        if answer.len() > MAX_PROXY_ANSWER {
            return Err(refused("it answered with too much"));
        }
        match stream.read(&mut byte) {
            Ok(0) => return Err(refused("it hung up")),
            Ok(_) => answer.push(byte[0]),
            Err(e) => return Err(refused(&e.to_string())),
        }
    }
    let status = String::from_utf8_lossy(&answer);
    let line = status.lines().next().unwrap_or_default();
    if !line.contains(PROXY_OK) {
        return Err(refused(line));
    }
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;

    use super::*;

    /// A one-shot proxy: answers `CONNECT` with `status`, then says `through` on the tunnel.
    /// Joining it gives the request lines it read.
    fn proxy(status: &'static str) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap().to_string();
        let asked = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut lines = Vec::new();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line.trim().is_empty() {
                    break;
                }
                lines.push(line.trim().to_owned());
            }
            write!(stream, "HTTP/1.1 {status}\r\nX-Proxy: test\r\n\r\nthrough").unwrap();
            lines
        });
        (address, asked)
    }

    #[test]
    fn a_tunnel_goes_through_the_proxy_with_its_credentials() {
        let (address, asked) = proxy("200 Connection established");
        let proxy = Proxy::new(&format!("http://me:secret@{address}")).unwrap();
        let mut stream = tunnel(&proxy, "wss-primary.slack.com", SECURE_PORT).unwrap();
        let mut said = [0u8; 7];
        stream.read_exact(&mut said).unwrap();
        assert_eq!(
            &said, b"through",
            "the tunnel starts right after the headers"
        );
        let asked = asked.join().unwrap();
        assert_eq!(asked[0], "CONNECT wss-primary.slack.com:443 HTTP/1.1");
        assert!(asked.contains(&"Host: wss-primary.slack.com:443".to_owned()));
        let basic = base64::engine::general_purpose::STANDARD.encode("me:secret");
        assert!(asked.contains(&format!("Proxy-Authorization: Basic {basic}")));
    }

    #[test]
    fn a_proxy_that_refuses_says_why_and_other_kinds_are_named() {
        let (address, asked) = proxy("407 Proxy Authentication Required");
        let proxy = Proxy::new(&format!("http://{address}")).unwrap();
        let err = tunnel(&proxy, "wss-primary.slack.com", SECURE_PORT).unwrap_err();
        assert!(err.contains("407"), "{err}");
        let _ = asked.join();
        let socks = Proxy::new("socks5://127.0.0.1:1080").unwrap();
        let err = tunnel(&socks, "wss-primary.slack.com", SECURE_PORT).unwrap_err();
        assert!(err.contains("Socks5"), "{err}");
    }

    #[test]
    fn only_websocket_addresses_are_opened() {
        let err = connect("https://slack.com/api", Duration::from_millis(10)).unwrap_err();
        assert!(err.contains("not a websocket"), "{err}");
    }
}
