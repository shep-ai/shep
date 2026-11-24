//! Where source tokens are kept: never in settings, never on a command line.

use std::os::unix::fs::PermissionsExt;

use shep_infra::secrets::{FileSecrets, SecretStore, SecretTool};

#[test]
fn a_file_store_keeps_secrets_private_and_forgets_them() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("shep2").join("secrets.json");
    let store = FileSecrets::new(path.clone());
    assert_eq!(store.get("linear/token").unwrap(), None);
    store.set("linear/token", "lin_api_123").unwrap();
    store.set("slack/app", "xapp-1").unwrap();
    assert_eq!(
        store.get("linear/token").unwrap().as_deref(),
        Some("lin_api_123")
    );
    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);

    let again = FileSecrets::new(path);
    assert_eq!(again.get("slack/app").unwrap().as_deref(), Some("xapp-1"));
    again.delete("linear/token").unwrap();
    again.delete("linear/token").unwrap();
    assert_eq!(again.get("linear/token").unwrap(), None);
}

/// A `secret-tool` that keeps secrets in a folder and logs its arguments.
fn fake_secret_tool(dir: &std::path::Path) -> std::path::PathBuf {
    let script = dir.join("secret-tool");
    let store = dir.join("store");
    std::fs::create_dir_all(&store).unwrap();
    std::fs::write(
        &script,
        format!(
            r#"#!/bin/sh
echo "$@" >> "{log}"
cmd="$1"; shift
# arguments end with: service shep2 account <key>
key=$(echo "$@" | sed 's/.*account //')
file="{store}/$(echo "$key" | tr '/' '_')"
case "$cmd" in
  store) cat > "$file" ;;
  lookup) [ -f "$file" ] && cat "$file" || exit 1 ;;
  clear) rm -f "$file" ;;
esac
"#,
            log = dir.join("argv.log").display(),
            store = store.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
    script
}

#[test]
fn secret_tool_gets_the_secret_on_stdin_never_in_its_arguments() {
    let dir = tempfile::tempdir().unwrap();
    let store = SecretTool::new(fake_secret_tool(dir.path()));
    store.set("linear/token", "lin_api_123").unwrap();
    assert_eq!(
        store.get("linear/token").unwrap().as_deref(),
        Some("lin_api_123")
    );
    store.delete("linear/token").unwrap();
    assert_eq!(store.get("linear/token").unwrap(), None);
    let argv = std::fs::read_to_string(dir.path().join("argv.log")).unwrap();
    assert!(!argv.contains("lin_api_123"), "{argv}");
    assert!(
        argv.contains("service shep2 account linear/token"),
        "{argv}"
    );
}
