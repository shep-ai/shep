import Foundation

/// Where the daemon's socket is, computed exactly like `ShepHome` in
/// `shep2/crates/shep-infra/src/home.rs`: `$SHEP_HOME` (default `~/.shep`), then
/// `shep2/run/daemon.sock`, or `/tmp/shep2-<FNV-1a of the home>/daemon.sock` when that path
/// would be longer than a socket path may be.
public struct ShepHome: Equatable, Sendable {
    static let homeVariable = "SHEP_HOME"
    static let userHomeVariable = "HOME"
    static let defaultDirectory = ".shep"
    static let ownDirectory = "shep2"
    static let runDirectory = "run"
    static let socketName = "daemon.sock"
    /// The longest socket path that binds everywhere (macOS allows 103 bytes, Linux 107).
    static let maxSocketPath = 100
    static let shortRunRoot = "/tmp"
    static let shortRunPrefix = "shep2-"
    static let fnvOffset: UInt64 = 0xcbf2_9ce4_8422_2325
    static let fnvPrime: UInt64 = 0x0100_0000_01b3

    public let root: String

    public init(root: String) {
        self.root = root
    }

    /// `$SHEP_HOME`, or `$HOME/.shep`.
    public init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        if let home = environment[Self.homeVariable] {
            self.init(root: home)
        } else {
            self.init(root: Self.join(environment[Self.userHomeVariable] ?? "", Self.defaultDirectory))
        }
    }

    public var runDirectory: String {
        let near = Self.join(Self.join(root, Self.ownDirectory), Self.runDirectory)
        if Self.join(near, Self.socketName).utf8.count <= Self.maxSocketPath {
            return near
        }
        let hash = String(Self.fnv1a(Array(root.utf8)), radix: 16)
        let padded = String(repeating: "0", count: max(0, 16 - hash.count)) + hash
        return Self.join(Self.shortRunRoot, Self.shortRunPrefix + padded)
    }

    public var daemonSocket: String {
        Self.join(runDirectory, Self.socketName)
    }

    /// FNV-1a, 64-bit: the same hash every build, so every client finds the daemon's directory.
    static func fnv1a(_ bytes: [UInt8]) -> UInt64 {
        bytes.reduce(fnvOffset) { ($0 ^ UInt64($1)) &* fnvPrime }
    }

    /// Joins like Rust's `Path::join` for a relative component.
    static func join(_ base: String, _ component: String) -> String {
        if base.isEmpty { return component }
        return base.hasSuffix("/") ? base + component : base + "/" + component
    }
}
