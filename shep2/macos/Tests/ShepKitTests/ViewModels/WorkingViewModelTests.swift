import Foundation
import XCTest

@testable import ShepKit

@MainActor
final class WorkingViewModelTests: XCTestCase {
    let task = Fixtures.task(id: 4, title: "Empty state for projects page", state: .working, issue: 425)
    let started = Fixtures.morning - 252

    private func detail(screen: String?, live: Bool = true) -> TaskDetail {
        Fixtures.detail(
            task, step: .coding, events: [TaskEvent(taskId: 4, at: started, kind: .agentStarted, detail: "agent started")],
            live: live, screen: screen, activity: "Edit src/pages/projects/index.tsx"
        )
    }

    private func model(_ client: FakeShepClient) -> WorkingViewModel {
        WorkingViewModel(client: client, taskId: 4, now: { Date(timeIntervalSince1970: TimeInterval(Fixtures.morning)) })
    }

    func testShowsTheRenderedScreenAndActivity() async {
        let client = FakeShepClient(board: Fixtures.board(working: [task]))
        client.details(4, detail(screen: "> Reading index.tsx", live: false))
        let model = model(client)
        await model.start()
        XCTAssertEqual(model.title, "#425 · Empty state for projects page")
        XCTAssertEqual(model.activity, "Edit src/pages/projects/index.tsx")
        XCTAssertEqual(model.screen, "> Reading index.tsx")
        XCTAssertEqual(model.elapsed, "4m 12s")
        XCTAssertFalse(model.isLive)
    }

    func testFollowsALiveAgentAndRereadsTheScreenWhenItPrints() async {
        let client = FakeShepClient(board: Fixtures.board(working: [task]))
        client.details(4, detail(screen: "one"), detail(screen: "one\ntwo"), detail(screen: "one\ntwo", live: false))
        client.set { $0.agentOutput = [Data("two".utf8)] }
        let model = model(client)
        await model.start()
        XCTAssertTrue(client.calls.contains(.agentWatch(4)))
        XCTAssertEqual(model.screen, "one\ntwo")
        XCTAssertFalse(model.isLive, "the feed ended with the agent")
    }

    func testANoteIsTypedIntoTheAgentFollowedByReturn() async throws {
        let client = FakeShepClient(board: Fixtures.board(working: [task]))
        client.details(4, detail(screen: "", live: false))
        let model = model(client)
        await model.start()
        model.note = "Use the shared EmptyState"
        await model.sendNote()
        let expected = Data("Use the shared EmptyState\r".utf8).base64EncodedString()
        XCTAssertTrue(client.calls.contains(.agentSend(4, expected)))
        XCTAssertEqual(model.note, "")
    }

    func testABlankNoteIsNotSent() async {
        let client = FakeShepClient(board: Fixtures.board(working: [task]))
        let model = model(client)
        model.note = "  "
        await model.sendNote()
        XCTAssertFalse(client.calls.contains { if case .agentSend = $0 { return true } else { return false } })
    }

    func testWhenTheAgentCannotBeWatchedTheReasonIsShown() async {
        let client = FakeShepClient(board: Fixtures.board(working: [task]))
        client.details(4, detail(screen: "x"))
        client.fail(.agentWatch, "task 4 has no agent running right now")
        let model = model(client)
        await model.start()
        XCTAssertFalse(model.isLive)
        XCTAssertEqual(model.message, "task 4 has no agent running right now")
    }

    nonisolated func testElapsedReadsLikeAPerson() {
        XCTAssertEqual(Elapsed.text(seconds: 42), "42s")
        XCTAssertEqual(Elapsed.text(seconds: 252), "4m 12s")
        XCTAssertEqual(Elapsed.text(seconds: 3_900), "1h 05m")
    }
}
