import Foundation
import Observation

/// The eight steps of the Mac onboarding (`design/screens/MacOnboardingFlow.png`).
public enum OnboardingStep: Int, CaseIterable, Sendable {
    case welcome, agent, github, repositories, nightShift, notifications, firstTask, firstPullRequest
}

/// Asking macOS for notification permission; a fake in tests.
public protocol NotificationPermissions: Sendable {
    /// Whether the person already allowed or refused.
    func isDecided() async -> Bool
    func request() async -> Bool
}

/// Remembers that onboarding finished.
public protocol OnboardingStore: AnyObject, Sendable {
    var isDone: Bool { get set }
}

/// Walks the steps, skipping those the daemon's settings (or macOS) already satisfy.
///
/// Not every step can be checked: there is no daemon call that says whether `gh` is signed in
/// or which agent CLIs are installed, so the GitHub step only explains and the agent step offers
/// every agent Shep knows.
@MainActor
@Observable
public final class OnboardingViewModel {
    public private(set) var step = OnboardingStep.welcome
    public private(set) var settings: Settings?
    public private(set) var notificationsDecided = false
    public private(set) var firstTaskId: TaskId?
    public private(set) var firstReady: ShepTask?
    public private(set) var message: String?
    public private(set) var isComplete = false

    @ObservationIgnored private let client: any ShepClient
    @ObservationIgnored private let permissions: any NotificationPermissions
    @ObservationIgnored private let store: any OnboardingStore

    public init(client: any ShepClient, permissions: any NotificationPermissions, store: any OnboardingStore) {
        self.client = client
        self.permissions = permissions
        self.store = store
        isComplete = store.isDone
    }

    public var needsOnboarding: Bool { !store.isDone }

    public func load() async {
        do {
            settings = try await client.settingsGet()
        } catch {
            message = error.localizedDescription
        }
        notificationsDecided = await permissions.isDecided()
    }

    public func isSatisfied(_ step: OnboardingStep) -> Bool {
        switch step {
        case .agent: return settings?.agent != nil
        case .repositories: return settings?.repo != nil
        case .notifications: return notificationsDecided
        case .welcome, .github, .nightShift, .firstTask, .firstPullRequest: return false
        }
    }

    /// The next step that still needs the person.
    public func advance() async {
        var next = step.rawValue + 1
        while let candidate = OnboardingStep(rawValue: next), isSatisfied(candidate) {
            next += 1
        }
        if let candidate = OnboardingStep(rawValue: next) {
            step = candidate
        } else {
            finish()
        }
    }

    public func go(to step: OnboardingStep) {
        self.step = step
    }

    public func choose(agent: AgentKind) async {
        await save(SettingsChange(agent: agent))
    }

    public func choose(repository path: String) async {
        await save(SettingsChange(repo: path))
    }

    public func setNightShift(start: ClockTime, parallelism: Int) async {
        await save(SettingsChange(parallelism: parallelism, shiftStart: start))
    }

    public func allowNotifications() async {
        _ = await permissions.request()
        notificationsDecided = true
        await advance()
    }

    /// Queues the first task and starts it right away, so the first pull request comes today.
    public func startFirstTask(_ input: String) async {
        do {
            let task = try await client.add(input: input.trimmed)
            firstTaskId = task.id
            _ = try await client.start(when: .now)
            step = .firstPullRequest
        } catch {
            message = error.localizedDescription
        }
    }

    /// Watches for the first task's pull request.
    public func update(board: Board) {
        guard let id = firstTaskId else { return }
        firstReady = board.ready.first { $0.id == id }
    }

    public func finish() {
        store.isDone = true
        isComplete = true
    }

    private func save(_ change: SettingsChange) async {
        do {
            settings = try await client.settingsUpdate(change: change)
            message = nil
            await advance()
        } catch {
            message = error.localizedDescription
        }
    }
}
