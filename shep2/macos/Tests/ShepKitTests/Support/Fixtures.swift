import Foundation
import XCTest

@testable import ShepKit

enum Fixtures {
    static let emptyBoardJSON = #"{"needs_you":[],"ready":[],"working":[],"queued":[],"merged":[]}"#
    static let emptyBoard = Board(needsYou: [], ready: [], working: [], queued: [], merged: [])
    /// 2026-11-14 06:30 UTC: a morning.
    static let morning: UnixTime = 1_794_637_800
    static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    static func data(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(type, from: data(name))
    }

    static func task(
        id: TaskId,
        title: String = "A task",
        state: TaskState,
        issue: Int64? = nil,
        pr: PullRequest? = nil,
        question: String? = nil,
        updatedAt: UnixTime = morning
    ) -> ShepTask {
        let source: TaskSourceRef = issue.map { .gitHubIssue(number: $0, repo: nil) } ?? .sentence(text: title)
        return ShepTask(
            id: id, title: title, source: source, state: state, createdAt: updatedAt - 3_600,
            updatedAt: updatedAt, note: nil, pr: pr, question: question
        )
    }

    static func pr(_ number: Int64) -> PullRequest {
        PullRequest(number: number, url: "https://github.com/acme/booking-app/pull/\(number)")
    }

    static func board(
        needsYou: [ShepTask] = [], ready: [ShepTask] = [], working: [ShepTask] = [],
        queued: [ShepTask] = [], merged: [ShepTask] = []
    ) -> Board {
        Board(needsYou: needsYou, ready: ready, working: working, queued: queued, merged: merged)
    }

    static func source(_ kind: SourceKind, connected: Bool) -> SourceStatus {
        SourceStatus(
            kind: kind, name: kind.rawValue, connected: connected, account: connected ? "Acme" : "",
            form: SourceForm(fields: [], handOver: ["Add the label shep"])
        )
    }

    static func detail(
        _ task: ShepTask,
        step: StepView? = nil,
        checks: [CiCheck] = [],
        events: [TaskEvent] = [],
        diff: String? = nil,
        live: Bool = false,
        screen: String? = nil,
        activity: String = "coding"
    ) -> TaskDetail {
        TaskDetail(
            task: task, step: step ?? StepView(rawValue: task.state.rawValue) ?? .coding, activity: activity,
            live: live, checks: checks, stat: DiffStat(files: 0, added: 0, removed: 0), proof: [], events: events,
            diff: diff, screen: screen
        )
    }
}
