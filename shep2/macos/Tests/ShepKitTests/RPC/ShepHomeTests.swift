import XCTest

@testable import ShepKit

/// Must find the same socket the Rust daemon binds (`shep-infra/src/home.rs`).
final class ShepHomeTests: XCTestCase {
    func testDefaultsToDotShepInTheHomeFolder() {
        let home = ShepHome(environment: ["HOME": "/Users/sam"])
        XCTAssertEqual(home.root, "/Users/sam/.shep")
        XCTAssertEqual(home.daemonSocket, "/Users/sam/.shep/shep2/run/daemon.sock")
    }

    func testShepHomeOverridesTheDefault() {
        let home = ShepHome(environment: ["HOME": "/Users/sam", "SHEP_HOME": "/srv/shep/"])
        XCTAssertEqual(home.daemonSocket, "/srv/shep/shep2/run/daemon.sock")
    }

    /// The vector comes from the real daemon: `shep __daemon` with this `SHEP_HOME` printed
    /// "serving /tmp/shep2-519586ab4e111ac9/daemon.sock".
    func testAHomeTooDeepForASocketUsesTheSameShortDirectoryAsTheDaemon() {
        let deep = "/tmp/tmp.NJLx1FJxj8/Users/sam" + String(repeating: "/very-long-folder-name", count: 5) + "/.shep"
        let home = ShepHome(environment: ["SHEP_HOME": deep])
        XCTAssertEqual(home.daemonSocket, "/tmp/shep2-519586ab4e111ac9/daemon.sock")
    }

    func testTheLimitIsOneHundredBytesForTheWholeSocketPath() {
        // "/shep2/run/daemon.sock" is 22 bytes, so a 78-byte home is the deepest that stays.
        let fits = "/" + String(repeating: "a", count: 77)
        XCTAssertEqual(ShepHome(environment: ["SHEP_HOME": fits]).daemonSocket, fits + "/shep2/run/daemon.sock")
        let tooDeep = fits + "b"
        XCTAssertTrue(ShepHome(environment: ["SHEP_HOME": tooDeep]).daemonSocket.hasPrefix("/tmp/shep2-"))
    }

    func testFNV1aMatchesTheReferenceVectors() {
        XCTAssertEqual(ShepHome.fnv1a(Array("".utf8)), 0xcbf2_9ce4_8422_2325)
        XCTAssertEqual(ShepHome.fnv1a(Array("a".utf8)), 0xaf63_dc4c_8601_ec8c)
    }
}
