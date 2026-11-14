import Foundation

/// Moves whole lines to and from the daemon. `UnixSocketTransport` is the real one.
public protocol LineTransport: AnyObject, Sendable {
    /// Starts delivering lines (without their newline). `onClose` runs once, when the other end
    /// hangs up or reading fails.
    func start(onLine: @escaping @Sendable (Data) -> Void, onClose: @escaping @Sendable (Error?) -> Void)
    /// Sends one line, newline included.
    func send(_ line: Data) throws
    func close()
}

/// One JSON-RPC connection: calls with ids, answered in any order, and a stream of the
/// notifications that arrive in between.
public final class RPCConnection: @unchecked Sendable {
    public let notifications: AsyncStream<RPCNotification>
    private let transport: any LineTransport
    private let notify: AsyncStream<RPCNotification>.Continuation
    private let lock = NSLock()
    private var nextId: UInt64 = 1
    private var waiting: [UInt64: CheckedContinuation<Data, Error>] = [:]
    private var closed = false

    public init(transport: any LineTransport) {
        (notifications, notify) = AsyncStream.makeStream(of: RPCNotification.self)
        self.transport = transport
        transport.start(
            onLine: { [weak self] line in self?.receive(line) },
            onClose: { [weak self] _ in self?.hungUp() }
        )
    }

    deinit {
        transport.close()
    }

    public var isClosed: Bool { lock.locked { closed } }

    public func call<P: Encodable & Sendable, R: Decodable & Sendable>(
        _ method: String, params: P, as type: R.Type
    ) async throws -> R {
        let line = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            let id: UInt64? = lock.locked {
                if closed { return nil }
                let id = nextId
                nextId += 1
                waiting[id] = continuation
                return id
            }
            guard let id else { return continuation.resume(throwing: ShepClientError.closed) }
            do {
                var request = try JSONEncoder().encode(JSONRPC.Request(id: id, method: method, params: params))
                request.append(JSONRPC.newline)
                try transport.send(request)
            } catch {
                lock.locked { waiting.removeValue(forKey: id) }?.resume(throwing: error)
            }
        }
        return try Self.result(of: line, as: type)
    }

    /// Closes the connection; waiting calls fail with `ShepClientError.closed`.
    public func close() {
        transport.close()
        hungUp()
    }

    private func receive(_ line: Data) {
        guard let header = try? JSONDecoder().decode(JSONRPC.Header.self, from: line) else { return }
        if let method = header.method, header.id == nil {
            notify.yield(RPCNotification(method: method, line: line))
            return
        }
        guard let id = header.id else { return }
        lock.locked { waiting.removeValue(forKey: id) }?.resume(returning: line)
    }

    private func hungUp() {
        let pending: [CheckedContinuation<Data, Error>] = lock.locked {
            closed = true
            defer { waiting.removeAll() }
            return Array(waiting.values)
        }
        pending.forEach { $0.resume(throwing: ShepClientError.closed) }
        notify.finish()
    }

    private static func result<R: Decodable>(of line: Data, as type: R.Type) throws -> R {
        let decoder = JSONDecoder()
        if let error = try decoder.decode(JSONRPC.Header.self, from: line).error {
            throw ShepClientError.rpc(code: error.code, message: error.message)
        }
        do {
            return try decoder.decode(JSONRPC.Result<R>.self, from: line).result
        } catch {
            throw ShepClientError.decode("\(R.self): \(error)")
        }
    }
}
