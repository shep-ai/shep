//! Connecting a source from the command line: secrets typed or piped, never as arguments, kept
//! out of the database, and the connection proven against the source (a local Linear here).

mod support;

#[path = "../../shep-infra/tests/support/fixture_http.rs"]
#[allow(dead_code)]
mod fixture_http;

use fixture_http::FixtureServer;
use predicates::str::contains;
use support::Home;

const TOKEN: &str = "lin_api_s3cret";
const LINEAR_FIXTURES: &str = "../shep-infra/tests/fixtures/linear";

fn linear_fixture(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(LINEAR_FIXTURES)
        .join(name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// A Linear that knows the workspace Acme and the team ENG.
fn linear() -> FixtureServer {
    let server = FixtureServer::start();
    server.on_body(
        "POST",
        "/graphql",
        "ShepViewer",
        200,
        &linear_fixture("viewer.json"),
    );
    server.on_body(
        "POST",
        "/graphql",
        "ShepTeam",
        200,
        &linear_fixture("teams.json"),
    );
    server
}

#[test]
fn secrets_are_typed_or_piped_never_given_as_arguments() {
    let home = Home::new();
    home.shep()
        .args(["config", "--connect", "trello"])
        .assert()
        .failure()
        .stderr(contains("unknown source"))
        .stderr(contains("linear"));
    home.shep()
        .args(["config", "--connect", "linear", &format!("token={TOKEN}")])
        .assert()
        .failure()
        .stderr(contains("token"))
        .stderr(contains("never on the command line"));
    home.shep()
        .args(["config", "--connect", "linear", "colour=blue"])
        .assert()
        .failure()
        .stderr(contains("asks for token, team"));
}

#[test]
fn a_piped_token_connects_linear_and_stays_out_of_the_database() {
    let home = Home::new();
    let server = linear();
    home.set_env("SHEP_SOURCE_API_LINEAR", server.url());
    home.shep()
        .args(["config", "--connect", "linear", "team=ENG"])
        .write_stdin(format!("{TOKEN}\n"))
        .assert()
        .success()
        .stdout(contains("✓ Linear connected · Acme · team ENG"));
    assert!(
        server
            .requests()
            .iter()
            .all(|r| r.header("authorization") == Some(TOKEN)),
        "{:?}",
        server.requests()
    );

    home.shep()
        .arg("config")
        .assert()
        .success()
        .stdout(contains("linear (Acme · team ENG)"));
    // The database and its write-ahead log, wherever SQLite keeps recent writes.
    for entry in std::fs::read_dir(home.shep_home()).unwrap() {
        let path = entry.unwrap().path();
        if !path.to_string_lossy().contains("shep2.db") {
            continue;
        }
        let bytes = std::fs::read(&path).unwrap();
        assert!(
            !bytes.windows(TOKEN.len()).any(|w| w == TOKEN.as_bytes()),
            "the token reached {}",
            path.display()
        );
    }

    home.shep()
        .args(["config", "--disconnect", "linear"])
        .assert()
        .success()
        .stdout(contains("none · shep config --connect linear"));
    let secrets = home.shep_home().join("shep2").join("secrets.json");
    assert!(!std::fs::read_to_string(secrets).unwrap().contains(TOKEN));
}
