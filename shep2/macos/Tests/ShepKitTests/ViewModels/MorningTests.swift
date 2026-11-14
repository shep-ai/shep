import XCTest

@testable import ShepKit

final class MorningTests: XCTestCase {
    func testTheMorningNotificationOffersToMergeTheGreenOnes() throws {
        let brief = try Fixtures.decode(Brief.self, "brief-morning")
        let note = MorningNotification(brief: brief)
        XCTAssertEqual(note.title, "Dawn")
        XCTAssertEqual(note.body, "2 pull requests are ready, 1 with CI green. 1 needs your answer.")
        XCTAssertEqual(note.actions.map(\.kind), [.mergeGreen, .review])
        XCTAssertEqual(note.actions.map(\.title), ["Merge 1 green", "Review"])
    }

    func testAllGreenReadsSimply() {
        let brief = Brief(at: 0, items: [], done: 5, total: 5, mergeable: 5)
        XCTAssertEqual(MorningNotification(brief: brief).body, "5 pull requests are ready and CI is green.")
        let none = Brief(at: 0, items: [], done: 1, total: 1, mergeable: 0)
        let note = MorningNotification(brief: none)
        XCTAssertEqual(note.body, "1 pull request is ready.")
        XCTAssertEqual(note.actions.map(\.kind), [.review])
    }

    func testANewQuestionIsNotifiedOnce() {
        let asks = Fixtures.task(id: 3, title: "Move avatars to S3", state: .needsYou, issue: 430, question: "Which bucket?")
        let before = Fixtures.board(working: [Fixtures.task(id: 3, state: .working)])
        let after = Fixtures.board(needsYou: [asks])
        XCTAssertEqual(NeedsYouNotification.new(from: before, to: after).map(\.taskId), [3])
        XCTAssertEqual(NeedsYouNotification.new(from: after, to: after), [])
        XCTAssertEqual(NeedsYouNotification.new(from: nil, to: after), [], "not on first sight: the brief covers those")
        let note = NeedsYouNotification(task: asks)
        XCTAssertEqual(note.title, "#430 needs you")
        XCTAssertEqual(note.body, "Which bucket?")
    }

    func testGreenMeansChecksAllPassedOrTheLastCIEventWasGreen() throws {
        let ready = try Fixtures.decode(TaskDetail.self, "task-detail-ready")
        XCTAssertTrue(GreenRule.isGreen(ready))
        var failing = ready
        failing.checks = [CiCheck(name: "build", state: .failed)]
        failing.events = []
        XCTAssertFalse(GreenRule.isGreen(failing))
        var noPR = ready
        noPR.task.pr = nil
        XCTAssertFalse(GreenRule.isGreen(noPR), "nothing to merge without a pull request")
        var pending = ready
        pending.checks = [CiCheck(name: "build", state: .pending)]
        pending.events = [TaskEvent(taskId: 2, at: 1, kind: .ciGreen, detail: "")]
        XCTAssertTrue(GreenRule.isGreen(pending), "falls back to the last CI event, like the daemon")
        pending.events.append(TaskEvent(taskId: 2, at: 2, kind: .noCi, detail: ""))
        XCTAssertFalse(GreenRule.isGreen(pending))
    }

    func testMergeAllGreenMergesOnlyGreenReadyTasks() async throws {
        let green = Fixtures.task(id: 1, title: "Green", state: .ready, pr: Fixtures.pr(1))
        let red = Fixtures.task(id: 2, title: "Red", state: .ready, pr: Fixtures.pr(2))
        let client = FakeShepClient(board: Fixtures.board(ready: [green, red]))
        client.details(1, Fixtures.detail(green, checks: [CiCheck(name: "ci", state: .passed)]))
        client.details(2, Fixtures.detail(red, checks: [CiCheck(name: "ci", state: .failed)]))
        let report = await GreenMerge(client: client).run()
        XCTAssertEqual(report.merged.map(\.id), [1])
        XCTAssertEqual(report.skipped, 1)
        XCTAssertEqual(report.summary, "Merged 1 · 1 left for you")
        XCTAssertTrue(client.calls.contains(.review(1, .merge)))
        XCTAssertFalse(client.calls.contains(.review(2, .merge)))
    }

    func testAMergeGitHubRefusesIsReported() async {
        let green = Fixtures.task(id: 1, title: "Green", state: .ready, pr: Fixtures.pr(1))
        let client = FakeShepClient(board: Fixtures.board(ready: [green]))
        client.details(1, Fixtures.detail(green, checks: [CiCheck(name: "ci", state: .passed)]))
        client.fail(.review, "merge conflict")
        let report = await GreenMerge(client: client).run()
        XCTAssertEqual(report.failed.map(\.message), ["merge conflict"])
        XCTAssertEqual(report.summary, "Merged 0 · 1 could not merge: merge conflict")
    }
}
