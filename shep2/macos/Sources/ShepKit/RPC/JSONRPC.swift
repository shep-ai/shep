import Foundation

/// The JSON-RPC 2.0 envelopes the daemon speaks (`shep-jsonrpc/src/message.rs`).
enum JSONRPC {
    static let version = "2.0"
    static let newline = UInt8(ascii: "\n")

    struct Request<Params: Encodable>: Encodable {
        let jsonrpc = JSONRPC.version
        let id: UInt64
        let method: String
        let params: Params
    }

    /// What every incoming line is sorted by: a call's answer has an `id`, a notification a
    /// `method` and no `id`.
    struct Header: Decodable {
        let id: UInt64?
        let method: String?
        let error: ErrorObject?

        enum CodingKeys: String, CodingKey { case id, method, error }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try? container.decodeIfPresent(UInt64.self, forKey: .id)
            method = try container.decodeIfPresent(String.self, forKey: .method)
            error = try container.decodeIfPresent(ErrorObject.self, forKey: .error)
        }
    }

    struct ErrorObject: Decodable {
        let code: Int
        let message: String
    }

    struct Result<Value: Decodable>: Decodable {
        let result: Value
    }

    struct Params<Value: Decodable>: Decodable {
        let params: Value
    }
}

/// A notification as it arrived; its params are decoded by whoever knows their type.
public struct RPCNotification: Sendable, Equatable {
    public let method: String
    let line: Data

    public init(method: String, line: Data) {
        self.method = method
        self.line = line
    }

    public func params<P: Decodable>(_ type: P.Type) throws -> P {
        do {
            return try JSONDecoder().decode(JSONRPC.Params<P>.self, from: line).params
        } catch {
            throw ShepClientError.decode("\(method): \(error)")
        }
    }
}

/// Why a call to the daemon failed, in words a person can act on.
public enum ShepClientError: Error, Equatable, Sendable, LocalizedError {
    /// The daemon answered with an error: its message is already meant for a person.
    case rpc(code: Int, message: String)
    /// Nothing answers on the socket.
    case connect(path: String, reason: String)
    /// The connection closed before the answer came.
    case closed
    case io(String)
    /// The answer did not have the shape this version expects.
    case decode(String)

    public var errorDescription: String? {
        switch self {
        case let .rpc(_, message):
            return message
        case let .connect(path, reason):
            return "The Shep daemon is not running (\(reason) at \(path)). Start it with `shep go`."
        case .closed:
            return "The Shep daemon closed the connection."
        case let .io(reason):
            return "Talking to the Shep daemon failed: \(reason)"
        case let .decode(reason):
            return "The Shep daemon sent something this app does not understand: \(reason)"
        }
    }
}

/// Anything that can answer a call by method name: a connection to the daemon, or a fake.
public protocol RPCCalling: Sendable {
    func call<P: Encodable & Sendable, R: Decodable & Sendable>(
        _ method: ShepMethod, _ params: P, as type: R.Type
    ) async throws -> R
}
