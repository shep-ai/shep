use std::os::unix::fs::PermissionsExt;
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use shep_jsonrpc::{bind_private, serve, Client, ClientError, Handler, Peer, RpcError};

/// Echoes params; `fail` returns an application error; `watch` keeps the peer and pushes one
/// notification from another thread.
struct Echo;

impl Handler for Echo {
    fn handle(&self, method: &str, params: Value, peer: &Peer) -> Result<Value, RpcError> {
        match method {
            "echo" => Ok(params),
            "fail" => Err(RpcError::application("no task 9")),
            "watch" => {
                let peer = peer.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(20));
                    let _ = peer.notify("changed", &json!({ "n": 1 }));
                });
                Ok(json!("watching"))
            }
            other => Err(RpcError::method_not_found(other)),
        }
    }
}

fn start() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("run").join("test.sock");
    let listener = bind_private(&path).unwrap();
    std::thread::spawn(move || serve(&listener, &Arc::new(Echo)));
    (dir, path)
}

#[test]
fn a_call_round_trips_its_params() {
    let (_dir, path) = start();
    let mut client = Client::connect(&path).unwrap();
    let back: Value = client.call("echo", &json!({ "a": [1, 2] })).unwrap();
    assert_eq!(back, json!({ "a": [1, 2] }));
    let again: String = client.call("echo", &"twice").unwrap();
    assert_eq!(again, "twice", "one connection serves many calls");
}

#[test]
fn errors_come_back_typed() {
    let (_dir, path) = start();
    let mut client = Client::connect(&path).unwrap();
    match client.call::<_, Value>("fail", &json!({})) {
        Err(ClientError::Rpc(e)) => assert_eq!(e.message, "no task 9"),
        other => panic!("expected an rpc error, got {other:?}"),
    }
    match client.call::<_, Value>("nope", &json!({})) {
        Err(ClientError::Rpc(e)) => assert_eq!(e.code, RpcError::METHOD_NOT_FOUND),
        other => panic!("expected method not found, got {other:?}"),
    }
}

#[test]
fn the_server_can_push_notifications() {
    let (_dir, path) = start();
    let mut client = Client::connect(&path).unwrap();
    let ok: String = client.call("watch", &json!({})).unwrap();
    assert_eq!(ok, "watching");
    let note = client.next_notification().unwrap();
    assert_eq!(note.method, "changed");
    assert_eq!(note.params, json!({ "n": 1 }));
}

#[test]
fn the_socket_is_user_only() {
    let (_dir, path) = start();
    let mode = |p: &std::path::Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode(&path), 0o600);
    assert_eq!(mode(path.parent().unwrap()), 0o700);
}

#[test]
fn a_stale_socket_is_replaced_but_a_live_one_is_refused() {
    let (_dir, path) = start();
    let err = bind_private(&path).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::AddrInUse);

    let dir = tempfile::tempdir().unwrap();
    let stale = dir.path().join("stale.sock");
    drop(std::os::unix::net::UnixListener::bind(&stale).unwrap());
    assert!(stale.exists());
    assert!(
        bind_private(&stale).is_ok(),
        "a socket nobody serves is reused"
    );
}

#[test]
fn connecting_without_a_server_fails() {
    let dir = tempfile::tempdir().unwrap();
    assert!(Client::connect(&dir.path().join("none.sock")).is_err());
}

#[test]
fn waiting_for_a_notification_can_time_out_and_resume() {
    let (_dir, path) = start();
    let mut client = Client::connect(&path).unwrap();
    assert_eq!(
        client
            .next_notification_within(Duration::from_millis(30))
            .unwrap(),
        None
    );
    let _: String = client.call("watch", &json!({})).unwrap();
    let note = client
        .next_notification_within(Duration::from_secs(5))
        .unwrap();
    assert_eq!(note.map(|n| n.method), Some("changed".to_owned()));
}
