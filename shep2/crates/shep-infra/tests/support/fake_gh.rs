//! A fake `gh` script that logs its arguments and answers from files.

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use shep_domain::PullRequest;
use shep_infra::GhForge;

pub struct FakeGh {
    dir: tempfile::TempDir,
}

impl FakeGh {
    /// `gh` prints `out/<first two args joined by _>` (if present) and exits with
    /// `code/<same>` (default 0); every call is appended to `calls`.
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let script = format!(
            "#!/bin/sh\nd='{}'\necho \"$*\" >> \"$d/calls\"\nkey=\"$1_$2\"\n\
             [ -f \"$d/out/$key\" ] && cat \"$d/out/$key\"\n\
             [ -f \"$d/err/$key\" ] && cat \"$d/err/$key\" >&2\n\
             [ -f \"$d/code/$key\" ] && exit \"$(cat \"$d/code/$key\")\"\nexit 0\n",
            dir.path().display()
        );
        for sub in ["out", "err", "code"] {
            std::fs::create_dir_all(dir.path().join(sub)).unwrap();
        }
        let gh = dir.path().join("gh");
        std::fs::write(&gh, script).unwrap();
        std::fs::set_permissions(&gh, std::fs::Permissions::from_mode(0o755)).unwrap();
        Self { dir }
    }
    pub fn gh(&self) -> GhForge {
        GhForge::new(self.dir.path().join("gh").display().to_string())
    }
    pub fn answer(&self, key: &str, out: &str, code: i32) {
        std::fs::write(self.dir.path().join("out").join(key), out).unwrap();
        std::fs::write(self.dir.path().join("code").join(key), code.to_string()).unwrap();
    }
    pub fn complain(&self, key: &str, err: &str, code: i32) {
        std::fs::write(self.dir.path().join("err").join(key), err).unwrap();
        std::fs::write(self.dir.path().join("code").join(key), code.to_string()).unwrap();
    }
    pub fn calls(&self) -> Vec<String> {
        std::fs::read_to_string(self.dir.path().join("calls"))
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    }
    pub fn here(&self) -> PathBuf {
        self.dir.path().to_path_buf()
    }
}

pub fn pr() -> PullRequest {
    PullRequest {
        number: 7,
        url: "https://github.com/acme/app/pull/7".into(),
    }
}
