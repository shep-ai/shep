import Foundation
import XCTest

@testable import ShepKit

/// The client against a real Unix socket served by a fake daemon.
final class DaemonClientSocketTests: XCTestCase {
    func testCallsTheDaemonOverAUnixSocket() async throws {
        let server = try FakeDaemonSocket { request in
            let id = request["id"] as? Int ?? 0
            let reply = #"{"jsonrpc":"2.0","id":\#(id),"result":\#(Fixtures.emptyBoardJSON)}"# + "\n"
            // Split the answer across two writes, the way a long line arrives.
            let middle = reply.index(reply.startIndex, offsetBy: reply.count / 2)
            return [String(reply[..<middle]), String(reply[middle...])]
        }
        defer { server.stop() }
        let client = DaemonClient(socketPath: server.path)
        let board = try await client.board()
        XCTAssertEqual(board, Fixtures.emptyBoard)
    }

    func testABoardFeedStartsWithTheBoardAndThenFollowsChanges() async throws {
        let ready = Fixtures.task(id: 9, title: "Fix login redirect loop", state: .ready)
        let changed = Board(needsYou: [], ready: [ready], working: [], queued: [], merged: [])
        let changedJSON = String(decoding: try JSONEncoder().encode(changed), as: UTF8.self)
        let server = try FakeDaemonSocket { request in
            let id = request["id"] as? Int ?? 0
            return [
                #"{"jsonrpc":"2.0","id":\#(id),"result":\#(Fixtures.emptyBoardJSON)}"# + "\n",
                #"{"jsonrpc":"2.0","method":"board.changed","params":\#(changedJSON)}"# + "\n",
            ]
        }
        defer { server.stop() }
        let feed = try await DaemonClient(socketPath: server.path).boardFeed()
        XCTAssertEqual(feed.board, Fixtures.emptyBoard)
        var changes = feed.changes.makeAsyncIterator()
        let next = await changes.next()
        XCTAssertEqual(next, changed)
    }

    func testAnAgentFeedDecodesTheScreenAndOutput() async throws {
        let server = try FakeDaemonSocket { request in
            let id = request["id"] as? Int ?? 0
            return [
                #"{"jsonrpc":"2.0","id":\#(id),"result":{"screen":"c2NyZWVu"}}"# + "\n",
                #"{"jsonrpc":"2.0","method":"agent.output","params":{"id":4,"data":"b3RoZXI="}}"# + "\n",
                #"{"jsonrpc":"2.0","method":"agent.output","params":{"id":5,"data":"aGk="}}"# + "\n",
            ]
        }
        defer { server.stop() }
        let feed = try await DaemonClient(socketPath: server.path).agentFeed(id: 5)
        XCTAssertEqual(String(decoding: feed.screen, as: UTF8.self), "screen")
        var output = feed.output.makeAsyncIterator()
        let chunk = await output.next()
        XCTAssertEqual(chunk.map { String(decoding: $0, as: UTF8.self) }, "hi", "only this task's output")
    }

    func testNoDaemonIsAClearError() async throws {
        let client = DaemonClient(socketPath: "/tmp/shepkit-nobody-\(UUID().uuidString.prefix(8)).sock")
        await XCTAssertThrowsErrorAsync(try await client.board()) { error in
            guard case .connect = error as? ShepClientError else { return XCTFail("\(error)") }
            XCTAssertTrue(error.localizedDescription.contains("Shep daemon"), error.localizedDescription)
        }
    }
}
