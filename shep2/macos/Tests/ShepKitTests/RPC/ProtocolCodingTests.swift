import Foundation
import XCTest

@testable import ShepKit

/// The generated types against JSON the real daemon wrote (board, settings, brief, queued detail)
/// and against the schema's tagged enums.
final class ProtocolCodingTests: XCTestCase {
    func testDecodesABoardTheDaemonWrote() throws {
        let board = try Fixtures.decode(Board.self, "board")
        XCTAssertEqual(board.queued.map(\.title), ["Fix login redirect loop", "acme/booking-app#412", "Rate-limit /api/search"])
        XCTAssertEqual(board.queued[1].source, .gitHubIssue(number: 412, repo: "acme/booking-app"))
        XCTAssertEqual(board.queued[0].state, .queued)
    }

    func testDecodesSettingsDetailAndBrief() throws {
        let settings = try Fixtures.decode(Settings.self, "settings")
        XCTAssertEqual(settings.shiftStart, ClockTime(hour: 23, minute: 0))
        XCTAssertNil(settings.agent)
        let queued = try Fixtures.decode(TaskDetail.self, "task-detail-queued")
        XCTAssertEqual(queued.step, .queued)
        XCTAssertEqual(queued.activity, "queued")
        let ready = try Fixtures.decode(TaskDetail.self, "task-detail-ready")
        XCTAssertEqual(ready.checks.map(\.state), [.passed, .skipped])
        XCTAssertEqual(ready.task.pr?.number, 77)
        let brief = try Fixtures.decode(Brief.self, "brief-morning")
        XCTAssertEqual(brief.overnight?.parkedSecs, 600)
        XCTAssertEqual(brief.items.first?.task.state, .needsYou)
    }

    func testReviewActionsEncodeAsSerdeExternallyTaggedEnums() throws {
        XCTAssertEqual(try json(ReviewAction.merge), #""Merge""#)
        XCTAssertEqual(try json(ReviewAction.sendBack(note: "keep the old URLs")), #"{"SendBack":{"note":"keep the old URLs"}}"#)
        XCTAssertEqual(try json(ReviewAction.answer(text: "acme-uploads")), #"{"Answer":{"text":"acme-uploads"}}"#)
        XCTAssertEqual(try json(StartWhen.now), #""Now""#)
        XCTAssertEqual(try json(StartWhen.at(ClockTime(hour: 23, minute: 5))), #"{"At":{"hour":23,"minute":5}}"#)
    }

    func testTaggedEnumsRoundTrip() throws {
        let values: [StartOutcome] = [
            .started([Fixtures.task(id: 1, state: .working)]),
            .scheduled(at: ClockTime(hour: 23, minute: 0), queued: 4),
        ]
        for value in values {
            XCTAssertEqual(try JSONDecoder().decode(StartOutcome.self, from: JSONEncoder().encode(value)), value)
        }
        let source = try JSONDecoder().decode(TaskSourceRef.self, from: Data(#"{"GitHubIssue":{"number":430}}"#.utf8))
        XCTAssertEqual(source, .gitHubIssue(number: 430, repo: nil))
    }

    func testStepViewIncludesParked() throws {
        XCTAssertEqual(try JSONDecoder().decode(StepView.self, from: Data(#""Parked""#.utf8)), .parked)
    }

    /// The protocol only grows: an older app reads what a newer daemon adds as `unknown`.
    func testValuesFromANewerDaemonReadAsUnknown() throws {
        let decode = JSONDecoder()
        XCTAssertEqual(try decode.decode(ReviewAction.self, from: Data(#""Delete""#.utf8)), .unknown("Delete"))
        XCTAssertEqual(try decode.decode(ReviewAction.self, from: Data(#"{"Snooze":{"until":3}}"#.utf8)), .unknown("Snooze"))
        XCTAssertEqual(try decode.decode(TaskState.self, from: Data(#""Paused""#.utf8)), .unknown)
        XCTAssertFalse(TaskState.allCases.contains(.unknown))
    }

    func testAMalformedVariantIsStillAnError() {
        XCTAssertThrowsError(try JSONDecoder().decode(ReviewAction.self, from: Data(#"{"A":{},"B":{}}"#.utf8)))
    }

    func testASettingsChangeSendsOnlyTheFieldsItSets() throws {
        XCTAssertEqual(try json(SettingsChange(parallelism: 4)), #"{"parallelism":4}"#)
        XCTAssertEqual(try json(AddParams(input: "#412")), ##"{"input":"#412"}"##)
    }

    private func json<T: Encodable>(_ value: T) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return String(decoding: try encoder.encode(value), as: UTF8.self)
    }
}
