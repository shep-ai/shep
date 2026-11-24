import Foundation

/// The board now, then every change the daemon pushes. Stop iterating `changes` to unsubscribe.
public struct BoardFeed: Sendable {
    public let board: Board
    public let changes: AsyncStream<Board>

    public init(board: Board, changes: AsyncStream<Board>) {
        self.board = board
        self.changes = changes
    }
}

/// A task's live agent: its screen when watching started, then what it prints.
public struct AgentFeed: Sendable {
    public let screen: Data
    public let output: AsyncStream<Data>

    public init(screen: Data, output: AsyncStream<Data>) {
        self.screen = screen
        self.output = output
    }
}

/// Everything the app asks of the daemon: every call in the schema, plus the two subscriptions
/// as streams. View models hold one of these and never know whether it is the socket or a fake.
public protocol ShepClient: ShepCalls {
    /// Subscribes to the board on a connection of its own.
    func boardFeed() async throws -> BoardFeed
    /// Watches a task's agent on a connection of its own.
    func agentFeed(id: TaskId) async throws -> AgentFeed
}

extension ShepClient {
    /// Types text into a task's agent, then Return.
    public func type(_ text: String, into id: TaskId) async throws {
        try await agentSend(id: id, data: Data((text + AgentInput.enter).utf8).base64EncodedString())
    }
}

enum AgentInput {
    /// What a terminal sends for the Return key.
    static let enter = "\r"
}
