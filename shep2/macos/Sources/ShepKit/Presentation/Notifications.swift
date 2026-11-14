import Foundation

/// A button on a notification. The raw values are the identifiers the app registers.
public struct NotificationAction: Equatable, Sendable {
    public enum Kind: String, Sendable, CaseIterable {
        case mergeGreen = "shep.merge-green"
        case review = "shep.review"
        case answer = "shep.answer"
        case open = "shep.open"
    }

    public let kind: Kind
    public let title: String
}

/// The one message at dawn: what is ready, how much is green, what needs an answer.
public struct MorningNotification: Equatable, Sendable {
    public static let category = "shep.morning"
    static let title = "Dawn"

    public let title: String
    public let body: String
    public let actions: [NotificationAction]

    public init(brief: Brief) {
        title = Self.title
        let needs = brief.items.filter { $0.task.state == .needsYou }.count
        body = Self.body(ready: brief.done, green: brief.mergeable, needsYou: needs)
        var actions: [NotificationAction] = []
        if brief.mergeable > 0 {
            actions.append(NotificationAction(kind: .mergeGreen, title: "Merge \(brief.mergeable) green"))
        }
        actions.append(NotificationAction(kind: .review, title: "Review"))
        self.actions = actions
    }

    /// The brief once per morning (`brief.morning`), as a notification; nil when nothing is new.
    public static func check(_ client: any ShepClient) async throws -> MorningNotification? {
        try await client.briefMorning().map(MorningNotification.init(brief:))
    }

    /// Whether to ask for the morning brief now: the last task stopped working and something
    /// waits for a person. Never in the middle of the night (`old` nil: the app just opened).
    public static func shiftEnded(from old: Board?, to new: Board) -> Bool {
        guard new.working.isEmpty, !(new.ready.isEmpty && new.needsYou.isEmpty) else { return false }
        return old.map { !$0.working.isEmpty } ?? true
    }

    private static func body(ready: Int, green: Int, needsYou: Int) -> String {
        var sentences: [String] = []
        if ready == 0 {
            sentences.append("Nothing is ready yet.")
        } else {
            let prs = ready == 1 ? "1 pull request is ready" : "\(ready) pull requests are ready"
            if green == ready {
                sentences.append(prs + " and CI is green.")
            } else if green > 0 {
                sentences.append(prs + ", \(green) with CI green.")
            } else {
                sentences.append(prs + ".")
            }
        }
        if needsYou > 0 {
            sentences.append("\(needsYou) \(needsYou == 1 ? "needs" : "need") your answer.")
        }
        return sentences.joined(separator: " ")
    }
}

/// A task that just started waiting on a person.
public struct NeedsYouNotification: Equatable, Sendable {
    public static let category = "shep.needs-you"
    static let noQuestion = "The agent has a question."

    public let taskId: TaskId
    public let title: String
    public let body: String
    public let actions = [
        NotificationAction(kind: .answer, title: "Answer…"),
        NotificationAction(kind: .open, title: "Open"),
    ]

    public init(task: ShepTask) {
        taskId = task.id
        title = "\(task.reference ?? task.title) needs you"
        body = task.question ?? Self.noQuestion
    }

    /// Tasks that need you in `new` but did not in `old`. Nothing on first sight: what already
    /// waited when the app opened is in the morning brief.
    public static func new(from old: Board?, to new: Board) -> [NeedsYouNotification] {
        guard let old else { return [] }
        let before = Set(old.needsYou.map(\.id))
        return new.needsYou.filter { !before.contains($0.id) }.map(NeedsYouNotification.init(task:))
    }
}
