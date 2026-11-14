import Foundation

/// Limits and defaults the daemon enforces (`shep-domain/src/settings.rs`). Mirrored so the app
/// can say what is wrong before asking; the daemon still has the last word.
public enum ShepLimits {
    public static let parallelism = 1...12
    public static let defaultParallelism = 3
    public static let defaultShiftStart = ClockTime(hour: 23, minute: 0)
    static let hoursPerDay = 24
    static let minutesPerHour = 60
}

extension TaskState {
    /// The state as every surface writes it.
    public var label: String {
        switch self {
        case .queued: return "Queued"
        case .working: return "Working"
        case .needsYou: return "Needs you"
        case .ready: return "Ready"
        case .merged: return "Merged"
        case .unknown: return "Updated"
        }
    }
}

extension AgentKind {
    public var displayName: String {
        switch self {
        case .claudeCode: return "Claude Code"
        case .codex: return "Codex"
        case .gemini: return "Gemini CLI"
        case .unknown: return "Another agent"
        }
    }
}

extension ShepTask {
    /// Where the task came from, short: `#412`, `ENG-12`, `Notion`; nil for a sentence.
    public var reference: String? {
        switch source {
        case let .gitHubIssue(number, _): return "#\(number)"
        case let .linear(key), let .jira(key): return key
        case .notion: return "Notion"
        case .monday: return "Monday"
        case .slack: return "Slack"
        case .sentence, .unknown: return nil
        }
    }

    /// `owner/name` for a GitHub issue in another repository.
    public var repository: String? {
        if case let .gitHubIssue(_, repo) = source { return repo }
        return nil
    }

    /// `#412 · Fix login redirect loop`, for headings.
    public var headline: String { reference.map { "\($0) · \(title)" } ?? title }

    /// `#412 Fix login redirect loop`, for lists.
    public var row: String { reference.map { "\($0) \(title)" } ?? title }
}

extension Board {
    public static let empty = Board(needsYou: [], ready: [], working: [], queued: [], merged: [])

    /// The order a person reviews in: verdicts first, then what is still running or waiting.
    public static let reviewOrder: [TaskState] = [.ready, .needsYou, .working, .queued]

    public func tasks(_ state: TaskState) -> [ShepTask] {
        switch state {
        case .queued: return queued
        case .working: return working
        case .needsYou: return needsYou
        case .ready: return ready
        case .merged: return merged
        case .unknown: return []
        }
    }

    /// Everything not merged yet, in review order.
    public var reviewQueue: [ShepTask] { Self.reviewOrder.flatMap(tasks) }

    /// Tasks merged at or after `time`.
    public func merged(since time: UnixTime) -> [ShepTask] {
        merged.filter { $0.updatedAt >= time }
    }
}

enum LocalDay {
    /// The Unix time today began, in `calendar`'s time zone.
    static func start(of now: Date, calendar: Calendar) -> UnixTime {
        UnixTime(calendar.startOfDay(for: now).timeIntervalSince1970)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
