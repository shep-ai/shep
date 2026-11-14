import Foundation
import Observation

/// The board as the daemon pushes it, shared by every window and the menu bar. Follows
/// `board.subscribe`, and when the daemon goes away says so and tries again.
@MainActor
@Observable
public final class BoardStore {
    public enum Status: Equatable, Sendable {
        case connecting
        case live
        case offline(String)
    }

    public static let feedEnded = "The Shep daemon stopped answering. Trying again…"
    public nonisolated static let defaultRetryDelay: TimeInterval = 3
    static let nanosecondsPerSecond: Double = 1_000_000_000

    public private(set) var board = Board.empty
    public private(set) var settings: Settings?
    public private(set) var status = Status.connecting

    @ObservationIgnored let client: any ShepClient
    @ObservationIgnored private let retryDelay: TimeInterval

    public init(client: any ShepClient, retryDelay: TimeInterval = BoardStore.defaultRetryDelay) {
        self.client = client
        self.retryDelay = retryDelay
    }

    /// Follows the board until cancelled (or for `attempts` subscriptions, in tests).
    public func follow(attempts: Int? = nil) async {
        var made = 0
        while !Task.isCancelled {
            if let attempts, made >= attempts { return }
            if made > 0, retryDelay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(retryDelay * Self.nanosecondsPerSecond))
            }
            made += 1
            do {
                let feed = try await client.boardFeed()
                board = feed.board
                status = .live
                await refreshSettings()
                for await next in feed.changes {
                    board = next
                }
                status = .offline(Self.feedEnded)
            } catch {
                status = .offline(error.localizedDescription)
            }
        }
    }

    public func refreshSettings() async {
        if let settings = try? await client.settingsGet() {
            self.settings = settings
        }
    }

    /// Where tonight's merged count starts.
    public func startOfToday(now: Date = Date(), calendar: Calendar = .current) -> UnixTime {
        LocalDay.start(of: now, calendar: calendar)
    }

    public func summary(now: Date = Date(), calendar: Calendar = .current) -> NightSummary {
        NightSummary(board: board, settings: settings, mergedSince: startOfToday(now: now, calendar: calendar))
    }
}
