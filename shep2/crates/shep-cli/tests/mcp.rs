//! `shep mcp` as an agent runs it: the MCP handshake over stdio, the three tools, and a task
//! added through MCP showing up on the board.

mod support;

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Stdio};

use serde_json::{json, Value};
use support::Home;

const PROTOCOL: &str = "2025-06-18";

struct Agent {
    child: Child,
    to: ChildStdin,
    from: BufReader<ChildStdout>,
    next_id: i64,
}

impl Agent {
    fn start(home: &Home, dir: &std::path::Path) -> Self {
        let mut child = home
            .process_in(dir)
            .arg("mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let to = child.stdin.take().unwrap();
        let from = BufReader::new(child.stdout.take().unwrap());
        let mut agent = Self {
            child,
            to,
            from,
            next_id: 0,
        };
        let hello = agent.request(
            "initialize",
            &json!({
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": { "name": "test-agent", "version": "0" }
            }),
        );
        assert_eq!(hello["serverInfo"]["name"], "shep", "{hello}");
        assert!(hello["capabilities"]["tools"].is_object(), "{hello}");
        agent.send(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        agent
    }

    fn send(&mut self, message: &Value) {
        writeln!(self.to, "{message}").unwrap();
        self.to.flush().unwrap();
    }

    fn request(&mut self, method: &str, params: &Value) -> Value {
        self.next_id += 1;
        let id = self.next_id;
        self.send(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        loop {
            let mut line = String::new();
            assert_ne!(
                self.from.read_line(&mut line).unwrap(),
                0,
                "shep mcp hung up"
            );
            let reply: Value = serde_json::from_str(&line).unwrap();
            if reply["id"] == id {
                assert!(reply["error"].is_null(), "{reply}");
                return reply["result"].clone();
            }
        }
    }

    fn call(&mut self, tool: &str, args: &Value) -> Value {
        let result = self.request("tools/call", &json!({ "name": tool, "arguments": args }));
        assert_ne!(result["isError"], true, "{result}");
        result["structuredContent"].clone()
    }
}

impl Drop for Agent {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn an_agent_hands_shep_a_task_over_mcp() {
    let home = Home::new();
    let checkout = home.ready();
    let mut agent = Agent::start(&home, &checkout);

    let tools = agent.request("tools/list", &json!({}));
    let mut names: Vec<&str> = tools["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    names.sort_unstable();
    assert_eq!(names, ["add_task", "board", "review"]);

    let added = agent.call(
        "add_task",
        &json!({ "text": "Make the auth tests deterministic", "when": "tonight" }),
    );
    assert_eq!(added["state"], "Queued", "{added}");
    assert_eq!(added["starts"], "23:00", "{added}");

    let board = agent.call("board", &json!({}));
    assert_eq!(board["queued"], 1, "{board}");
    assert!(home.board().contains("Make the auth tests deterministic"));
}

#[test]
fn mcp_is_not_one_of_the_four_commands() {
    let out = Home::new().shep().arg("--help").output().unwrap();
    let help = String::from_utf8(out.stdout).unwrap();
    assert!(!help.contains("mcp"), "{help}");
}
