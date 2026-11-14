import AppKit
import ShepKit
import UserNotifications

/// Posts Shep's notifications (the morning brief, a task that needs you) and answers their
/// buttons. macOS only delivers notifications to an app bundle: under `swift run` the process
/// has no bundle identifier, so the notifier stays quiet. `scripts/make-app.sh` builds the bundle.
final class Notifier: NSObject, NotificationPermissions, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let taskIdKey = "taskId"
    static let morningId = "shep.morning"
    static let needsYouPrefix = "shep.needs-you."
    static let answerButton = "Send"
    static let answerPlaceholder = "Your answer"

    /// What a button press does; set by the app model.
    var onAction: (@MainActor (NotificationAction.Kind, TaskId?, String?) async -> Void)?
    private var morningActions: [NotificationAction] = []

    private var center: UNUserNotificationCenter? {
        Bundle.main.bundleIdentifier == nil ? nil : UNUserNotificationCenter.current()
    }

    func activate() {
        guard let center else { return }
        center.delegate = self
        registerCategories()
    }

    // MARK: NotificationPermissions

    func isDecided() async -> Bool {
        guard let center else { return true }
        return await center.notificationSettings().authorizationStatus != .notDetermined
    }

    func request() async -> Bool {
        guard let center else { return false }
        return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    // MARK: Posting

    func post(_ morning: MorningNotification) {
        morningActions = morning.actions
        registerCategories()
        post(id: Self.morningId, title: morning.title, body: morning.body, category: MorningNotification.category, taskId: nil)
    }

    func post(_ note: NeedsYouNotification) {
        post(
            id: Self.needsYouPrefix + String(note.taskId), title: note.title, body: note.body,
            category: NeedsYouNotification.category, taskId: note.taskId
        )
    }

    private func post(id: String, title: String, body: String, category: String, taskId: TaskId?) {
        guard let center else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = category
        if let taskId {
            content.userInfo = [Self.taskIdKey: NSNumber(value: taskId)]
        }
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    /// Button titles carry numbers ("Merge 5 green"), so the categories are registered again
    /// before each morning notification.
    private func registerCategories() {
        guard let center else { return }
        let morning = UNNotificationCategory(
            identifier: MorningNotification.category,
            actions: morningActions.map { UNNotificationAction(identifier: $0.kind.rawValue, title: $0.title, options: [.foreground]) },
            intentIdentifiers: [],
            options: []
        )
        let answer = UNTextInputNotificationAction(
            identifier: NotificationAction.Kind.answer.rawValue, title: "Answer…", options: [],
            textInputButtonTitle: Self.answerButton, textInputPlaceholder: Self.answerPlaceholder
        )
        let open = UNNotificationAction(identifier: NotificationAction.Kind.open.rawValue, title: "Open", options: [.foreground])
        let needsYou = UNNotificationCategory(
            identifier: NeedsYouNotification.category, actions: [answer, open], intentIdentifiers: [], options: []
        )
        center.setNotificationCategories([morning, needsYou])
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let taskId = (info[Self.taskIdKey] as? NSNumber)?.int64Value
        let text = (response as? UNTextInputNotificationResponse)?.userText
        let kind = NotificationAction.Kind(rawValue: response.actionIdentifier)
            ?? (response.actionIdentifier == UNNotificationDefaultActionIdentifier ? .open : nil)
        guard let kind, let onAction else { return }
        await onAction(kind, taskId, text)
    }
}
