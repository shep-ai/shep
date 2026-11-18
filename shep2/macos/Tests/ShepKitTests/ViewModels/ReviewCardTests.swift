import Foundation
import XCTest

@testable import ShepKit

final class ReviewCardTests: XCTestCase {
    func testAReadyTaskReadsLikeTheDesign() throws {
        let detail = try Fixtures.decode(TaskDetail.self, "task-detail-ready")
        let now = Date(timeIntervalSince1970: TimeInterval(detail.task.updatedAt + 6 * 3_600))
        let card = ReviewCard(detail: detail, now: now)
        XCTAssertEqual(card.meta, "acme/booking-app · #412 · 6h ago · draft")
        XCTAssertEqual(card.chips, ["CI green", "+3 -1 · 2 files", "fixed 1 CI failure"])
        XCTAssertEqual(card.secondOpinion, "Looks good. One naming nit, left as a comment.")
        XCTAssertEqual(card.proof.map(\.name), ["tests.txt", "login.png"])
        XCTAssertEqual(card.proof.map(\.isImage), [false, true])
    }

    func testCIStatusFollowsTheChecksThenTheEvents() throws {
        var detail = try Fixtures.decode(TaskDetail.self, "task-detail-ready")
        detail.checks = [CiCheck(name: "build", state: .passed), CiCheck(name: "lint", state: .failed)]
        XCTAssertEqual(CiStatus(detail).label, "CI failed: lint")
        detail.checks = [CiCheck(name: "build", state: .pending)]
        XCTAssertEqual(CiStatus(detail).label, "CI running")
        detail.checks = []
        detail.events = [TaskEvent(taskId: 2, at: 1, kind: .noCi, detail: "")]
        XCTAssertEqual(CiStatus(detail).label, "no CI")
        detail.events = []
        XCTAssertNil(CiStatus(detail).label)
    }

    func testNamesAndTheMorningToShare() {
        XCTAssertEqual(AgentKind.allCases.map(\.displayName), ["Claude Code", "Codex", "Gemini CLI"])
        XCTAssertEqual(
            DawnSummary(merged: 5, sentBack: 1, waiting: 0).shareText,
            "Dawn. Shep worked the night shift: 5 merged, 1 sent back. Go to sleep with issues, wake up with pull requests."
        )
        XCTAssertEqual(ProofItem(path: "/tmp/a/shot.PNG").isImage, true)
    }

    func testAgo() {
        XCTAssertEqual(Ago.text(seconds: 20), "just now")
        XCTAssertEqual(Ago.text(seconds: 300), "5m ago")
        XCTAssertEqual(Ago.text(seconds: 7_200), "2h ago")
        XCTAssertEqual(Ago.text(seconds: 200_000), "2d ago")
    }

    func testTheMorningCheckWaitsForTheShiftToEnd() {
        let working = Fixtures.board(ready: [Fixtures.task(id: 1, state: .ready)], working: [Fixtures.task(id: 2, state: .working)])
        let done = Fixtures.board(ready: [Fixtures.task(id: 1, state: .ready), Fixtures.task(id: 2, state: .ready)])
        XCTAssertTrue(MorningNotification.shiftEnded(from: working, to: done))
        XCTAssertFalse(MorningNotification.shiftEnded(from: done, to: done))
        XCTAssertFalse(MorningNotification.shiftEnded(from: Fixtures.emptyBoard, to: working))
        XCTAssertTrue(MorningNotification.shiftEnded(from: nil, to: done), "the app opened after the shift")
    }
}

@MainActor
final class BoardStoreChangeTests: XCTestCase {
    func testEveryNewBoardIsReportedWithTheOneBefore() async {
        let ready = Fixtures.board(ready: [Fixtures.task(id: 1, state: .ready)])
        let client = FakeShepClient()
        client.set { $0.boardChanges = [ready] }
        let store = BoardStore(client: client, retryDelay: 0)
        var seen: [(Board?, Board)] = []
        store.onChange = { old, new in seen.append((old, new)) }
        await store.follow(attempts: 1)
        XCTAssertEqual(seen.map(\.0), [nil, Fixtures.emptyBoard])
        XCTAssertEqual(seen.map(\.1), [Fixtures.emptyBoard, ready])
    }
}
