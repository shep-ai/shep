import Foundation

#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// A one-connection-at-a-time Unix socket server that plays the daemon: it answers each request
/// line with whatever `reply` returns (one or more raw chunks, written separately).
final class FakeDaemonSocket: @unchecked Sendable {
    let path: String
    private let directory: String
    private let listener: Int32
    private let reply: @Sendable (_ request: [String: Any]) -> [String]

    init(reply: @escaping @Sendable (_ request: [String: Any]) -> [String]) throws {
        // Short on purpose: a socket path holds about 100 bytes.
        directory = "/tmp/shepkit-\(UInt32.random(in: 0...UInt32.max))"
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        path = directory + "/d.sock"
        self.reply = reply
        #if canImport(Glibc)
        listener = socket(AF_UNIX, Int32(SOCK_STREAM.rawValue), 0)
        #else
        listener = socket(AF_UNIX, SOCK_STREAM, 0)
        #endif
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8)
        withUnsafeMutableBytes(of: &address.sun_path) { raw in
            raw.copyBytes(from: bytes)
            raw[bytes.count] = 0
        }
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bound == 0, listen(listener, 4) == 0 else { throw TestTimeout(what: "bind \(path)") }
        let thread = Thread { [self] in acceptLoop() }
        thread.start()
    }

    func stop() {
        shutdown(listener, Int32(SHUT_RDWR))
        _ = close(listener)
        try? FileManager.default.removeItem(atPath: directory)
    }

    private func acceptLoop() {
        while true {
            let client = accept(listener, nil, nil)
            if client < 0 { return }
            let thread = Thread { [self] in serve(client) }
            thread.start()
        }
    }

    private func serve(_ client: Int32) {
        var buffer = [UInt8](repeating: 0, count: 4096)
        var pending = Data()
        defer { _ = close(client) }
        while true {
            let count = buffer.withUnsafeMutableBytes { read(client, $0.baseAddress, $0.count) }
            if count <= 0 { return }
            pending.append(contentsOf: buffer[0..<count])
            while let newline = pending.firstIndex(of: UInt8(ascii: "\n")) {
                let line = pending[pending.startIndex..<newline]
                pending = Data(pending[pending.index(after: newline)...])
                guard let request = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { continue }
                for chunk in reply(request) {
                    let bytes = Array(chunk.utf8)
                    _ = bytes.withUnsafeBytes { write(client, $0.baseAddress, $0.count) }
                    usleep(2_000)
                }
            }
        }
    }
}
