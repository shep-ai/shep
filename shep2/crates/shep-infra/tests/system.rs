use std::path::Path;

use shep_app::ports::{KeepAwake, TaskFiles};
use shep_app::Clock;
use shep_domain::TaskId;
use shep_infra::{inhibitor_command, FsTaskFiles, SystemClock, SystemKeepAwake};

fn alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .is_ok_and(|s| s.success())
}

#[test]
fn keeping_awake_holds_one_inhibitor_and_releases_it() {
    let awake = SystemKeepAwake::with_command(Some(vec!["sleep".into(), "30".into()]));
    assert_eq!(awake.inhibitor_pid(), None);
    awake.hold();
    let pid = awake.inhibitor_pid().unwrap();
    assert!(alive(pid));
    awake.hold();
    assert_eq!(
        awake.inhibitor_pid(),
        Some(pid),
        "holding twice keeps one inhibitor"
    );
    awake.release();
    assert_eq!(awake.inhibitor_pid(), None);
    assert!(!alive(pid));
    awake.release();
}

#[test]
fn a_machine_without_an_inhibitor_just_carries_on() {
    let awake = SystemKeepAwake::with_command(None);
    awake.hold();
    assert_eq!(awake.inhibitor_pid(), None);
    awake.release();
}

#[test]
fn the_inhibitor_ends_with_the_daemon() {
    assert_eq!(
        inhibitor_command("macos", 42, false),
        Some(
            ["caffeinate", "-i", "-s", "-w", "42"]
                .map(String::from)
                .to_vec()
        )
    );
    let linux = inhibitor_command("linux", 42, true).unwrap();
    assert_eq!(linux[0], "systemd-inhibit");
    assert!(linux.contains(&"--what=idle:sleep".to_owned()));
    assert!(linux.ends_with(&["tail", "--pid=42", "-f", "/dev/null"].map(String::from)));
    assert_eq!(inhibitor_command("linux", 42, false), None);
}

#[test]
fn task_files_live_in_one_folder_per_task() {
    let dir = tempfile::tempdir().unwrap();
    let files = FsTaskFiles::new(dir.path().join("tasks"));
    let task = files.task_dir(TaskId(7)).unwrap();
    assert_eq!(task, dir.path().join("tasks").join("7"));
    assert!(task.is_dir());
    let proof = task.join("proof");
    files.write(&proof.join("tests.txt"), "48 passed").unwrap();
    std::fs::write(proof.join("login.png"), "PNG").unwrap();
    std::fs::create_dir_all(proof.join("nested")).unwrap();
    assert_eq!(
        files.read(&proof.join("tests.txt")).as_deref(),
        Some("48 passed")
    );
    assert_eq!(
        files.list(&proof),
        [proof.join("login.png"), proof.join("tests.txt")]
    );
    files.remove(&proof.join("tests.txt"));
    assert_eq!(files.read(&proof.join("tests.txt")), None);
    assert_eq!(
        files.list(Path::new("/no/such/dir")),
        Vec::<std::path::PathBuf>::new()
    );
}

#[test]
fn the_clock_knows_the_local_offset() {
    let offset = SystemClock.utc_offset();
    assert!(offset.abs() <= 14 * 3600, "{offset}");
}
