import XCTest

@testable import ShepKit

@MainActor
final class AddTaskViewModelTests: XCTestCase {
    private func model(queued: Int = 0) async -> (AddTaskViewModel, FakeShepClient) {
        let queue = (0..<queued).map { Fixtures.task(id: TaskId(50 + $0), state: .queued) }
        let client = FakeShepClient(board: Fixtures.board(queued: queue))
        let model = AddTaskViewModel(client: client)
        await model.load()
        return (model, client)
    }

    nonisolated func testEachLineIsAnIssueALinkOrASentence() {
        XCTAssertEqual(AddInputKind(classifying: "#412"), .issue)
        XCTAssertEqual(AddInputKind(classifying: "acme/booking-app#412"), .issue)
        XCTAssertEqual(AddInputKind(classifying: "https://linear.app/acme/issue/ENG-12"), .link)
        XCTAssertEqual(AddInputKind(classifying: "Make the empty state friendlier"), .sentence)
    }

    func testTheInputBecomesOneTaskPerNonBlankLine() async {
        let (model, _) = await model()
        model.input = "#412\n\n  Typo on the pricing page  \n"
        XCTAssertEqual(model.entries.map(\.text), ["#412", "Typo on the pricing page"])
        XCTAssertEqual(model.entries.map(\.kind), [.issue, .sentence])
        XCTAssertTrue(model.canSubmit)
    }

    func testAddsEachLineThenSchedulesTonightsShift() async {
        let (model, client) = await model()
        model.input = "#412\nTypo on the pricing page"
        await model.submit()
        XCTAssertEqual(client.calls.suffix(3), [.add("#412"), .add("Typo on the pricing page"), .start(.at(ClockTime(hour: 23, minute: 0)))])
        XCTAssertEqual(model.input, "")
        XCTAssertEqual(model.message, "Added 2 · tonight at 23:00")
    }

    func testStartNowStartsTheQueue() async {
        let (model, client) = await model()
        model.input = "#412"
        model.when = .now
        await model.submit()
        XCTAssertEqual(client.calls.last, .start(.now))
        XCTAssertEqual(model.message, "Added 1 · 1 started now")
    }

    func testByLabelQueuesEveryOpenIssueWithIt() async {
        let (model, client) = await model()
        client.set { $0.labelled = [Fixtures.task(id: 70, state: .queued, issue: 433), Fixtures.task(id: 71, state: .queued, issue: 436)] }
        model.mode = .label
        XCTAssertEqual(model.label, AddTaskViewModel.defaultLabel)
        await model.submit()
        XCTAssertTrue(client.calls.contains(.addLabel("shep")))
        XCTAssertEqual(model.message, "Added 2 · tonight at 23:00")
    }

    func testALineTheDaemonRefusesStaysForFixing() async {
        let (model, client) = await model()
        client.fail(.add, "not a task reference")
        model.input = "#bad"
        await model.submit()
        XCTAssertEqual(model.input, "#bad")
        XCTAssertEqual(model.message, "#bad: not a task reference")
        XCTAssertFalse(client.calls.contains { if case .start = $0 { return true } else { return false } })
    }

    func testThePlanSaysHowManyRoundsTheNightTakes() async {
        let (model, _) = await model(queued: 2)
        model.input = "#1\n#2\n#3"
        XCTAssertEqual(model.plan, "3 to add · with 2 already queued, about 2 rounds of 3 in parallel")
        model.input = ""
        XCTAssertFalse(model.canSubmit)
    }
}
