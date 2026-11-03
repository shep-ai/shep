//! Just enough HTTP/1.1 for one request per connection.

use std::io::{BufRead, BufReader, Read};
use std::net::TcpStream;

/// Every answer is an event stream, and the connection closes after it.
pub const STREAM_HEADER: &str = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\
     cache-control: no-cache\r\nrequest-id: req_mock\r\nconnection: close\r\n\r\n";

/// Only `POST /v1/messages` is answered; anything else is not found.
pub const POST: &str = "POST ";
pub const NOT_FOUND: &str =
    "HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n";

const CONTENT_LENGTH: &str = "content-length:";
const CHUNKED: &str = "transfer-encoding: chunked";
const HEX: u32 = 16;

/// A request: its first line (method and path) and body.
pub struct Request {
    pub line: String,
    pub body: Vec<u8>,
}

/// Reads the request line and headers, then the body (by length or in chunks).
pub fn read_request(stream: &mut TcpStream) -> std::io::Result<Request> {
    let mut reader = BufReader::new(stream);
    let mut first = String::new();
    reader.read_line(&mut first)?;
    let line = first.trim().to_owned();
    let body = read_body(&mut reader)?;
    Ok(Request { line, body })
}

fn read_body(reader: &mut BufReader<&mut TcpStream>) -> std::io::Result<Vec<u8>> {
    let mut length = 0;
    let mut chunked = false;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Ok(Vec::new());
        }
        let lower = line.trim().to_ascii_lowercase();
        if lower.is_empty() {
            break;
        }
        if let Some(n) = lower.strip_prefix(CONTENT_LENGTH) {
            length = n.trim().parse().unwrap_or(0);
        }
        chunked |= lower == CHUNKED;
    }
    if !chunked {
        let mut body = vec![0; length];
        reader.read_exact(&mut body)?;
        return Ok(body);
    }
    let mut body = Vec::new();
    loop {
        let mut size = String::new();
        reader.read_line(&mut size)?;
        let size = usize::try_from(u32::from_str_radix(size.trim(), HEX).unwrap_or(0)).unwrap_or(0);
        let mut chunk = vec![0; size + 2];
        reader.read_exact(&mut chunk)?;
        if size == 0 {
            return Ok(body);
        }
        body.extend_from_slice(&chunk[..size]);
    }
}
