import XCTest

@testable import ShepKit

final class FakePermissions: NotificationPermissions, @unchecked Sendable {
    var decided: Bool
    private(set) var asked = false

    init(decided: Bool = false) { self.decided = decided }

    func isDecided() async -> Bool { decided }

    func request() async -> Bool {
        asked = true
        decided = true
        return true
    }
}

final class MemoryOnboardingStore: OnboardingStore, @unchecked Sendable {
    var isDone = false
}

@MainActor
final class OnboardingViewModelTests: XCTestCase {
    private func model(
        settings: Settings = Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3),
        permissions: FakePermissions = FakePermissions()
    ) async -> (OnboardingViewModel, FakeShepClient, MemoryOnboardingStore) {
        let client = FakeShepClient()
        client.set { $0.settings = settings }
        let store = MemoryOnboardingStore()
        let model = OnboardingViewModel(client: client, permissions: permissions, store: store)
        await model.load()
        return (model, client, store)
    }

    func testStartsWithWelcomeAndWalksEveryStep() async {
        let (model, _, _) = await model()
        XCTAssertEqual(model.step, .welcome)
        XCTAssertEqual(OnboardingStep.allCases.count, 8)
        await model.advance()
        XCTAssertEqual(model.step, .agent)
    }

    func testStepsAlreadySatisfiedAreSkipped() async {
        let ready = Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3, agent: .codex, repo: "/r")
        let (model, _, _) = await model(settings: ready, permissions: FakePermissions(decided: true))
        await model.advance()
        XCTAssertEqual(model.step, .github, "the agent is chosen")
        await model.advance()
        XCTAssertEqual(model.step, .nightShift, "the repository is chosen")
        await model.advance()
        XCTAssertEqual(model.step, .firstTask, "notifications were already decided")
    }

    func testChoosingTheAgentSavesItAndMovesOn() async {
        let (model, client, _) = await model()
        await model.advance()
        await model.choose(agent: .claudeCode)
        XCTAssertEqual(client.calls.last, .settingsUpdate(SettingsChange(agent: .claudeCode)))
        XCTAssertEqual(model.step, .github)
    }

    func testRepositoryAndNightShift() async {
        let (model, client, _) = await model()
        model.go(to: .repositories)
        await model.choose(repository: "/Users/sam/booking-app")
        XCTAssertEqual(client.calls.last, .settingsUpdate(SettingsChange(repo: "/Users/sam/booking-app")))
        XCTAssertEqual(model.step, .nightShift)
        await model.setNightShift(start: ClockTime(hour: 22, minute: 0), parallelism: 2)
        XCTAssertEqual(client.calls.last, .settingsUpdate(SettingsChange(parallelism: 2, shiftStart: ClockTime(hour: 22, minute: 0))))
        XCTAssertEqual(model.step, .notifications)
    }

    func testNotificationsAreAskedForOnce() async {
        let permissions = FakePermissions()
        let (model, _, _) = await model(permissions: permissions)
        model.go(to: .notifications)
        await model.allowNotifications()
        XCTAssertTrue(permissions.asked)
        XCTAssertEqual(model.step, .firstTask)
    }

    func testTheFirstTaskStartsNowAndTheLastStepWaitsForItsPullRequest() async {
        let (model, client, store) = await model()
        model.go(to: .firstTask)
        await model.startFirstTask("#412")
        XCTAssertEqual(Array(client.calls.suffix(2)), [.add("#412"), .start(.now)])
        XCTAssertEqual(model.step, .firstPullRequest)
        XCTAssertNil(model.firstReady)
        let firstId = try? XCTUnwrap(model.firstTaskId)
        let ready = Fixtures.task(id: firstId ?? 0, title: "#412", state: .ready, pr: Fixtures.pr(80))
        model.update(board: Fixtures.board(ready: [ready]))
        XCTAssertEqual(model.firstReady?.id, ready.id)
        model.finish()
        XCTAssertTrue(store.isDone)
        XCTAssertTrue(model.isComplete)
    }

    func testSkippingToTonightFinishes() async {
        let (model, _, store) = await model()
        model.go(to: .firstTask)
        model.finish()
        XCTAssertTrue(store.isDone)
    }
}
