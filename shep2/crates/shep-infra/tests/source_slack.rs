//! Slack: the Web API against recorded fixtures, and Socket Mode against a local websocket
//! server that `apps.connections.open` points at.

mod slack_socket;
mod support;

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use shep_app::ports::{Reply, SourceProviders, TaskSource, Update};
use shep_domain::{ClockTime, PullRequest, SourceKind, TaskSourceRef, UnixTime};
use shep_infra::secrets::{FileSecrets, SecretStore};
use shep_infra::sources::slack::{MessageLink, SlackFactory, APP_TOKEN, BOT_TOKEN};
use shep_infra::sources::SourceRegistry;
use slack_socket::{SocketServer, DROP};
use support::fixture_http::{fixture, FixtureServer, Request};
use support::source_contract::{self, Case};

const BOT: &str = "xoxb-1111-2222-fake-bot-token";
const APP: &str = "xapp-1-A0SHEPAPP1-3333-fake-app-token";
const ITEM: &str = "https://acme.slack.com/archives/C0BUGS0001/p1763139720000100";
const REPLY_ITEM: &str = "https://acme.slack.com/archives/C0BUGS0001/p1763140000000500?thread_ts=1763139720.000100&cid=C0BUGS0001";
const ROOT_TS: &str = "1763139720.000100";
const REPLY_TS: &str = "1763140000.000500";
const CHANNEL: &str = "C0BUGS0001";
const SINCE: UnixTime = UnixTime(1_763_150_000);
const PRESSED_AT: i64 = 1_763_151_600;
const WAIT: Duration = Duration::from_secs(10);

fn frame(name: &str) -> String {
    fixture(&format!("slack/{name}.json"))
}

fn parsed(name: &str) -> Value {
    serde_json::from_str(&frame(name)).unwrap()
}

/// The frames a connection sends, by fixture name (or [`DROP`]).
fn script(names: &[&str]) -> Vec<String> {
    names
        .iter()
        .map(|n| {
            if *n == DROP {
                DROP.to_owned()
            } else {
                frame(n)
            }
        })
        .collect()
}

fn item(url: &str) -> TaskSourceRef {
    TaskSourceRef::Slack { url: url.into() }
}

fn values(bot: &str, app: &str) -> BTreeMap<String, String> {
    BTreeMap::from([
        (BOT_TOKEN.to_owned(), bot.to_owned()),
        (APP_TOKEN.to_owned(), app.to_owned()),
    ])
}

/// The Web API answering every call the adapter makes, with Socket Mode at `socket`.
fn slack_api(server: &FixtureServer, socket: &str) {
    server.on("POST", "/auth.test", 200, &frame("auth_test"));
    let mut open = parsed("apps_connections_open");
    open["url"] = socket.into();
    server.on("POST", "/apps.connections.open", 200, &open.to_string());
    server.on(
        "GET",
        "/conversations.replies",
        200,
        &frame("conversations_replies"),
    );
    server.on(
        "GET",
        "/chat.getPermalink",
        200,
        &frame("chat_getPermalink"),
    );
    server.on("POST", "/chat.postMessage", 200, &frame("chat_postMessage"));
    server.on(
        "POST",
        "/chat.postEphemeral",
        200,
        &frame("chat_postEphemeral"),
    );
    server.on(
        "GET",
        "/users.conversations",
        200,
        &frame("users_conversations"),
    );
    for channel in ["bugs", "eng"] {
        let id = if channel == "bugs" {
            CHANNEL
        } else {
            "C0ENG00001"
        };
        let path = format!("/conversations.history?channel={id}");
        let body = frame(&format!("conversations_history_{channel}"));
        server.on("GET", &path, 200, &body);
    }
    let mut upload = parsed("files_getUploadURLExternal");
    upload["upload_url"] = format!("{}/upload/v1/ABC123", server.url()).into();
    server.on(
        "POST",
        "/files.getUploadURLExternal",
        200,
        &upload.to_string(),
    );
    server.on("POST", "/upload/v1/", 200, "OK - 9");
    let complete = frame("files_completeUploadExternal");
    server.on("POST", "/files.completeUploadExternal", 200, &complete);
}

/// Field order is drop order: the adapter (held by the registry too) goes first, so its
/// thread has stopped before the servers do.
struct Rig {
    source: Arc<dyn TaskSource>,
    registry: SourceRegistry,
    socket: SocketServer,
    server: FixtureServer,
    _dir: tempfile::TempDir,
}

fn rig(scripts: Vec<Vec<String>>) -> Rig {
    rig_with(scripts, |_| {})
}

/// `before` changes the Web API after connecting and before the adapter starts.
fn rig_with(scripts: Vec<Vec<String>>, before: impl Fn(&FixtureServer)) -> Rig {
    let socket = SocketServer::start(scripts);
    let server = FixtureServer::start();
    slack_api(&server, socket.url());
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let factory = SlackFactory::at(server.url());
    let registry = SourceRegistry::new(store, vec![Box::new(factory)]);
    let setting = registry
        .connect(SourceKind::Slack, &values(BOT, APP))
        .unwrap();
    before(&server);
    let source = registry.source(&setting).unwrap();
    Rig {
        source,
        registry,
        socket,
        server,
        _dir: dir,
    }
}

fn case() -> Case<'static> {
    Case {
        kind: SourceKind::Slack,
        item: item(ITEM),
        token: BOT,
        reply: "Use the store's zone & keep",
        shep_said: "Which zone when the customer has none",
        since: SINCE,
    }
}

fn wait_for(what: &str, done: impl Fn() -> bool) {
    let deadline = Instant::now() + WAIT;
    while !done() {
        assert!(Instant::now() < deadline, "never saw {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn calls(server: &FixtureServer, method: &str) -> Vec<Request> {
    let path = format!("/{method}");
    server
        .requests()
        .into_iter()
        .filter(|r| r.path.starts_with(&path))
        .collect()
}

#[test]
fn the_shared_contract_holds() {
    let rig = rig(vec![script(&["socket_hello", "socket_reaction_added"])]);
    rig.socket
        .wait_until("the hand-over acknowledged", |s| s.acks.len() == 1);
    source_contract::holds(&case(), &rig.server, rig.source.as_ref());
}

#[test]
fn a_revoked_token_fails_politely() {
    let rig = rig(vec![script(&["socket_hello", "socket_reaction_added"])]);
    rig.socket
        .wait_until("the hand-over acknowledged", |s| s.acks.len() == 1);
    source_contract::fails_politely(&case(), &rig.server, rig.source.as_ref());
    let err = rig.source.connection().unwrap_err();
    assert!(!err.0.contains(APP), "{err}");
}

#[test]
fn connecting_proves_both_tokens_and_keeps_them_out_of_settings() {
    let socket = SocketServer::start(vec![script(&["socket_hello"])]);
    let server = FixtureServer::start();
    slack_api(&server, socket.url());
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(FileSecrets::new(dir.path().join("secrets.json")));
    let registry = SourceRegistry::new(
        store.clone(),
        vec![Box::new(SlackFactory::at(server.url()))],
    );

    let form = registry.form(SourceKind::Slack);
    let keys: Vec<&str> = form.fields.iter().map(|f| f.key.as_str()).collect();
    assert_eq!(keys, [BOT_TOKEN, APP_TOKEN]);
    assert!(form.fields.iter().all(|f| f.secret && !f.optional));
    assert!(form.fields[0].hint.contains("xoxb-"), "{form:?}");
    assert!(form.fields[1].hint.contains("xapp-"), "{form:?}");
    let moves = form.hand_over.join(" ");
    assert!(
        moves.contains(":sheep:") && moves.contains("tonight"),
        "{moves}"
    );

    let setting = registry
        .connect(SourceKind::Slack, &values(BOT, APP))
        .unwrap();
    assert_eq!(setting.account, "Acme");
    assert!(setting.options.values().all(|v| v != BOT && v != APP));
    assert_eq!(store.get("slack/bot_token").unwrap().as_deref(), Some(BOT));
    assert_eq!(store.get("slack/app_token").unwrap().as_deref(), Some(APP));
    let bearer = |token: &str| format!("Bearer {token}");
    let auth = calls(&server, "auth.test");
    assert_eq!(auth[0].header("authorization"), Some(bearer(BOT).as_str()));
    let open = calls(&server, "apps.connections.open");
    assert_eq!(open[0].header("authorization"), Some(bearer(APP).as_str()));

    let swapped = registry
        .connect(SourceKind::Slack, &values(APP, BOT))
        .unwrap_err();
    assert!(swapped.0.contains("xoxb-"), "{swapped}");
    server.on("POST", "/auth.test", 200, &frame("error_invalid_auth"));
    let refused = registry
        .connect(SourceKind::Slack, &values(BOT, APP))
        .unwrap_err();
    assert!(refused.0.contains("invalid_auth"), "{refused}");
    for err in [swapped, refused] {
        assert!(!err.0.contains(BOT) && !err.0.contains(APP), "{err}");
    }
}

#[test]
fn every_envelope_is_acknowledged_and_only_hand_overs_are_kept() {
    let mut thumbs = parsed("socket_reaction_added");
    thumbs["envelope_id"] = "thumbs-1".into();
    thumbs["payload"]["event"]["reaction"] = "thumbsup".into();
    let mut chatter = parsed("socket_app_mention");
    chatter["envelope_id"] = "chatter-1".into();
    chatter["payload"]["event"]["text"] = "<@U0SHEPBOT1> what's this about?".into();
    chatter["payload"]["event"]["channel"] = "C0ENG00001".into();
    let mut frames = script(&[
        "socket_hello",
        "socket_reaction_added",
        "socket_app_mention",
        "socket_block_actions",
    ]);
    frames.extend([thumbs.to_string(), chatter.to_string()]);
    let rig = rig(vec![frames]);

    let seen = rig
        .socket
        .wait_until("five acknowledgements", |s| s.acks.len() == 5);
    let ids = [
        "socket_reaction_added",
        "socket_app_mention",
        "socket_block_actions",
    ]
    .map(|n| parsed(n)["envelope_id"].as_str().unwrap().to_owned());
    assert_eq!(seen.acks[..3], ids);
    assert_eq!(seen.acks[3..], ["thumbs-1", "chatter-1"]);

    let polled = rig.source.poll().unwrap();
    let urls: Vec<&str> = polled.iter().map(|h| h.url.as_str()).collect();
    assert_eq!(
        urls,
        [ITEM],
        "the :sheep: and the \"tonight\" are one hand-over"
    );
    assert!(rig.source.poll().unwrap().is_empty(), "drained");
}

#[test]
fn a_disconnect_envelope_reconnects_at_once() {
    let rig = rig(vec![
        script(&["socket_hello", "socket_disconnect"]),
        script(&["socket_hello", "socket_reaction_added"]),
    ]);
    let seen = rig.socket.wait_until("the second connection", |s| {
        s.connections == 2 && s.acks.len() == 1 && s.closed == 1
    });
    assert_eq!(seen.closed, 1, "the first connection is closed by Shep");
    let polled = rig.source.poll().unwrap();
    assert_eq!(polled[0].source, item(ITEM));
    assert!(rig.source.connection().is_ok());
}

#[test]
fn a_broken_connection_reconnects_after_a_pause() {
    let started = Instant::now();
    let rig = rig(vec![
        script(&["socket_hello", DROP]),
        script(&["socket_hello", "socket_reaction_added"]),
    ]);
    rig.socket
        .wait_until("a reconnect", |s| s.connections == 2 && s.acks.len() == 1);
    assert!(
        started.elapsed() >= Duration::from_millis(900),
        "backed off before reconnecting: {:?}",
        started.elapsed()
    );
    assert_eq!(rig.source.poll().unwrap().len(), 1);
}

#[test]
fn a_merge_press_is_a_merge_on_its_own_thread() {
    let mut send_back = parsed("socket_block_actions");
    send_back["envelope_id"] = "send-back-1".into();
    send_back["payload"]["actions"][0]["action_id"] = "shep_send_back".into();
    send_back["payload"]["actions"][0]["action_ts"] = "1763151700.000001".into();
    let mut frames = script(&["socket_hello", "socket_block_actions"]);
    frames.push(send_back.to_string());
    let rig = rig(vec![frames]);
    rig.socket.wait_until("both presses", |s| s.acks.len() == 2);

    let merges = |url: &str, since: UnixTime| -> Vec<Reply> {
        let replies = rig.source.replies(&item(url), since).unwrap();
        replies
            .into_iter()
            .filter(|r| matches!(r, Reply::Merge { .. }))
            .collect()
    };
    let merge = Reply::Merge {
        at: UnixTime(PRESSED_AT),
        author: "U0YOU00001".into(),
    };
    assert_eq!(
        merges(ITEM, SINCE),
        std::slice::from_ref(&merge),
        "one Merge, no Send back"
    );
    assert_eq!(
        merges(REPLY_ITEM, SINCE),
        [merge],
        "a reply's thread is its parent's"
    );
    let other = "https://acme.slack.com/archives/C0ENG00001/p1763146000000900";
    assert!(merges(other, SINCE).is_empty(), "another thread");
    assert!(merges(ITEM, UnixTime(PRESSED_AT + 1)).is_empty(), "too old");

    wait_for("two private answers", || {
        calls(&rig.server, "chat.postEphemeral").len() == 2
    });
    let answers: Vec<Value> = calls(&rig.server, "chat.postEphemeral")
        .iter()
        .map(Request::json)
        .collect();
    for answer in &answers {
        assert_eq!(answer["channel"], CHANNEL);
        assert_eq!(answer["user"], "U0YOU00001");
        assert_eq!(answer["thread_ts"], ROOT_TS);
    }
    let texts: Vec<&str> = answers.iter().filter_map(|a| a["text"].as_str()).collect();
    assert!(texts.iter().any(|t| t.contains("shep:")), "{texts:?}");
}

#[test]
fn shep_never_hears_itself_or_the_message_it_was_handed() {
    let rig = rig(vec![script(&["socket_hello"])]);
    let replies = rig.source.replies(&item(ITEM), UnixTime(0)).unwrap();
    let said: Vec<(&str, &str)> = replies
        .iter()
        .filter_map(|r| match r {
            Reply::Said { author, text, .. } => Some((author.as_str(), text.as_str())),
            Reply::Merge { .. } => None,
        })
        .collect();
    assert_eq!(
        said,
        [
            ("U0YOU00001", "Is this the Safari 18 bug?"),
            (
                "U0DANA0001",
                "Use the store's zone & keep the customer's if set."
            ),
        ]
    );
    let times: Vec<i64> = replies.iter().map(|r| r.at().0).collect();
    assert_eq!(times, [1_763_140_000, 1_763_150_200], "oldest first");
    let asked = calls(&rig.server, "conversations.replies");
    assert!(
        asked[0].path.contains(&format!("ts={ROOT_TS}")),
        "{asked:?}"
    );
}

#[test]
fn permalinks_name_the_channel_message_and_thread() {
    let top = MessageLink::parse(ITEM).unwrap();
    assert_eq!(
        (
            top.channel.as_str(),
            top.ts.as_str(),
            top.thread_ts.as_deref()
        ),
        (CHANNEL, ROOT_TS, None)
    );
    assert_eq!(top.thread(), ROOT_TS);
    let reply = MessageLink::parse(REPLY_ITEM).unwrap();
    assert_eq!(reply.ts, REPLY_TS);
    assert_eq!(reply.thread(), ROOT_TS);
    let grid = "https://acme.enterprise.slack.com/archives/C0BUGS0001/p1763139720000100";
    assert_eq!(MessageLink::parse(grid), Some(top.clone()));
    let redundant = format!("{ITEM}?thread_ts={ROOT_TS}&cid={CHANNEL}");
    assert_eq!(MessageLink::parse(&redundant), Some(top));
    for bad in [
        "https://acme.slack.com/archives/C0BUGS0001",
        "https://acme.slack.com/archives/C0BUGS0001/x1763139720000100",
        "https://acme.slack.com/archives/C0BUGS0001/p123456",
        "https://acme.slack.com/archives/C0BUGS0001/p17631397200001x0",
        "https://acme.slack.com/team/U0DANA0001",
    ] {
        assert_eq!(MessageLink::parse(bad), None, "{bad}");
    }
    let github = TaskSourceRef::GitHubIssue {
        repo: None,
        number: 4,
    };
    assert!(MessageLink::from_ref(&github).is_err());
    assert!(MessageLink::from_ref(&item("https://acme.slack.com/x")).is_err());
}

#[test]
fn tonight_in_a_thread_hands_over_the_thread() {
    let rig = rig(vec![script(&["socket_hello", "socket_app_mention"])]);
    rig.socket
        .wait_until("the mention acknowledged", |s| s.acks.len() == 1);
    let polled = rig.source.poll().unwrap();
    assert_eq!(polled.len(), 1);
    let handed = &polled[0];
    assert_eq!(handed.source, item(ITEM));
    assert_eq!(handed.url, ITEM);
    assert_eq!(
        handed.title,
        "Checkout does nothing on Safari when the cart has a coupon."
    );
    assert!(handed.body.contains("Repro: add any item"), "{handed:?}");
    let asked = calls(&rig.server, "chat.getPermalink");
    assert!(asked[0].path.contains(&format!("message_ts={ROOT_TS}")));
}

#[test]
fn a_reply_handed_over_is_answered_in_its_thread() {
    let mut reaction = parsed("socket_reaction_added");
    reaction["payload"]["event"]["item"]["ts"] = REPLY_TS.into();
    let rig = rig(vec![vec![frame("socket_hello"), reaction.to_string()]]);
    let path = format!("/chat.getPermalink?channel={CHANNEL}&message_ts={REPLY_TS}");
    let permalink = frame("chat_getPermalink_reply");
    rig.server.on("GET", &path, 200, &permalink);
    rig.socket
        .wait_until("the reaction acknowledged", |s| s.acks.len() == 1);

    let polled = rig.source.poll().unwrap();
    assert_eq!(polled[0].source, item(REPLY_ITEM));
    assert_eq!(polled[0].title, "Is this the Safari 18 bug?");
    let read = rig.source.read(&item(REPLY_ITEM)).unwrap().unwrap();
    assert_eq!(read.title, polled[0].title);

    let queued = Update::Queued {
        starts: Some(ClockTime::parse("23:00").unwrap()),
        repo: Some("acme/storefront".into()),
    };
    rig.source.report(&item(REPLY_ITEM), &queued).unwrap();
    let posted = calls(&rig.server, "chat.postMessage")[0].json();
    assert_eq!(posted["channel"], CHANNEL);
    assert_eq!(posted["thread_ts"], ROOT_TS);
    assert_eq!(
        posted["text"],
        "Got it. I'll work on this tonight at 23:00 in acme/storefront and reply here."
    );
}

fn pr() -> PullRequest {
    PullRequest {
        number: 101,
        url: "https://github.com/acme/storefront/pull/101".into(),
    }
}

fn post(rig: &Rig, update: &Update) -> Value {
    rig.server.clear_requests();
    rig.source.report(&item(ITEM), update).unwrap();
    let posted = calls(&rig.server, "chat.postMessage");
    assert_eq!(posted.len(), 1, "{update:?}");
    posted[0].json()
}

#[test]
fn each_update_reads_like_the_thread_in_the_design() {
    let rig = rig(vec![script(&["socket_hello"])]);
    let waiting = Update::Queued {
        starts: None,
        repo: None,
    };
    assert_eq!(
        post(&rig, &waiting)["text"],
        "Got it. I'll work on this when you run `shep go` and reply here."
    );
    let asked = post(
        &rig,
        &Update::Asked {
            question: "Which zone <when> none?".into(),
        },
    );
    let text = asked["text"].as_str().unwrap();
    assert!(text.starts_with("Which zone &lt;when&gt; none?"), "{text}");
    assert!(text.contains("Reply in this thread"), "{text}");
    let merged = post(&rig, &Update::Merged { pr: pr() });
    assert!(
        merged["text"].as_str().unwrap().contains(&pr().url),
        "{merged}"
    );
    let stopped = post(
        &rig,
        &Update::Stopped {
            reason: "the message was deleted".into(),
        },
    );
    assert!(stopped["text"]
        .as_str()
        .unwrap()
        .contains("the message was deleted"));
    for body in [asked, merged, stopped] {
        assert_eq!(body["thread_ts"], ROOT_TS);
    }
}

#[test]
fn ready_posts_the_proof_then_the_buttons() {
    let rig = rig(vec![script(&["socket_hello"])]);
    let dir = tempfile::tempdir().unwrap();
    let shot = dir.path().join("checkout.png");
    std::fs::write(&shot, b"\x89PNG-fake").unwrap();
    let ready = Update::Ready {
        pr: pr(),
        summary: "CI green · +41 -12".into(),
        proof: vec![shot, dir.path().join("gone.png")],
    };
    rig.socket
        .wait_until("a connection", |s| s.connections == 1);
    rig.server.clear_requests();
    rig.source.report(&item(ITEM), &ready).unwrap();

    let writes: Vec<String> = rig.server.writes().iter().map(|r| r.path.clone()).collect();
    assert_eq!(
        writes,
        [
            "/files.getUploadURLExternal",
            "/upload/v1/ABC123",
            "/files.completeUploadExternal",
            "/chat.postMessage"
        ],
        "a missing proof file is skipped"
    );
    let asked = &calls(&rig.server, "files.getUploadURLExternal")[0];
    assert!(asked.body.contains("filename=checkout.png"), "{asked:?}");
    assert!(asked.body.contains("length=9"), "{asked:?}");
    let upload = &calls(&rig.server, "upload/v1")[0];
    assert_eq!(upload.body, "\u{fffd}PNG-fake");
    assert_eq!(
        upload.header("authorization"),
        None,
        "the token stays with Slack's API"
    );
    let complete = calls(&rig.server, "files.completeUploadExternal")[0].json();
    assert_eq!(complete["channel_id"], CHANNEL);
    assert_eq!(complete["thread_ts"], ROOT_TS);
    assert_eq!(complete["files"][0]["id"], "F0PROOF001");

    let posted = calls(&rig.server, "chat.postMessage")[0].json();
    assert!(
        posted["text"].as_str().unwrap().contains(&pr().url),
        "{posted}"
    );
    let blocks = posted["blocks"].to_string();
    assert!(blocks.contains("acme/storefront#101"), "{blocks}");
    assert!(blocks.contains("CI green"), "{blocks}");
    assert!(blocks.contains("shep:"), "{blocks}");
    let buttons = posted["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["type"] == "actions")
        .expect("an actions block")["elements"]
        .clone();
    let ids: Vec<&str> = buttons
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["action_id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["shep_merge", "shep_send_back", "shep_open_pr"]);
    let thread = format!("{CHANNEL}/{ROOT_TS}");
    assert_eq!(buttons[0]["value"], thread.as_str());
    assert_eq!(buttons[0]["style"], "primary");
    assert_eq!(buttons[1]["value"], thread.as_str());
    assert_eq!(buttons[2]["url"], pr().url.as_str());
}

#[test]
fn candidates_are_recent_messages_from_people_not_yet_handed_over() {
    let rig = rig(vec![script(&["socket_hello"])]);
    let link = |channel: &str, ts: &str| {
        let digits = ts.replace('.', "");
        let url = format!("https://acme.slack.com/archives/{channel}/p{digits}");
        let body = serde_json::json!({ "ok": true, "channel": channel, "permalink": url });
        let path = format!("/chat.getPermalink?channel={channel}&message_ts={ts}");
        rig.server.on("GET", &path, 200, &body.to_string());
        url
    };
    let csv = link("C0ENG00001", "1763146000.000900");
    let coupon = link(CHANNEL, "1763145000.000800");
    let login = link("C0ENG00001", "1763100000.001000");

    let offered = rig.source.candidates(3).unwrap();
    let got: Vec<(&str, &str)> = offered
        .iter()
        .map(|h| (h.title.as_str(), h.url.as_str()))
        .collect();
    assert_eq!(
        got,
        [
            ("Export reports to CSV", csv.as_str()),
            ("Coupon field rejects lowercase codes", coupon.as_str()),
            (
                "Login redirect loops after a password reset",
                login.as_str()
            ),
        ]
    );
    assert!(offered[0].body.contains("Finance wants"), "{offered:?}");
    assert_eq!(rig.source.candidates(1).unwrap().len(), 1);
}

#[test]
fn a_hand_over_that_cannot_be_read_yet_waits_for_the_next_poll() {
    let rig = rig(vec![script(&["socket_hello", "socket_reaction_added"])]);
    rig.socket
        .wait_until("the reaction acknowledged", |s| s.acks.len() == 1);
    rig.server.on("GET", "/conversations.replies", 500, "{}");
    assert!(rig.source.poll().is_err(), "nothing could be read");
    let thread = frame("conversations_replies");
    rig.server.on("GET", "/conversations.replies", 200, &thread);
    assert_eq!(rig.source.poll().unwrap()[0].source, item(ITEM));
    assert!(rig.source.poll().unwrap().is_empty(), "drained");

    let gone = r#"{"ok":false,"error":"thread_not_found"}"#;
    rig.server.on("GET", "/conversations.replies", 200, gone);
    assert_eq!(rig.source.read(&item(ITEM)).unwrap(), None);
}

#[test]
fn a_refused_app_token_shows_in_the_connection_and_still_stops() {
    let rig = rig_with(vec![script(&["socket_hello"])], |server| {
        server.on(
            "POST",
            "/apps.connections.open",
            200,
            &frame("error_invalid_auth"),
        );
    });
    wait_for("the socket's failure", || rig.source.connection().is_err());
    let err = rig.source.connection().unwrap_err();
    assert!(err.0.contains("invalid_auth"), "{err}");
    assert!(err.0.contains("app-level token"), "{err}");
    assert!(!err.0.contains(APP) && !err.0.contains(BOT), "{err}");
    assert_eq!(rig.socket.seen().connections, 0);

    let Rig {
        source, registry, ..
    } = rig;
    let started = Instant::now();
    drop(source);
    drop(registry);
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "a backing-off thread stops at once: {:?}",
        started.elapsed()
    );
}

#[test]
fn dropping_the_source_closes_its_socket() {
    let rig = rig(vec![script(&["socket_hello"])]);
    rig.socket
        .wait_until("a connection", |s| s.connections == 1);
    let Rig {
        source,
        registry,
        socket,
        server,
        _dir,
    } = rig;
    drop(source);
    drop(registry);
    socket.wait_until("the close", |s| s.closed == 1);
    let opened = calls(&server, "apps.connections.open").len();
    std::thread::sleep(Duration::from_millis(300));
    assert_eq!(calls(&server, "apps.connections.open").len(), opened);
    assert_eq!(socket.seen().connections, 1);
}
