import Foundation

/// The daemon, over its Unix socket. Calls share one connection, opened on first use and again
/// after the daemon restarts; each subscription gets a connection of its own, so pushed output
/// never mixes with answers (as in `shep-rpc/src/client.rs`).
public final class DaemonClient: ShepClient, RPCCalling, @unchecked Sendable {
    public typealias Connector = @Sendable (String) throws -> any LineTransport

    public let socketPath: String
    private let connector: Connector
    private let lock = NSLock()
    private var shared: RPCConnection?

    public init(
        socketPath: String,
        connector: @escaping Connector = { try UnixSocketTransport.connect(path: $0) }
    ) {
        self.socketPath = socketPath
        self.connector = connector
    }

    /// The daemon for `$SHEP_HOME` (or `~/.shep`).
    public convenience init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        self.init(socketPath: ShepHome(environment: environment).daemonSocket)
    }

    public func call<P: Encodable & Sendable, R: Decodable & Sendable>(
        _ method: ShepMethod, _ params: P, as type: R.Type
    ) async throws -> R {
        try await connection().call(method.rawValue, params: params, as: type)
    }

    public func boardFeed() async throws -> BoardFeed {
        let connection = RPCConnection(transport: try connector(socketPath))
        let board = try await connection.call(ShepMethod.boardSubscribe.rawValue, params: NoParams(), as: Board.self)
        let changes = Self.relay(connection) { note -> Board? in
            guard case let .boardChanged(board)? = try? ShepNotification(note) else { return nil }
            return board
        }
        return BoardFeed(board: board, changes: changes)
    }

    public func agentFeed(id: TaskId) async throws -> AgentFeed {
        let connection = RPCConnection(transport: try connector(socketPath))
        let reply = try await connection.call(
            ShepMethod.agentWatch.rawValue, params: AgentWatchParams(id: id), as: WatchReply.self
        )
        let output = Self.relay(connection) { note -> Data? in
            guard case let .agentOutput(output)? = try? ShepNotification(note), output.id == id else { return nil }
            return Data(base64Encoded: output.data)
        }
        return AgentFeed(screen: Data(base64Encoded: reply.screen) ?? Data(), output: output)
    }

    /// The shared connection, reconnecting if the last one closed.
    private func connection() throws -> RPCConnection {
        try lock.locked {
            if let shared, !shared.isClosed {
                return shared
            }
            let fresh = RPCConnection(transport: try connector(socketPath))
            shared = fresh
            return fresh
        }
    }

    /// Passes on the notifications `pick` keeps; the stream ends when the connection does, and
    /// the connection closes when nobody listens any more.
    private static func relay<T: Sendable>(
        _ connection: RPCConnection, _ pick: @escaping @Sendable (RPCNotification) -> T?
    ) -> AsyncStream<T> {
        AsyncStream { continuation in
            let pump = Task {
                for await note in connection.notifications {
                    if let value = pick(note) {
                        continuation.yield(value)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                pump.cancel()
                connection.close()
            }
        }
    }
}
