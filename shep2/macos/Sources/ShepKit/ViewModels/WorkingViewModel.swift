import Foundation
import Observation

/// One Working task, live: its agent's screen (rendered by the daemon's terminal emulator, read
/// from `task.detail`), the activity line, events and checks, and a note box that types into
/// the agent. `agent.watch` is the signal that the screen changed.
@MainActor
@Observable
public final class WorkingViewModel {
    public nonisolated static let defaultRefreshInterval: TimeInterval = 0.5

    public let taskId: TaskId
    public private(set) var detail: TaskDetail?
    public private(set) var isLive = false
    public private(set) var message: String?
    public private(set) var isSending = false
    public var note = ""

    @ObservationIgnored private let client: any ShepClient
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let refreshInterval: TimeInterval

    public init(
        client: any ShepClient,
        taskId: TaskId,
        now: @escaping () -> Date = Date.init,
        refreshInterval: TimeInterval = WorkingViewModel.defaultRefreshInterval
    ) {
        self.client = client
        self.taskId = taskId
        self.now = now
        self.refreshInterval = refreshInterval
    }

    public var title: String { detail?.task.headline ?? "" }
    public var activity: String { detail?.activity ?? "" }
    public var screen: String { detail?.screen ?? "" }
    public var events: [TaskEvent] { (detail?.events ?? []).reversed() }
    public var checks: [CiCheck] { detail?.checks ?? [] }
    public var diff: DiffDocument { DiffDocument(patch: detail?.diff ?? "") }

    /// How long the agent has worked: since it last started, else since the task last changed.
    public var elapsed: String? {
        guard let detail else { return nil }
        let since = detail.events.last { $0.kind == .agentStarted }?.at ?? detail.task.updatedAt
        return Elapsed.text(seconds: UnixTime(now().timeIntervalSince1970) - since)
    }

    /// Loads the task, then follows its agent while one runs. Returns when the agent's session
    /// ends or the caller is cancelled.
    public func start() async {
        await refresh()
        guard detail?.live == true else { return }
        do {
            let feed = try await client.agentFeed(id: taskId)
            isLive = true
            var lastRead = now()
            for await _ in feed.output {
                if now().timeIntervalSince(lastRead) >= refreshInterval {
                    lastRead = now()
                    await refresh()
                }
            }
        } catch {
            message = error.localizedDescription
        }
        isLive = false
        await refresh()
    }

    public func refresh() async {
        do {
            detail = try await client.taskDetail(id: taskId)
        } catch {
            message = error.localizedDescription
        }
    }

    /// Types the note into the agent, then Return; it reads it at its next step.
    public func sendNote() async {
        let text = note.trimmed
        guard !text.isEmpty else { return }
        isSending = true
        defer { isSending = false }
        do {
            try await client.type(text, into: taskId)
            note = ""
        } catch {
            message = error.localizedDescription
        }
    }
}
