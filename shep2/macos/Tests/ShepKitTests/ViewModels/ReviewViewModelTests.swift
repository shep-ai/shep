import Foundation
import XCTest

@testable import ShepKit

@MainActor
final class ReviewViewModelTests: XCTestCase {
    let ready1 = Fixtures.task(id: 1, title: "Fix login redirect loop", state: .ready, issue: 412, pr: Fixtures.pr(77))
    let ready2 = Fixtures.task(id: 2, title: "Add CSV export", state: .ready, issue: 418, pr: Fixtures.pr(78))
    let asks = Fixtures.task(id: 3, title: "Move avatars to S3", state: .needsYou, issue: 430, question: "Which bucket?")
    let busy = Fixtures.task(id: 4, title: "Empty state", state: .working)
    let waiting = Fixtures.task(id: 5, title: "Dark mode", state: .queued)
    let done = Fixtures.task(id: 6, title: "Typo", state: .merged)

    private func model(_ board: Board) async -> (ReviewViewModel, FakeShepClient) {
        let client = FakeShepClient(board: board)
        let model = ReviewViewModel(client: client, now: { Date(timeIntervalSince1970: TimeInterval(Fixtures.morning)) }, calendar: Fixtures.utc)
        await model.update(board: board)
        return (model, client)
    }

    private var fullBoard: Board {
        Fixtures.board(needsYou: [asks], ready: [ready1, ready2], working: [busy], queued: [waiting], merged: [done])
    }

    func testTheQueueIsSortedByVerdictReadyNeedsYouWorkingQueued() async {
        let (model, _) = await model(fullBoard)
        XCTAssertEqual(model.queue.map(\.id), [1, 2, 3, 4, 5], "merged tasks are not in the queue")
    }

    func testSelectsTheFirstTaskAndLoadsItsDetail() async {
        let (model, client) = await model(fullBoard)
        XCTAssertEqual(model.selected?.id, 1)
        XCTAssertEqual(model.detail?.task.id, 1)
        XCTAssertEqual(model.position, "1 of 5")
        XCTAssertTrue(client.calls.contains(.taskDetail(1)))
    }

    func testJAndKMoveTheSelectionAndStopAtTheEnds() async {
        let (model, _) = await model(fullBoard)
        await model.handle(.previous)
        XCTAssertEqual(model.selected?.id, 1)
        await model.handle(.next)
        await model.handle(.next)
        XCTAssertEqual(model.selected?.id, 3)
        XCTAssertEqual(model.detail?.task.id, 3)
        for _ in 0..<5 { await model.handle(.next) }
        XCTAssertEqual(model.selected?.id, 5)
    }

    func testSpaceTogglesBetweenProofAndDiff() async {
        let (model, _) = await model(fullBoard)
        XCTAssertEqual(model.pane, .proof)
        await model.handle(.togglePane)
        XCTAssertEqual(model.pane, .diff)
        await model.handle(.togglePane)
        XCTAssertEqual(model.pane, .proof)
    }

    func testMMergesAReadyTaskAndMovesOnToTheNext() async {
        let (model, client) = await model(fullBoard)
        await model.handle(.merge)
        XCTAssertTrue(client.calls.contains(.review(1, .merge)))
        XCTAssertEqual(model.queue.map(\.id), [2, 3, 4, 5])
        XCTAssertEqual(model.selected?.id, 2, "the next task takes the merged one's place")
        XCTAssertEqual(model.mergedToday, 2)
    }

    func testMOnATaskThatIsNotReadyExplainsInsteadOfCalling() async {
        let (model, client) = await model(fullBoard)
        await model.select(id: 4)
        await model.handle(.merge)
        XCTAssertFalse(client.calls.contains { if case .review = $0 { return true } else { return false } })
        XCTAssertEqual(model.message, "Only a Ready task can be merged.")
    }

    func testSOpensANoteAndSendingItSendsTheTaskBack() async {
        let (model, client) = await model(fullBoard)
        await model.handle(.sendBack)
        XCTAssertTrue(model.isWritingNote)
        model.note = "Keep the old URLs working"
        await model.submitNote()
        XCTAssertTrue(client.calls.contains(.review(1, .sendBack(note: "Keep the old URLs working"))))
        XCTAssertFalse(model.isWritingNote)
        XCTAssertEqual(model.note, "")
        XCTAssertEqual(model.sentBack, 1)
    }

    func testAnEmptyNoteIsNotSentAndCancelClosesIt() async {
        let (model, client) = await model(fullBoard)
        await model.handle(.sendBack)
        model.note = "   "
        await model.submitNote()
        XCTAssertTrue(model.isWritingNote)
        await model.handle(.cancel)
        XCTAssertFalse(model.isWritingNote)
        XCTAssertEqual(client.calls.filter { if case .review = $0 { return true } else { return false } }, [])
    }

    func testDecisionKeysWaitWhileANoteIsBeingWritten() async {
        let (model, client) = await model(fullBoard)
        await model.handle(.sendBack)
        await model.handle(.next)
        await model.handle(.merge)
        XCTAssertEqual(model.selected?.id, 1)
        XCTAssertFalse(client.calls.contains(.review(1, .merge)))
    }

    func testAnsweringATaskThatNeedsYou() async {
        let (model, client) = await model(fullBoard)
        await model.select(id: 3)
        XCTAssertEqual(model.question, "Which bucket?")
        model.answer = "acme-prod-avatars"
        await model.submitAnswer()
        XCTAssertTrue(client.calls.contains(.review(3, .answer(text: "acme-prod-avatars"))))
        XCTAssertEqual(model.answer, "")
        XCTAssertFalse(model.queue.contains { $0.id == 3 && $0.state == .needsYou })
    }

    func testADaemonErrorIsShownAndTheTaskStays() async {
        let (model, client) = await model(fullBoard)
        client.fail(.review, "GitHub refused the merge: checks are failing")
        await model.handle(.merge)
        XCTAssertEqual(model.message, "GitHub refused the merge: checks are failing")
        XCTAssertEqual(model.selected?.id, 1)
        XCTAssertEqual(model.queue.count, 5)
    }

    func testABoardChangeKeepsTheSelectedTask() async {
        let (model, _) = await model(fullBoard)
        await model.select(id: 3)
        let newcomer = Fixtures.task(id: 9, title: "New", state: .ready)
        await model.update(board: Fixtures.board(needsYou: [asks], ready: [newcomer, ready1, ready2]))
        XCTAssertEqual(model.selected?.id, 3)
    }

    func testDawnWhenNothingIsLeftToReviewOrRunning() async {
        let (busyModel, _) = await model(fullBoard)
        XCTAssertFalse(busyModel.isDawn)
        let (dawn, _) = await model(Fixtures.board(queued: [waiting], merged: [done]))
        XCTAssertTrue(dawn.isDawn, "queued work waits for tonight; the morning is done")
        XCTAssertEqual(dawn.dawn, DawnSummary(merged: 1, sentBack: 0, waiting: 0))
        XCTAssertEqual(dawn.sky.frame, SkyProgress.lastFrame)
    }

    func testTheSkyBrightensWithEachDecision() async {
        let (model, _) = await model(Fixtures.board(ready: [ready1, ready2]))
        XCTAssertEqual(model.sky.fraction, 0)
        await model.handle(.merge)
        XCTAssertEqual(model.sky.fraction, 0.5)
        await model.handle(.merge)
        XCTAssertEqual(model.sky.fraction, 1)
    }

    func testMergedTodayCountsOnlyThisMorningsMerges() async {
        let yesterday = Fixtures.task(id: 7, state: .merged, updatedAt: Fixtures.morning - 86_400)
        let (model, _) = await model(Fixtures.board(merged: [done, yesterday]))
        XCTAssertEqual(model.mergedToday, 1)
    }

    nonisolated func testKeysFromTheKeyboard() {
        XCTAssertEqual(ReviewKey(character: "m"), .merge)
        XCTAssertEqual(ReviewKey(character: "M"), .merge)
        XCTAssertEqual(ReviewKey(character: "s"), .sendBack)
        XCTAssertEqual(ReviewKey(character: "j"), .next)
        XCTAssertEqual(ReviewKey(character: "k"), .previous)
        XCTAssertEqual(ReviewKey(character: " "), .togglePane)
        XCTAssertNil(ReviewKey(character: "x"))
    }
}
