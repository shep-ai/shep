import Foundation

/// Whether a Ready task's pull request is green, by the daemon's rule (`ci_words` in
/// `shep-app/src/detail.rs`): every check finished and none failed, or else the last CI event
/// was "CI green". A task needs a pull request to be merged at all.
///
/// The daemon counts these in `Brief.mergeable` but has no "merge all green" call, so the app
/// applies the same rule to each Ready task's detail and merges them one by one.
public enum GreenRule {
    static let ciEvents: Set<EventKind> = [.ciGreen, .noCi, .ciFailed]

    public static func isGreen(_ detail: TaskDetail) -> Bool {
        guard detail.task.pr != nil else { return false }
        let checks = detail.checks.map(\.state)
        if !checks.isEmpty, !checks.contains(.failed), !checks.contains(.pending) {
            return true
        }
        return detail.events.last { ciEvents.contains($0.kind) }?.kind == .ciGreen
    }
}

/// "Merge all green": merges every Ready task whose pull request is green.
public struct GreenMerge: Sendable {
    public struct Failure: Equatable, Sendable {
        public let task: ShepTask
        public let message: String
    }

    public struct Report: Equatable, Sendable {
        public var merged: [ShepTask] = []
        /// Ready, but not green: left for a person.
        public var skipped = 0
        public var failed: [Failure] = []
        /// Set when the board itself could not be read.
        public var problem: String?

        public var summary: String {
            if let problem { return problem }
            var parts = ["Merged \(merged.count)"]
            if skipped > 0 { parts.append("\(skipped) left for you") }
            if let first = failed.first { parts.append("\(failed.count) could not merge: \(first.message)") }
            return parts.joined(separator: " · ")
        }
    }

    let client: any ShepClient

    public init(client: any ShepClient) {
        self.client = client
    }

    public func run() async -> Report {
        var report = Report()
        let ready: [ShepTask]
        do {
            ready = try await client.board().ready
        } catch {
            report.problem = error.localizedDescription
            return report
        }
        for task in ready {
            do {
                guard GreenRule.isGreen(try await client.taskDetail(id: task.id)) else {
                    report.skipped += 1
                    continue
                }
                report.merged.append(try await client.review(id: task.id, action: .merge))
            } catch {
                report.failed.append(Failure(task: task, message: error.localizedDescription))
            }
        }
        return report
    }
}
