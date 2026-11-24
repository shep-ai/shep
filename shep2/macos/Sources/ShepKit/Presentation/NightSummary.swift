import Foundation

/// The night at a glance, for the menu bar extra (and anything else that shows progress).
public struct NightSummary: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case scheduled(at: ClockTime, queued: Int)
        case keepingWatch(done: Int, total: Int)
        case needsYou(ShepTask)
        case dawn(ready: Int)
    }

    public struct Row: Equatable, Sendable, Identifiable {
        public let id: TaskId
        public let text: String
        public let state: TaskState
    }

    /// The states the menu lists, in review order.
    static let listed: [TaskState] = [.ready, .needsYou, .working]

    public let phase: Phase
    public let rows: [Row]
    public let sky: SkyProgress

    /// `mergedSince`: when tonight's count starts (the start of the local day, usually).
    public init(board: Board, settings: Settings?, mergedSince: UnixTime) {
        let done = board.ready.count + board.needsYou.count + board.merged(since: mergedSince).count
        let total = done + board.working.count + board.queued.count
        sky = SkyProgress(done: done, total: total)
        rows = Self.listed.flatMap(board.tasks).map { Row(id: $0.id, text: $0.row, state: $0.state) }
        if !board.working.isEmpty {
            phase = .keepingWatch(done: done, total: total)
        } else if let first = board.needsYou.first {
            phase = .needsYou(first)
        } else if !board.ready.isEmpty {
            phase = .dawn(ready: board.ready.count)
        } else if !board.queued.isEmpty {
            phase = .scheduled(at: settings?.shiftStart ?? ShepLimits.defaultShiftStart, queued: board.queued.count)
        } else {
            phase = .idle
        }
    }

    /// Next to the lantern in the menu bar: `4/6` while working, `!` when something needs you,
    /// the ready count at dawn; nothing otherwise.
    public var compact: String? {
        switch phase {
        case let .keepingWatch(done, total): return "\(done)/\(total)"
        case .needsYou: return "!"
        case let .dawn(ready): return "\(ready)"
        case .scheduled, .idle: return nil
        }
    }

    public var title: String {
        switch phase {
        case let .keepingWatch(done, total): return "Keeping watch · \(done)/\(total)"
        case let .needsYou(task): return "\(task.reference ?? task.title) needs you"
        case let .dawn(ready): return "Dawn · \(ready) ready"
        case let .scheduled(at, queued): return "Shift at \(at.text) · \(queued) queued"
        case .idle: return "Nothing queued"
        }
    }
}
