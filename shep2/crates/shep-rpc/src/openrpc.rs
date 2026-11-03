//! The OpenRPC document for the daemon's protocol, generated from the Rust types, and the check
//! that a new version only grows.

use schemars::generate::{SchemaGenerator, SchemaSettings};
use schemars::{JsonSchema, Schema};
use serde_json::{json, Map, Value};
use shep_app::{Board, SettingsChange, StartOutcome};
use shep_domain::{Settings, Task};

use crate::method::{AddParams, Method, NoParams, ReviewParams, StartParams, UpdateSettingsParams};
use crate::BOARD_CHANGED;

const OPENRPC_VERSION: &str = "1.3.2";
/// Bumped only when the protocol changes in a way the growth check allows.
const PROTOCOL_VERSION: &str = "1.0.0";
const DEFINITIONS_PATH: &str = "/components/schemas";
/// Wording that may change freely: it is for people, not for clients.
const PROSE_KEYS: [&str; 3] = ["description", "summary", "title"];
/// Keys whose children are names chosen by the protocol (fields, schemas), never prose.
const NAME_MAPS: [&str; 3] = ["properties", "schemas", "$defs"];

type SchemaFn = fn(&mut SchemaGenerator) -> Schema;

fn shape(method: Method) -> (SchemaFn, SchemaFn) {
    fn of<T: JsonSchema>(g: &mut SchemaGenerator) -> Schema {
        T::json_schema(g)
    }
    fn reference<T: JsonSchema>(g: &mut SchemaGenerator) -> Schema {
        g.subschema_for::<T>()
    }
    match method {
        Method::Add => (of::<AddParams>, reference::<Task>),
        Method::Start => (of::<StartParams>, reference::<StartOutcome>),
        Method::Board | Method::Subscribe => (of::<NoParams>, reference::<Board>),
        Method::Review => (of::<ReviewParams>, reference::<Task>),
        Method::SettingsGet => (of::<NoParams>, reference::<Settings>),
        Method::SettingsUpdate => (of::<UpdateSettingsParams>, reference::<Settings>),
    }
}

/// The whole OpenRPC document. Swift client types are generated from it.
pub fn document() -> Value {
    let mut generator = SchemaSettings::draft2020_12()
        .with(|s| s.definitions_path = DEFINITIONS_PATH.into())
        .into_generator();
    let methods: Vec<Value> = Method::ALL
        .into_iter()
        .map(|method| {
            let (params, result) = shape(method);
            json!({
                "name": method.name(),
                "summary": method.summary(),
                "paramStructure": "by-name",
                "params": descriptors(&params(&mut generator)),
                "result": { "name": "result", "schema": result(&mut generator) },
            })
        })
        .collect();
    let board = generator.subschema_for::<Board>();
    // Make sure every type a client sends is described even when no result mentions it.
    generator.subschema_for::<SettingsChange>();
    json!({
        "openrpc": OPENRPC_VERSION,
        "info": { "title": "Shep daemon", "version": PROTOCOL_VERSION },
        "methods": methods,
        "x-notifications": [{
            "name": BOARD_CHANGED,
            "summary": "The whole board, pushed to subscribers after every change.",
            "params": [{ "name": "board", "required": true, "schema": board }],
        }],
        "components": { "schemas": generator.take_definitions(true) },
    })
}

/// Splits a params object schema into OpenRPC content descriptors, one per field.
fn descriptors(schema: &Schema) -> Vec<Value> {
    let value = schema.as_value();
    let required: Vec<&str> = value["required"]
        .as_array()
        .map(|r| r.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    value["properties"]
        .as_object()
        .map(|props| {
            props
                .iter()
                .map(|(name, schema)| {
                    json!({
                        "name": name,
                        "required": required.contains(&name.as_str()),
                        "schema": schema,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Checks that `new` keeps everything `old` had: every method, every field, every enum
/// variant. Wording (`description`, `summary`, `title`) may change. Returns the JSON paths of
/// whatever went missing.
pub fn check_growth(old: &Value, new: &Value) -> Result<(), Vec<String>> {
    let mut missing = Vec::new();
    covers(old, new, "$", &mut missing);
    if missing.is_empty() {
        Ok(())
    } else {
        Err(missing)
    }
}

fn covers(old: &Value, new: &Value, path: &str, missing: &mut Vec<String>) {
    match (old, new) {
        (Value::Object(o), Value::Object(n)) => covers_object(o, n, path, false, missing),
        (Value::Array(o), Value::Array(n)) => {
            for (i, item) in o.iter().enumerate() {
                let found = n.iter().any(|candidate| {
                    let mut probe = Vec::new();
                    covers(item, candidate, path, &mut probe);
                    probe.is_empty()
                });
                if !found {
                    missing.push(format!("{path}[{}]", label(item).unwrap_or(i.to_string())));
                }
            }
        }
        _ if old == new => {}
        _ => missing.push(path.to_owned()),
    }
}

fn covers_object(
    old: &Map<String, Value>,
    new: &Map<String, Value>,
    path: &str,
    names: bool,
    missing: &mut Vec<String>,
) {
    for (key, value) in old {
        if !names && PROSE_KEYS.contains(&key.as_str()) {
            continue;
        }
        let here = format!("{path}.{key}");
        match (new.get(key), value) {
            (Some(Value::Object(next)), Value::Object(value)) => {
                let holds_names = !names && NAME_MAPS.contains(&key.as_str());
                covers_object(value, next, &here, holds_names, missing);
            }
            (Some(next), _) => covers(value, next, &here, missing),
            (None, _) => missing.push(here),
        }
    }
}

/// A readable name for an array item: a method's name, or the value itself.
fn label(item: &Value) -> Option<String> {
    item.get("name")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| item.as_str().map(str::to_owned))
}
