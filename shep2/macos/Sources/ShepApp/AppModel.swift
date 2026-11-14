import AppKit
import Observation
import ShepKit

/// Everything the windows, the menu bar and notifications share: one daemon client, the board
/// as it is pushed, and the view models. It only wires them together; the logic is in ShepKit.
@MainActor
@Observable
final class AppModel {
    let client: DaemonClient
    let store: BoardStore
    let review: ReviewViewModel
    let addTasks: AddTaskViewModel
    let settings: SettingsViewModel
    let onboarding: OnboardingViewModel
    let notifier: Notifier
    var showingAddTasks = false
    /// A sentence after "Merge all green", shown in the menu bar and the review window.
    var lastReport: String?

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        let client = DaemonClient(environment: environment)
        let notifier = Notifier()
        self.client = client
        self.notifier = notifier
        store = BoardStore(client: client)
        review = ReviewViewModel(client: client)
        addTasks = AddTaskViewModel(client: client)
        settings = SettingsViewModel(client: client)
        onboarding = OnboardingViewModel(client: client, permissions: notifier, store: OnboardingDefaults())
        store.onChange = { [weak self] old, new in self?.boardChanged(from: old, to: new) }
        notifier.onAction = { [weak self] action, taskId, text in
            await self?.perform(action, taskId: taskId, text: text)
        }
    }

    /// Runs for the life of the app.
    func start() async {
        await settings.load()
        await addTasks.load()
        await onboarding.load()
        await store.follow()
    }

    var summary: NightSummary { store.summary() }

    func showAddTasks() {
        showingAddTasks = true
        NSApp.activate(ignoringOtherApps: true)
    }

    func mergeAllGreen() async {
        lastReport = await GreenMerge(client: client).run().summary
    }

    func open(_ url: String) {
        if let url = URL(string: url) { NSWorkspace.shared.open(url) }
    }

    private func boardChanged(from old: Board?, to new: Board) {
        addTasks.update(board: new)
        onboarding.update(board: new)
        Task { await review.update(board: new) }
        for note in NeedsYouNotification.new(from: old, to: new) {
            notifier.post(note)
        }
        if MorningNotification.shiftEnded(from: old, to: new) {
            Task { await checkMorning() }
        }
    }

    private func checkMorning() async {
        if let morning = try? await MorningNotification.check(client) {
            notifier.post(morning)
        }
    }

    private func perform(_ action: NotificationAction.Kind, taskId: TaskId?, text: String?) async {
        switch action {
        case .mergeGreen:
            await mergeAllGreen()
        case .answer:
            if let taskId, let text, !text.isEmpty {
                _ = try? await client.review(id: taskId, action: .answer(text: text))
            }
        case .review, .open:
            NSApp.activate(ignoringOtherApps: true)
            if let taskId { await review.select(id: taskId) }
        }
    }
}

/// Onboarding is remembered per user in the app's defaults.
final class OnboardingDefaults: OnboardingStore, @unchecked Sendable {
    static let key = "shep.onboarding.done"

    var isDone: Bool {
        get { UserDefaults.standard.bool(forKey: Self.key) }
        set { UserDefaults.standard.set(newValue, forKey: Self.key) }
    }
}
