import XCTest

@testable import ShepKit

final class NightSummaryTests: XCTestCase {
    let shift = Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3)

    private func summary(_ board: Board) -> NightSummary {
        NightSummary(board: board, settings: shift, mergedSince: Fixtures.morning - 3_600)
    }

    func testKeepingWatchWhileAnythingWorks() {
        let board = Fixtures.board(
            needsYou: [Fixtures.task(id: 1, state: .needsYou)],
            ready: [Fixtures.task(id: 2, state: .ready), Fixtures.task(id: 3, state: .ready), Fixtures.task(id: 4, state: .ready)],
            working: [Fixtures.task(id: 5, state: .working), Fixtures.task(id: 6, state: .working)]
        )
        let night = summary(board)
        XCTAssertEqual(night.phase, .keepingWatch(done: 4, total: 6))
        XCTAssertEqual(night.title, "Keeping watch · 4/6")
        XCTAssertEqual(night.sky.fraction, 4.0 / 6.0, accuracy: 0.0001)
    }

    func testOtherPhases() {
        let asks = Fixtures.task(id: 1, title: "Move avatars", state: .needsYou, issue: 430)
        XCTAssertEqual(summary(Fixtures.board(needsYou: [asks])).title, "#430 needs you")
        XCTAssertEqual(summary(Fixtures.board(ready: [Fixtures.task(id: 2, state: .ready)])).title, "Dawn · 1 ready")
        let queued = (1...6).map { Fixtures.task(id: TaskId($0), state: .queued) }
        XCTAssertEqual(summary(Fixtures.board(queued: queued)).title, "Shift at 23:00 · 6 queued")
        XCTAssertEqual(summary(Fixtures.emptyBoard).title, "Nothing queued")
    }

    func testRowsListWhatMattersInReviewOrder() {
        let board = Fixtures.board(
            needsYou: [Fixtures.task(id: 1, title: "Ask", state: .needsYou, issue: 430)],
            ready: [Fixtures.task(id: 2, title: "Done", state: .ready, issue: 412)],
            working: [Fixtures.task(id: 3, title: "Busy", state: .working, issue: 433)]
        )
        XCTAssertEqual(summary(board).rows.map(\.text), ["#412 Done", "#430 Ask", "#433 Busy"])
        XCTAssertEqual(summary(board).rows.map(\.state), [.ready, .needsYou, .working])
    }

    func testSkyFrames() {
        XCTAssertEqual(SkyProgress(done: 0, total: 6).frame, 0)
        XCTAssertEqual(SkyProgress(done: 3, total: 6).frame, 3)
        XCTAssertEqual(SkyProgress(done: 6, total: 6).frame, SkyProgress.lastFrame)
        XCTAssertEqual(SkyProgress(done: 0, total: 0).fraction, 1, "nothing to do is dawn")
        XCTAssertEqual(SkyProgress(done: 9, total: 6).fraction, 1)
    }
}
