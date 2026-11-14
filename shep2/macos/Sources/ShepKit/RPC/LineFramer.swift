import Foundation

/// Splits a byte stream into the daemon's messages: one JSON value per line. Bytes are kept
/// until their newline arrives, so a message (or a character) split across reads survives.
public struct LineFramer: Sendable {
    private static let newline = UInt8(ascii: "\n")
    private var pending = Data()

    public init() {}

    /// The complete, non-blank lines in what has arrived so far, without their newlines.
    public mutating func append(_ bytes: Data) -> [Data] {
        pending.append(bytes)
        var lines: [Data] = []
        while let end = pending.firstIndex(of: Self.newline) {
            let line = Data(pending[pending.startIndex..<end])
            pending = Data(pending[pending.index(after: end)...])
            if !Self.isBlank(line) {
                lines.append(line)
            }
        }
        return lines
    }

    private static func isBlank(_ line: Data) -> Bool {
        line.allSatisfy { $0 == UInt8(ascii: " ") || $0 == UInt8(ascii: "\t") || $0 == UInt8(ascii: "\r") }
    }
}
