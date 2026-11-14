import Foundation

@testable import ShepKit

/// A daemon in memory. It answers from its own board (adds queue, reviews move tasks the way
/// the domain does), records every call, and fails a method on request.
final class FakeShepClient: ShepClient, @unchecked Sendable {
    enum Call: Equatable {
        case add(String), start(StartWhen), board, review(TaskId, ReviewAction), settingsGet
        case settingsUpdate(SettingsChange), boardSubscribe, taskDetail(TaskId), brief, briefMorning
        case dayFirstRun, addLabel(String), agentWatch(TaskId), agentSend(TaskId, String)
        case setup(String?), sources, sourceConnect(SourceKind), sourceDisconnect(SourceKind)
        case sourcesCandidates(Int)
    }

    private let lock = NSLock()
    private var state: State

    struct State {
        var board: Board = Fixtures.emptyBoard
        var settings = Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3)
        var details: [TaskId: [TaskDetail]] = [:]
        var brief = Brief(at: Fixtures.morning, items: [], done: 0, total: 0, mergeable: 0)
        var morning: Brief?
        var labelled: [ShepTask] = []
        var failures: [ShepMethod: ShepClientError] = [:]
        var calls: [Call] = []
        var nextId: TaskId = 100
        var agentScreen = Data()
        var agentOutput: [Data] = []
        var boardChanges: [Board] = []
        var sources: [SourceStatus] = []
        var candidates: [Candidate] = []
        var setup = Setup(
            agents: [], suggestions: [],
            settings: Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3), ready: false
        )
    }

    init(board: Board = Fixtures.emptyBoard) {
        state = State(board: board)
    }

    func set(_ change: (inout State) -> Void) { lock.locked { change(&state) } }
    var current: State { lock.locked { state } }
    var calls: [Call] { current.calls }
    var board: Board { current.board }

    func fail(_ method: ShepMethod, _ message: String) {
        set { $0.failures[method] = .rpc(code: -32000, message: message) }
    }

    /// `task.detail` answers these in turn, repeating the last.
    func details(_ id: TaskId, _ details: TaskDetail...) {
        set { $0.details[id] = details }
    }

    private func record(_ call: Call, _ method: ShepMethod) throws {
        let failure: ShepClientError? = lock.locked {
            state.calls.append(call)
            return state.failures[method]
        }
        if let failure { throw failure }
    }

    // MARK: ShepCalls

    func add(input: String, fromDir: String?) async throws -> ShepTask {
        try record(.add(input), .add)
        return lock.locked {
            let task = Fixtures.task(id: state.nextId, title: input, state: .queued)
            state.nextId += 1
            state.board.queued.append(task)
            return task
        }
    }

    func start(when: StartWhen) async throws -> StartOutcome {
        try record(.start(when), .start)
        return lock.locked {
            switch when {
            case let .at(time):
                state.settings.shiftStart = time
                return .scheduled(at: time, queued: state.board.queued.count)
            case .now:
                let started = state.board.queued.prefix(state.settings.parallelism).map { task -> ShepTask in
                    var task = task
                    task.state = .working
                    return task
                }
                state.board.queued.removeFirst(started.count)
                state.board.working += started
                return .started(Array(started))
            case .unknown:
                return .started([])
            }
        }
    }

    func board() async throws -> Board {
        try record(.board, .board)
        return board
    }

    func review(id: TaskId, action: ReviewAction) async throws -> ShepTask {
        try record(.review(id, action), .review)
        return try lock.locked { try state.board.apply(action, to: id) }
    }

    func settingsGet() async throws -> Settings {
        try record(.settingsGet, .settingsGet)
        return current.settings
    }

    func settingsUpdate(change: SettingsChange) async throws -> Settings {
        try record(.settingsUpdate(change), .settingsUpdate)
        return lock.locked {
            if let agent = change.agent { state.settings.agent = agent }
            if let repo = change.repo { state.settings.repo = repo }
            if let start = change.shiftStart { state.settings.shiftStart = start }
            if let parallelism = change.parallelism { state.settings.parallelism = parallelism }
            return state.settings
        }
    }

    func boardSubscribe() async throws -> Board {
        try record(.boardSubscribe, .boardSubscribe)
        return board
    }

    func taskDetail(id: TaskId) async throws -> TaskDetail {
        try record(.taskDetail(id), .taskDetail)
        return try lock.locked {
            if var queue = state.details[id], let first = queue.first {
                if queue.count > 1 { queue.removeFirst() }
                state.details[id] = queue
                return first
            }
            guard let task = state.board.all.first(where: { $0.id == id }) else {
                throw ShepClientError.rpc(code: -32000, message: "no task \(id)")
            }
            return Fixtures.detail(task)
        }
    }

    func brief() async throws -> Brief {
        try record(.brief, .brief)
        return current.brief
    }

    func briefMorning() async throws -> Brief? {
        try record(.briefMorning, .briefMorning)
        return current.morning
    }

    func setup(fromDir: String?) async throws -> Setup {
        try record(.setup(fromDir), .setup)
        return current.setup
    }

    func sources() async throws -> [SourceStatus] {
        try record(.sources, .sources)
        return current.sources
    }

    func sourceConnect(kind: SourceKind, values: [String: String]?) async throws -> SourceStatus {
        try record(.sourceConnect(kind), .sourceConnect)
        return lock.locked {
            let i = state.sources.firstIndex { $0.kind == kind }
            guard let i else { return Fixtures.source(kind, connected: true) }
            state.sources[i].connected = true
            return state.sources[i]
        }
    }

    func sourceDisconnect(kind: SourceKind) async throws {
        try record(.sourceDisconnect(kind), .sourceDisconnect)
        set { state in
            if let i = state.sources.firstIndex(where: { $0.kind == kind }) {
                state.sources[i].connected = false
            }
        }
    }

    func sourcesCandidates(limit: Int) async throws -> [Candidate] {
        try record(.sourcesCandidates(limit), .sourcesCandidates)
        return Array(current.candidates.prefix(limit))
    }

    func dayFirstRun() async throws -> Bool {
        try record(.dayFirstRun, .dayFirstRun)
        return true
    }

    func addLabel(label: String, fromDir: String?) async throws -> [ShepTask] {
        try record(.addLabel(label), .addLabel)
        return lock.locked {
            state.board.queued += state.labelled
            return state.labelled
        }
    }

    func agentWatch(id: TaskId) async throws -> WatchReply {
        try record(.agentWatch(id), .agentWatch)
        return WatchReply(screen: current.agentScreen.base64EncodedString())
    }

    func agentSend(id: TaskId, data: String) async throws {
        try record(.agentSend(id, data), .agentSend)
    }

    // MARK: Feeds

    func boardFeed() async throws -> BoardFeed {
        try record(.boardSubscribe, .boardSubscribe)
        let (board, changes) = lock.locked { (state.board, state.boardChanges) }
        return BoardFeed(board: board, changes: Self.finite(changes))
    }

    func agentFeed(id: TaskId) async throws -> AgentFeed {
        try record(.agentWatch(id), .agentWatch)
        let (screen, output) = lock.locked { (state.agentScreen, state.agentOutput) }
        return AgentFeed(screen: screen, output: Self.finite(output))
    }

    private static func finite<T: Sendable>(_ values: [T]) -> AsyncStream<T> {
        AsyncStream { continuation in
            values.forEach { continuation.yield($0) }
            continuation.finish()
        }
    }
}

extension Board {
    var all: [ShepTask] { needsYou + ready + working + queued + merged }

    /// What the domain does on a decision (`shep-domain/src/task.rs`), for the fake.
    mutating func apply(_ action: ReviewAction, to id: TaskId) throws -> ShepTask {
        guard var task = all.first(where: { $0.id == id }) else {
            throw ShepClientError.rpc(code: -32000, message: "no task \(id)")
        }
        switch (action, task.state) {
        case (.merge, .ready):
            task.state = .merged
        case let (.sendBack(note), .ready), let (.answer(note), .needsYou):
            task.state = .working
            task.note = note
            task.question = nil
        default:
            throw ShepClientError.rpc(code: -32000, message: "a task cannot move from \(task.state.rawValue)")
        }
        needsYou.removeAll { $0.id == id }
        ready.removeAll { $0.id == id }
        if task.state == .merged { merged.append(task) } else { working.append(task) }
        return task
    }
}
