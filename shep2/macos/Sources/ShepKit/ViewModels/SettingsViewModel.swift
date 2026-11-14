import Foundation
import Observation

/// The settings the daemon keeps: which agent, which repository, when the shift starts and how
/// many tasks run at once. Saving sends only what changed.
@MainActor
@Observable
public final class SettingsViewModel {
    static let saved = "Saved"
    static let badParallelism =
        "Run between \(ShepLimits.parallelism.lowerBound) and \(ShepLimits.parallelism.upperBound) tasks at a time."
    static let badTime = "Use a time of day between 00:00 and 23:59."

    public var agent: AgentKind?
    public var repo = ""
    public var shiftStart = ShepLimits.defaultShiftStart
    public var parallelism = ShepLimits.defaultParallelism
    public private(set) var saved: Settings?
    public private(set) var message: String?
    public private(set) var isBusy = false

    @ObservationIgnored private let client: any ShepClient

    public init(client: any ShepClient) {
        self.client = client
    }

    public func load() async {
        do {
            show(try await client.settingsGet())
        } catch {
            message = error.localizedDescription
        }
    }

    /// Only the fields that differ from what the daemon has.
    public var change: SettingsChange {
        var change = SettingsChange()
        if agent != saved?.agent { change.agent = agent }
        let repo = repo.trimmed
        if !repo.isEmpty, repo != saved?.repo { change.repo = repo }
        if shiftStart != saved?.shiftStart { change.shiftStart = shiftStart }
        if parallelism != saved?.parallelism { change.parallelism = parallelism }
        return change
    }

    public var hasChanges: Bool { change != SettingsChange() }

    /// What is wrong with the form, before asking the daemon.
    public var problem: String? {
        if !ShepLimits.parallelism.contains(parallelism) { return Self.badParallelism }
        if !shiftStart.isValid { return Self.badTime }
        return nil
    }

    public func save() async {
        guard hasChanges, problem == nil else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            show(try await client.settingsUpdate(change: change))
            message = Self.saved
        } catch {
            message = error.localizedDescription
        }
    }

    private func show(_ settings: Settings) {
        saved = settings
        agent = settings.agent
        repo = settings.repo ?? ""
        shiftStart = settings.shiftStart
        parallelism = settings.parallelism
    }
}
