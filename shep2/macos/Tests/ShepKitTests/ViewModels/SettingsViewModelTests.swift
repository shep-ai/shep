import XCTest

@testable import ShepKit

@MainActor
final class SettingsViewModelTests: XCTestCase {
    private func loaded() async -> (SettingsViewModel, FakeShepClient) {
        let client = FakeShepClient()
        client.set { $0.settings = Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3, agent: .claudeCode, repo: "/Users/sam/booking-app") }
        let model = SettingsViewModel(client: client)
        await model.load()
        return (model, client)
    }

    func testLoadsTheDaemonsSettings() async {
        let (model, _) = await loaded()
        XCTAssertEqual(model.agent, .claudeCode)
        XCTAssertEqual(model.repo, "/Users/sam/booking-app")
        XCTAssertEqual(model.shiftStart, ClockTime(hour: 23, minute: 0))
        XCTAssertEqual(model.parallelism, 3)
        XCTAssertFalse(model.hasChanges)
    }

    func testSavesOnlyWhatChanged() async {
        let (model, client) = await loaded()
        model.parallelism = 4
        model.shiftStart = ClockTime(hour: 22, minute: 30)
        XCTAssertTrue(model.hasChanges)
        await model.save()
        XCTAssertEqual(client.calls.last, .settingsUpdate(SettingsChange(parallelism: 4, shiftStart: ClockTime(hour: 22, minute: 30))))
        XCTAssertFalse(model.hasChanges)
        XCTAssertEqual(model.message, "Saved")
    }

    func testParallelismMustBeBetweenOneAndTwelve() async {
        let (model, client) = await loaded()
        model.parallelism = 13
        XCTAssertEqual(model.problem, "Run between 1 and 12 tasks at a time.")
        await model.save()
        XCTAssertFalse(client.calls.contains { if case .settingsUpdate = $0 { return true } else { return false } })
    }

    func testTheDaemonsRefusalIsShown() async {
        let (model, client) = await loaded()
        client.fail(.settingsUpdate, "run between 1 and 12 tasks at a time, not 0")
        model.parallelism = 5
        await model.save()
        XCTAssertEqual(model.message, "run between 1 and 12 tasks at a time, not 0")
        XCTAssertTrue(model.hasChanges)
    }

    nonisolated func testClockTimesConvertToAndFromDates() {
        let date = ClockTime(hour: 6, minute: 5).date(on: Date(timeIntervalSince1970: TimeInterval(Fixtures.morning)), calendar: Fixtures.utc)
        XCTAssertEqual(ClockTime(date: date, calendar: Fixtures.utc), ClockTime(hour: 6, minute: 5))
        XCTAssertEqual(ClockTime(hour: 6, minute: 5).text, "06:05")
    }
}
