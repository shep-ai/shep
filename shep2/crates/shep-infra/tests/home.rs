use std::path::Path;

use shep_infra::{ShepHome, MAX_SOCKET_PATH};

#[test]
fn sockets_live_under_the_home_when_the_path_is_short() {
    let home = ShepHome::new("/Users/sam/.shep");
    assert_eq!(
        home.daemon_socket(),
        Path::new("/Users/sam/.shep/shep2/run/daemon.sock")
    );
    assert_eq!(
        home.holder_socket(),
        Path::new("/Users/sam/.shep/shep2/run/holder.sock")
    );
}

#[test]
fn a_home_too_deep_for_a_socket_gets_a_short_private_run_dir() {
    let deep = format!("/Users/sam/{}/.shep", "very-long-folder-name/".repeat(5));
    let home = ShepHome::new(&deep);
    for socket in [home.daemon_socket(), home.holder_socket()] {
        assert!(
            socket.as_os_str().len() <= MAX_SOCKET_PATH,
            "{}",
            socket.display()
        );
        assert!(socket.starts_with("/tmp"), "{}", socket.display());
    }
    assert_eq!(
        ShepHome::new(&deep).run_dir(),
        home.run_dir(),
        "the same home always finds the same sockets"
    );
    assert_ne!(
        ShepHome::new(format!("{deep}2")).run_dir(),
        home.run_dir(),
        "two homes never share sockets"
    );
    assert!(home.database().starts_with(&deep), "only the sockets move");
}
