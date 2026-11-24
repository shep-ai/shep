import Foundation
import XCTest

@testable import ShepKit

final class LineFramerTests: XCTestCase {
    func testSplitsOneMessagePerLine() {
        var framer = LineFramer()
        let lines = framer.append(Data("{\"a\":1}\n{\"b\":2}\n".utf8))
        XCTAssertEqual(lines.map { String(decoding: $0, as: UTF8.self) }, ["{\"a\":1}", "{\"b\":2}"])
    }

    func testKeepsAPartialLineUntilItsNewlineArrives() {
        var framer = LineFramer()
        XCTAssertEqual(framer.append(Data("{\"a\":".utf8)), [])
        let lines = framer.append(Data("1}\n{\"b\"".utf8))
        XCTAssertEqual(lines.map { String(decoding: $0, as: UTF8.self) }, ["{\"a\":1}"])
        XCTAssertEqual(framer.append(Data(":2}\n".utf8)).count, 1)
    }

    func testSkipsBlankLinesLikeTheDaemonDoes() {
        var framer = LineFramer()
        XCTAssertEqual(framer.append(Data("\n  \n{}\n".utf8)), [Data("{}".utf8)])
    }

    func testAMultiByteCharacterSplitAcrossReadsSurvives() {
        var framer = LineFramer()
        let bytes = Array("{\"t\":\"🐑\"}\n".utf8)
        XCTAssertEqual(framer.append(Data(bytes[..<8])), [])
        let line = framer.append(Data(bytes[8...]))
        XCTAssertEqual(String(decoding: line[0], as: UTF8.self), "{\"t\":\"🐑\"}")
    }
}
