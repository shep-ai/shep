//! The published protocol only grows: clients built against an older schema keep working.
//!
//! `schema/openrpc.json` is the published schema. When a change adds methods or fields, refresh
//! it with `SHEP_UPDATE_SCHEMA=1 cargo test -p shep-rpc --test schema`.

use std::path::PathBuf;

use serde_json::{json, Value};
use shep_rpc::openrpc;

const UPDATE_ENV: &str = "SHEP_UPDATE_SCHEMA";

fn published_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../schema/openrpc.json")
}

fn current() -> Value {
    openrpc::document()
}

#[test]
fn the_schema_only_grows() {
    let path = published_path();
    let current = current();
    if std::env::var_os(UPDATE_ENV).is_some() {
        if let Ok(text) = std::fs::read_to_string(&path) {
            let old: Value = serde_json::from_str(&text).unwrap();
            openrpc::check_growth(&old, &current).unwrap();
        }
        let mut text = serde_json::to_string_pretty(&current).unwrap();
        text.push('\n');
        std::fs::write(&path, text).unwrap();
    }
    let published: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    if let Err(removed) = openrpc::check_growth(&published, &current) {
        panic!("the protocol lost: {removed:#?}");
    }
    assert!(
        published == current,
        "schema/openrpc.json is out of date; run {UPDATE_ENV}=1 cargo test -p shep-rpc --test schema"
    );
}

#[test]
fn the_schema_lists_the_four_actions_settings_and_the_subscription() {
    let names: Vec<String> = current()["methods"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        names,
        [
            "add",
            "start",
            "board",
            "review",
            "settings.get",
            "settings.update",
            "board.subscribe"
        ]
    );
    assert_eq!(current()["x-notifications"][0]["name"], "board.changed");
}

#[test]
fn removing_a_method_a_field_or_a_variant_is_caught() {
    let old = json!({
        "methods": [{ "name": "add" }, { "name": "board" }],
        "components": { "schemas": {
            "Task": { "properties": { "id": {}, "title": {} } },
            "TaskState": { "enum": ["Queued", "Working"] }
        }}
    });
    let grown = json!({
        "methods": [{ "name": "board" }, { "name": "add" }, { "name": "start" }],
        "components": { "schemas": {
            "Task": { "properties": { "id": {}, "title": {}, "pr": {} } },
            "TaskState": { "enum": ["Queued", "Working", "Ready"] }
        }}
    });
    assert_eq!(openrpc::check_growth(&old, &grown), Ok(()));

    let mut no_method = grown.clone();
    no_method["methods"]
        .as_array_mut()
        .unwrap()
        .retain(|m| m["name"] != "add");
    let mut no_field = grown.clone();
    no_field["components"]["schemas"]["Task"]["properties"]
        .as_object_mut()
        .unwrap()
        .remove("title");
    let mut no_variant = grown;
    no_variant["components"]["schemas"]["TaskState"]["enum"] = json!(["Queued", "Ready"]);
    for broken in [no_method, no_field, no_variant] {
        let removed = openrpc::check_growth(&old, &broken).unwrap_err();
        assert_eq!(removed.len(), 1, "{removed:?}");
    }
}

#[test]
fn descriptions_may_change() {
    let old = json!({ "methods": [{ "name": "add", "summary": "old words" }] });
    let new = json!({ "methods": [{ "name": "add", "summary": "new words" }] });
    assert_eq!(openrpc::check_growth(&old, &new), Ok(()));
}
