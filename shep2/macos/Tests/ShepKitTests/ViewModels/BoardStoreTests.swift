import XCTest

@testable import ShepKit

@MainActor
final class BoardStoreTests: XCTestCase {
    func testFollowsTheFeedAndKeepsTheLatestBoard() async {
        let ready = Fixtures.task(id: 1, state: .ready)
        let client = FakeShepClient()
        client.set { $0.boardChanges = [Fixtures.board(ready: [ready])] }
        let store = BoardStore(client: client, retryDelay: 0)
        await store.follow(attempts: 1)
        XCTAssertEqual(store.board.ready, [ready])
        XCTAssertNotNil(store.settings)
    }

    func testWhenTheDaemonIsAwayItSaysSoAndTriesAgain() async {
        let client = FakeShepClient()
        client.fail(.boardSubscribe, "The Shep daemon is not running")
        let store = BoardStore(client: client, retryDelay: 0)
        await store.follow(attempts: 2)
        XCTAssertEqual(store.status, .offline("The Shep daemon is not running"))
        XCTAssertEqual(client.calls.filter { $0 == .boardSubscribe }.count, 2)
    }

    func testAFeedThatEndsIsFollowedAgain() async {
        let client = FakeShepClient()
        let store = BoardStore(client: client, retryDelay: 0)
        await store.follow(attempts: 2)
        XCTAssertEqual(client.calls.filter { $0 == .boardSubscribe }.count, 2)
        XCTAssertEqual(store.status, .offline(BoardStore.feedEnded))
    }
}
