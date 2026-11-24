//! The real binary, daemon, holder and git against a bare `origin`: an agent that tries to
//! push the default branch is refused while its task branch still goes out, and the
//! repository's own screenshot command (`.shep/dev.json`) turns into proof on the PR.

mod support;

use support::{git, Home, FAKE_GH};

const BRANCH: &str = "shep/1-fix-login-redirect-loop";
const PROOF_BRANCH: &str = "shep/proof/1";

/// A coder that commits its own change and then tries to push it straight to `main`, writing
/// what happened to `$FAKE_LOG/push-main`. The reviewer answers as usual.
const PUSHY_CLAUDE: &str = r#"#!/bin/sh
printf '%s' "$*" | tr '\n' ' ' >> "$FAKE_LOG/claude.calls"; echo >> "$FAKE_LOG/claude.calls"
case "$2" in
  *"second-opinion reviewer"*)
    echo "Looks correct to me." > "$SHEP_REVIEW_FILE"
    exit 0;;
esac
echo "fixed" >> fix.txt
git add fix.txt && git commit -q -m "Fix the redirect"
if git push -q origin HEAD:main 2> "$FAKE_LOG/push-main.err"; then
  echo pushed > "$FAKE_LOG/push-main"
else
  echo refused > "$FAKE_LOG/push-main"
fi
echo "All done."
"#;

/// The repository's screenshot script: saves a PNG where Shep says.
const SHOT: &str = "#!/bin/sh\nprintf 'PNG' > \"$SHEP_PROOF_DIR/home.png\"\n";

#[test]
fn an_agent_cannot_push_main_and_the_repositorys_screenshots_become_proof() {
    let home = Home::new();
    let (origin, checkout) = home.repos();
    std::fs::create_dir_all(checkout.join(".shep")).unwrap();
    std::fs::write(
        checkout.join(".shep/dev.json"),
        r#"{"command":"npm run dev","screenshot":"sh shot.sh"}"#,
    )
    .unwrap();
    std::fs::write(checkout.join("shot.sh"), SHOT).unwrap();
    git(&checkout, &["add", "."]);
    git(
        &checkout,
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@e",
            "commit",
            "-q",
            "-m",
            "dev",
        ],
    );
    git(&checkout, &["push", "-q", "origin", "main"]);
    let main = git(&origin, &["rev-parse", "main"]);
    home.install("claude", PUSHY_CLAUDE);
    home.install("gh", FAKE_GH);

    home.shep_in(&checkout)
        .args(["add", "#7"])
        .assert()
        .success();
    home.shep().arg("go").assert().success();
    home.wait_for_board("Ready (1)");

    let push = std::fs::read_to_string(home.log().join("push-main")).unwrap();
    let why = std::fs::read_to_string(home.log().join("push-main.err")).unwrap();
    assert_eq!(push.trim(), "refused", "{why}");
    assert!(why.contains(&format!("refs/heads/{BRANCH}")), "{why}");
    assert_eq!(
        git(&origin, &["rev-parse", "main"]),
        main,
        "main never moved"
    );
    assert_eq!(
        git(&origin, &["show", &format!("{BRANCH}:fix.txt")]),
        "fixed"
    );

    assert_eq!(
        git(&origin, &["show", &format!("{PROOF_BRANCH}:home.png")]),
        "PNG"
    );
    let gh = home.calls("gh");
    let body = gh
        .iter()
        .rev()
        .find(|c| c.starts_with("pr edit 12"))
        .unwrap();
    assert!(body.contains("home.png?raw=true"), "{body}");
    let claude = home.calls("claude");
    assert!(
        claude[0].contains("screenshot command runs after you finish"),
        "{}",
        claude[0]
    );
}
