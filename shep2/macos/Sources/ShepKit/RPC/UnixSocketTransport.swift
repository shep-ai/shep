import Foundation

#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#endif

/// Lines over a Unix domain socket, read on a thread of its own.
public final class UnixSocketTransport: LineTransport, @unchecked Sendable {
    private static let readSize = 64 * 1024
    private let descriptor: Int32
    private let lock = NSLock()
    private let writeLock = NSLock()
    /// Set by `close()`: reading stops quietly.
    private var closed = false
    /// Whether the descriptor is still open. Changed only under `lock`, so `close()` and the
    /// reader never shut or close a descriptor the other already closed.
    private var open = true

    private init(descriptor: Int32) {
        self.descriptor = descriptor
    }

    /// The reader thread holds the transport, so this runs only once reading is over (or never
    /// started).
    deinit {
        releaseDescriptor()
    }

    /// Connects to the socket at `path`.
    public static func connect(path: String) throws -> UnixSocketTransport {
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8)
        guard bytes.count < MemoryLayout.size(ofValue: address.sun_path) else {
            throw ShepClientError.connect(path: path, reason: "the socket path is too long")
        }
        withUnsafeMutableBytes(of: &address.sun_path) { raw in
            raw.copyBytes(from: bytes)
            raw[bytes.count] = 0
        }
        let descriptor = Posix.streamSocket()
        guard descriptor >= 0 else { throw ShepClientError.connect(path: path, reason: Posix.lastError()) }
        let connected = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Posix.connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connected == 0 else {
            let reason = Posix.lastError()
            Posix.close(descriptor)
            throw ShepClientError.connect(path: path, reason: reason)
        }
        Posix.noSigPipe(descriptor)
        return UnixSocketTransport(descriptor: descriptor)
    }

    public func start(onLine: @escaping @Sendable (Data) -> Void, onClose: @escaping @Sendable (Error?) -> Void) {
        let thread = Thread { [self] in
            let error = readLines(onLine)
            releaseDescriptor()
            onClose(error)
        }
        thread.name = "shep.socket.reader"
        thread.start()
    }

    public func send(_ line: Data) throws {
        try writeLock.locked {
            try line.withUnsafeBytes { raw in
                var offset = 0
                while offset < raw.count {
                    let sent = Posix.send(descriptor, raw.baseAddress! + offset, raw.count - offset)
                    if sent > 0 {
                        offset += sent
                    } else if errno != EINTR {
                        throw ShepClientError.io(Posix.lastError())
                    }
                }
            }
        }
    }

    /// Stops reading; the reader thread then closes the socket and reports the end.
    public func close() {
        lock.locked {
            closed = true
            if open {
                Posix.shutdown(descriptor)
            }
        }
    }

    private func releaseDescriptor() {
        lock.locked {
            if open {
                open = false
                Posix.close(descriptor)
            }
        }
    }

    /// Reads until the other end hangs up (nil) or reading fails (the error).
    private func readLines(_ onLine: @Sendable (Data) -> Void) -> Error? {
        var framer = LineFramer()
        var buffer = [UInt8](repeating: 0, count: Self.readSize)
        while true {
            let count = buffer.withUnsafeMutableBytes { Posix.read(descriptor, $0.baseAddress, $0.count) }
            if count > 0 {
                framer.append(Data(buffer[0..<count])).forEach(onLine)
            } else if count == 0 {
                return nil
            } else if errno != EINTR {
                return lock.locked { closed } ? nil : ShepClientError.io(Posix.lastError())
            }
        }
    }
}

/// The few POSIX calls the transport makes, spelled once for Linux and once for macOS.
enum Posix {
    static func streamSocket() -> Int32 {
        #if canImport(Glibc)
        return Glibc.socket(AF_UNIX, Int32(SOCK_STREAM.rawValue), 0)
        #else
        return Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        #endif
    }

    static func connect(_ fd: Int32, _ address: UnsafePointer<sockaddr>, _ length: socklen_t) -> Int32 {
        #if canImport(Glibc)
        return Glibc.connect(fd, address, length)
        #else
        return Darwin.connect(fd, address, length)
        #endif
    }

    /// A write to a closed socket must fail with EPIPE, not kill the app with SIGPIPE.
    static func noSigPipe(_ fd: Int32) {
        #if canImport(Darwin)
        var on: Int32 = 1
        _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
        #endif
    }

    static func send(_ fd: Int32, _ bytes: UnsafeRawPointer, _ count: Int) -> Int {
        #if canImport(Glibc)
        return Glibc.send(fd, bytes, count, Int32(MSG_NOSIGNAL))
        #else
        return Darwin.send(fd, bytes, count, 0)
        #endif
    }

    static func read(_ fd: Int32, _ buffer: UnsafeMutableRawPointer?, _ count: Int) -> Int {
        #if canImport(Glibc)
        return Glibc.read(fd, buffer, count)
        #else
        return Darwin.read(fd, buffer, count)
        #endif
    }

    static func shutdown(_ fd: Int32) {
        #if canImport(Glibc)
        _ = Glibc.shutdown(fd, Int32(SHUT_RDWR))
        #else
        _ = Darwin.shutdown(fd, SHUT_RDWR)
        #endif
    }

    static func close(_ fd: Int32) {
        #if canImport(Glibc)
        _ = Glibc.close(fd)
        #else
        _ = Darwin.close(fd)
        #endif
    }

    static func lastError() -> String {
        String(cString: strerror(errno))
    }
}
