import XCTest

@testable import ShepKit

final class ShepIntentsTests: XCTestCase {
    func testQueueIssue() async throws {
        let client = FakeShepClient()
        let reply = try await ShepIntents(client: client).queue("#412")
        XCTAssertEqual(client.calls, [.add("#412")])
        XCTAssertEqual(reply, "Queued “#412” for tonight.")
    }

    func testReadyPullRequests() async throws {
        let board = Fixtures.board(ready: [
            Fixtures.task(id: 1, title: "Fix login", state: .ready, issue: 412, pr: Fixtures.pr(77)),
            Fixtures.task(id: 2, title: "No PR yet", state: .ready),
        ])
        let reply = try await ShepIntents(client: FakeShepClient(board: board)).readyPullRequests()
        XCTAssertEqual(reply, "2 ready: #412 Fix login (PR #77), No PR yet.")
        let none = try await ShepIntents(client: FakeShepClient()).readyPullRequests()
        XCTAssertEqual(none, "Nothing is ready yet.")
    }

    func testMergeAllGreen() async {
        let green = Fixtures.task(id: 1, state: .ready, pr: Fixtures.pr(1))
        let client = FakeShepClient(board: Fixtures.board(ready: [green]))
        client.set { $0.brief.green = [1] }
        let reply = await ShepIntents(client: client).mergeAllGreen()
        XCTAssertEqual(reply, "Merged 1")
    }
}
