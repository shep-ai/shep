use std::io::{Read, Write};
use std::net::TcpStream;

use serde_json::{json, Value};
use shep_mock_model::MockModel;

/// Posts a Messages API request and returns the streamed events' data, in order.
fn post(model: &MockModel, body: &Value) -> Vec<Value> {
    let mut stream = TcpStream::connect(model.addr()).unwrap();
    let body = body.to_string();
    write!(
        stream,
        "POST /v1/messages?beta=true HTTP/1.1\r\nhost: x\r\ncontent-type: application/json\r\n\
         content-length: {}\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut reply = String::new();
    stream.read_to_string(&mut reply).unwrap();
    assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
    assert!(reply.contains("content-type: text/event-stream"), "{reply}");
    reply
        .lines()
        .filter_map(|l| l.strip_prefix("data: "))
        .map(|d| serde_json::from_str(d).unwrap())
        .collect()
}

fn request(prompt: &str) -> Value {
    json!({
        "model": "claude-test",
        "stream": true,
        "tools": [{ "name": "Bash" }],
        "messages": [{ "role": "user", "content": [{ "type": "text", "text": prompt }] }]
    })
}

fn tool_command(events: &[Value]) -> String {
    let start = events
        .iter()
        .find(|e| e["type"] == "content_block_start")
        .unwrap();
    assert_eq!(start["content_block"]["name"], "Bash");
    let delta = events
        .iter()
        .find(|e| e["type"] == "content_block_delta")
        .unwrap();
    let input: Value =
        serde_json::from_str(delta["delta"]["partial_json"].as_str().unwrap()).unwrap();
    input["command"].as_str().unwrap().to_owned()
}

#[test]
fn a_new_task_gets_one_shell_command_that_changes_a_file_and_saves_proof() {
    let model = MockModel::start().unwrap();
    let events = post(&model, &request("# Fix login\n\nUsers loop."));
    assert_eq!(events[0]["type"], "message_start");
    assert_eq!(events.last().unwrap()["type"], "message_stop");
    let stop = events
        .iter()
        .find(|e| e["type"] == "message_delta")
        .unwrap();
    assert_eq!(stop["delta"]["stop_reason"], "tool_use");
    let command = tool_command(&events);
    assert!(command.contains("MOCK_CHANGE.md"), "{command}");
    assert!(command.contains("$SHEP_PROOF_DIR/tests.txt"), "{command}");
    assert_eq!(model.prompts(), ["# Fix login\n\nUsers loop."]);
}

#[test]
fn the_reviewer_ci_fixes_and_questions_get_their_own_commands() {
    let model = MockModel::start().unwrap();
    let review = tool_command(&post(
        &model,
        &request("You are a second-opinion reviewer."),
    ));
    assert!(review.contains("$SHEP_REVIEW_FILE"), "{review}");
    let fix = tool_command(&post(
        &model,
        &request("CI failed on your pull request: lint."),
    ));
    assert!(fix.contains("git commit"), "{fix}");
    let ask = tool_command(&post(&model, &request("# Pick a bucket [mock:ask]")));
    assert!(ask.contains("$SHEP_QUESTION_FILE"), "{ask}");
}

#[test]
fn a_tool_result_ends_the_turn_with_text() {
    let model = MockModel::start().unwrap();
    let mut body = request("anything");
    body["messages"] = json!([
        { "role": "user", "content": "anything" },
        { "role": "assistant", "content": [{ "type": "tool_use", "id": "t1", "name": "Bash", "input": {} }] },
        { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "t1", "content": "ok" }] }
    ]);
    let events = post(&model, &body);
    let stop = events
        .iter()
        .find(|e| e["type"] == "message_delta")
        .unwrap();
    assert_eq!(stop["delta"]["stop_reason"], "end_turn");
    let text = events
        .iter()
        .find(|e| e["type"] == "content_block_delta")
        .unwrap();
    assert_eq!(text["delta"]["type"], "text_delta");
}

#[test]
fn a_request_without_tools_gets_plain_text() {
    let model = MockModel::start().unwrap();
    let mut body = request("Summarize this session in five words.");
    body.as_object_mut().unwrap().remove("tools");
    let events = post(&model, &body);
    let stop = events
        .iter()
        .find(|e| e["type"] == "message_delta")
        .unwrap();
    assert_eq!(stop["delta"]["stop_reason"], "end_turn");
    assert_eq!(
        model.prompts(),
        Vec::<String>::new(),
        "side requests are not tasks"
    );
}

#[test]
fn every_reply_has_ids_of_its_own() {
    let model = MockModel::start().unwrap();
    let ids = |events: &[Value]| {
        (
            events[0]["message"]["id"].as_str().unwrap().to_owned(),
            events[1]["content_block"]["id"]
                .as_str()
                .unwrap()
                .to_owned(),
        )
    };
    let a = ids(&post(&model, &request("one")));
    let b = ids(&post(&model, &request("two")));
    assert_ne!(a.0, b.0);
    assert_ne!(a.1, b.1);
}

#[test]
fn the_prompt_is_the_persons_turn_even_with_system_notes_after_it() {
    let model = MockModel::start().unwrap();
    let mut body = request("# Store uploads [mock:ask]");
    body["messages"]
        .as_array_mut()
        .unwrap()
        .push(json!({ "role": "system", "content": "# Environment\nPlatform: linux" }));
    let command = tool_command(&post(&model, &body));
    assert!(command.contains("$SHEP_QUESTION_FILE"), "{command}");
    assert_eq!(model.prompts(), ["# Store uploads [mock:ask]"]);
}
