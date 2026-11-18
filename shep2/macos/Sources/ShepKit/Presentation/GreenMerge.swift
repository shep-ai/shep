import Foundation

/// "Merge all green": merges every Ready task the daemon reports green (`Brief.green`). The
/// rule for "green" lives in the daemon alone, so every surface merges the same tasks.
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
        let green: Set<TaskId>
        do {
            ready = try await client.board().ready
            green = Set(try await client.brief().green ?? [])
        } catch {
            report.problem = error.localizedDescription
            return report
        }
        for task in ready {
            guard green.contains(task.id) else {
                report.skipped += 1
                continue
            }
            do {
                report.merged.append(try await client.review(id: task.id, action: .merge))
            } catch {
                report.failed.append(Failure(task: task, message: error.localizedDescription))
            }
        }
        return report
    }
}
