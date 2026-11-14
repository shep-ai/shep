import Foundation
import XCTest

@testable import ShepKit

final class RPCConnectionTests: XCTestCase {
    func testACallSendsAJSONRPCRequestAndDecodesTheResult() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let settings = connection.call(ShepMethod.settingsGet.rawValue, params: NoParams(), as: Settings.self)
        try await transport.waitForRequests(1)
        let request = transport.requests[0]
        XCTAssertEqual(request["jsonrpc"] as? String, "2.0")
        XCTAssertEqual(request["method"] as? String, "settings.get")
        XCTAssertEqual((request["params"] as? [String: Any])?.count, 0)
        let id = try XCTUnwrap(request["id"] as? Int)
        transport.deliver(#"{"jsonrpc":"2.0","id":\#(id),"result":{"agent":"Codex","shift_start":{"hour":23,"minute":0},"parallelism":3,"repo":null}}"#)
        let got = try await settings
        XCTAssertEqual(got, Settings(shiftStart: ClockTime(hour: 23, minute: 0), parallelism: 3, agent: .codex))
    }

    func testEachLineEndsWithANewline() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let board = connection.call("board", params: NoParams(), as: Board.self)
        try await transport.waitForRequests(1)
        XCTAssertEqual(transport.sent[0].last, UInt8(ascii: "\n"))
        transport.deliver(#"{"jsonrpc":"2.0","id":1,"result":\#(Fixtures.emptyBoardJSON)}"#)
        _ = try await board
    }

    func testAnswersAreMatchedToCallsById() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let first = connection.call("day.first_run", params: NoParams(), as: Bool.self)
        try await transport.waitForRequests(1)
        async let second = connection.call("day.first_run", params: NoParams(), as: Bool.self)
        try await transport.waitForRequests(2)
        let ids = transport.requests.compactMap { $0["id"] as? Int }
        transport.deliver(#"{"jsonrpc":"2.0","id":\#(ids[1]),"result":false}"#)
        transport.deliver(#"{"jsonrpc":"2.0","id":\#(ids[0]),"result":true}"#)
        let (a, b) = try await (first, second)
        XCTAssertTrue(a)
        XCTAssertFalse(b)
    }

    func testAnErrorReplyThrowsTheDaemonsMessage() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let merged = connection.call("review", params: ReviewParams(id: 7, action: .merge), as: ShepTask.self)
        try await transport.waitForRequests(1)
        transport.deliver(#"{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"task 7 is Working, not Ready"}}"#)
        do {
            _ = try await merged
            XCTFail("expected an error")
        } catch let error as ShepClientError {
            XCTAssertEqual(error, .rpc(code: -32000, message: "task 7 is Working, not Ready"))
            XCTAssertEqual(error.localizedDescription, "task 7 is Working, not Ready")
        }
    }

    func testANullResultDecodesForVoidAndOptionalResults() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let brief = connection.call("brief.morning", params: NoParams(), as: Brief?.self)
        try await transport.waitForRequests(1)
        transport.deliver(#"{"jsonrpc":"2.0","id":1,"result":null}"#)
        let got = try await brief
        XCTAssertNil(got)
    }

    func testNotificationsArriveOnTheirOwnStreamEvenWhileACallWaits() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let board = connection.call("board.subscribe", params: NoParams(), as: Board.self)
        try await transport.waitForRequests(1)
        transport.deliver(#"{"jsonrpc":"2.0","method":"agent.output","params":{"id":3,"data":"aGk="}}"#)
        transport.deliver(#"{"jsonrpc":"2.0","id":1,"result":\#(Fixtures.emptyBoardJSON)}"#)
        _ = try await board
        var iterator = connection.notifications.makeAsyncIterator()
        let next = await iterator.next()
        let note = try XCTUnwrap(next)
        XCTAssertEqual(try ShepNotification(note), .agentOutput(AgentOutput(id: 3, data: "aGk=")))
    }

    func testAHangUpFailsWaitingCallsAndLaterOnes() async throws {
        let transport = MemoryTransport()
        let connection = RPCConnection(transport: transport)
        async let board = connection.call("board", params: NoParams(), as: Board.self)
        try await transport.waitForRequests(1)
        transport.hangUp()
        do {
            _ = try await board
            XCTFail("expected the call to fail")
        } catch {
            XCTAssertEqual(error as? ShepClientError, .closed)
        }
        XCTAssertTrue(connection.isClosed)
        await XCTAssertThrowsErrorAsync(try await connection.call("board", params: NoParams(), as: Board.self)) {
            XCTAssertEqual($0 as? ShepClientError, .closed)
        }
    }

    func testUnknownNotificationsAreNotAnError() throws {
        let note = RPCNotification(method: "something.new", line: Data(#"{"method":"something.new","params":{}}"#.utf8))
        XCTAssertNil(try ShepNotification(note))
    }
}

func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    file: StaticString = #filePath,
    line: UInt = #line,
    _ check: (Error) -> Void = { _ in }
) async {
    do {
        _ = try await expression()
        XCTFail("expected an error", file: file, line: line)
    } catch {
        check(error)
    }
}
