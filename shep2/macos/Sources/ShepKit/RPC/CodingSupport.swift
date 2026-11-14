import Foundation

/// A coding key made from any string: the variant names of serde's externally tagged enums.
public struct AnyCodingKey: CodingKey, Hashable, Sendable {
    public let stringValue: String
    public let intValue: Int?

    public init(_ string: String) {
        stringValue = string
        intValue = nil
    }

    public init?(stringValue: String) {
        self.init(stringValue)
    }

    public init?(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}

/// The result of a call that answers `null`, like `agent.send`.
public struct RPCNull: Codable, Hashable, Sendable {
    public init() {}

    public init(from decoder: Decoder) throws {}

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encodeNil()
    }
}

extension NSLocking {
    /// Runs `body` holding the lock.
    func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
