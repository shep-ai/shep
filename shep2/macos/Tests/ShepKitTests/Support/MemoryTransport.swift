import Foundation

@testable import ShepKit

/// A transport that keeps what the client sends and lets a test play the daemon.
final class MemoryTransport: LineTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var lines: [Data] = []
    private var onLine: (@Sendable (Data) -> Void)?
    private var onClose: (@Sendable (Error?) -> Void)?
    private(set) var closedByClient = false

    func start(onLine: @escaping @Sendable (Data) -> Void, onClose: @escaping @Sendable (Error?) -> Void) {
        lock.withLock {
            self.onLine = onLine
            self.onClose = onClose
        }
    }

    func send(_ line: Data) throws {
        lock.withLock { lines.append(line) }
    }

    func close() {
        let callback = lock.withLock { () -> (@Sendable (Error?) -> Void)? in
            closedByClient = true
            return onClose
        }
        callback?(nil)
    }

    var sent: [Data] { lock.withLock { lines } }

    /// The requests sent so far, as JSON objects.
    var requests: [[String: Any]] {
        sent.compactMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
    }

    func deliver(_ json: String) {
        let callback = lock.withLock { onLine }
        callback?(Data(json.utf8))
    }

    func hangUp() {
        let callback = lock.withLock { onClose }
        callback?(nil)
    }

    /// Waits until the client has sent `count` lines.
    func waitForRequests(_ count: Int, file: StaticString = #filePath, line: UInt = #line) async throws {
        for _ in 0..<500 where sent.count < count {
            try await Task.sleep(nanoseconds: 2_000_000)
        }
        if sent.count < count {
            throw TestTimeout(what: "\(count) requests, got \(sent.count)")
        }
    }
}

struct TestTimeout: Error, CustomStringConvertible {
    let what: String
    var description: String { "timed out waiting for \(what)" }
}
