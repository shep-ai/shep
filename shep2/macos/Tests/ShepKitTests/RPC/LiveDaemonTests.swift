import Foundation
import XCTest

@testable import ShepKit

/// The client against a real `shep __daemon`. Opt-in: start a daemon in a throwaway
/// `SHEP_HOME` (outside any git repository) and run with `SHEP_LIVE_SOCKET=<its socket>`.
/// It adds two sentence tasks and never starts them.
final class LiveDaemonTests: XCTestCase {
    private var socket: String?

    override func setUpWithError() throws {
        socket = ProcessInfo.processInfo.environment["SHEP_LIVE_SOCKET"]
        try XCTSkipIf(socket == nil, "set SHEP_LIVE_SOCKET to run against a real daemon")
    }

    func testTheGeneratedClientTalksToTheRealDaemon() async throws {
        let client = DaemonClient(socketPath: try XCTUnwrap(socket))
        let task = try await client.add(input: "Swift client smoke task")
        XCTAssertEqual(task.state, .queued)
        XCTAssertEqual(task.source, .sentence(text: "Swift client smoke task"))
        let board = try await client.board()
        XCTAssertTrue(board.queued.contains(task))
        let detail = try await client.taskDetail(id: task.id)
        XCTAssertEqual(detail.step, .queued)
        _ = try await client.brief()
        _ = try await client.briefMorning()
        let settings = try await client.settingsGet()
        let updated = try await client.settingsUpdate(change: SettingsChange(parallelism: settings.parallelism))
        XCTAssertEqual(updated, settings)
        do {
            _ = try await client.review(id: task.id, action: .merge)
            XCTFail("a queued task cannot merge")
        } catch let error as ShepClientError {
            guard case .rpc = error else { return XCTFail("\(error)") }
        }
    }

    func testTheBoardFeedHearsAnAdd() async throws {
        let client = DaemonClient(socketPath: try XCTUnwrap(socket))
        let feed = try await client.boardFeed()
        let added = try await client.add(input: "Swift feed smoke task")
        for await board in feed.changes where board.queued.contains(where: { $0.id == added.id }) {
            return
        }
        XCTFail("the feed ended before the new task arrived")
    }

    func testWatchingATaskWithNoAgentIsTheDaemonsError() async throws {
        let client = DaemonClient(socketPath: try XCTUnwrap(socket))
        let task = try await client.add(input: "Swift client smoke task")
        do {
            _ = try await client.agentFeed(id: task.id)
            XCTFail("no agent runs for a queued task")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("no agent running"), error.localizedDescription)
        }
    }
}
