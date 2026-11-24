import AppIntents
import ShepKit

// Spotlight, Siri and Shortcuts actions (`design/screens/MacSystem.png`). Each one talks to the
// daemon through ShepKit's `ShepIntents`.
//
// The system lists App Intents from metadata that Xcode's build extracts
// (`appintentsmetadataprocessor`). A plain `swift build` compiles these types but does not
// extract that metadata, so they appear in Shortcuts only once the app is built with Xcode.

struct QueueIssueIntent: AppIntent {
    static let title: LocalizedStringResource = "Queue issue"

    @Parameter(title: "Issue, link or task")
    var input: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = try await ShepIntents(client: DaemonClient()).queue(input)
        return .result(dialog: "\(reply)")
    }
}

struct ShowReadyPullRequestsIntent: AppIntent {
    static let title: LocalizedStringResource = "Show ready pull requests"

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = try await ShepIntents(client: DaemonClient()).readyPullRequests()
        return .result(dialog: "\(reply)")
    }
}

struct MergeAllGreenIntent: AppIntent {
    static let title: LocalizedStringResource = "Merge all green"

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await ShepIntents(client: DaemonClient()).mergeAllGreen()
        return .result(dialog: "\(reply)")
    }
}

struct ShepShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: QueueIssueIntent(),
            phrases: ["Queue an issue in \(.applicationName)", "Hand \(.applicationName) a task"],
            shortTitle: "Queue issue",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: ShowReadyPullRequestsIntent(),
            phrases: ["Show ready pull requests in \(.applicationName)", "What is ready in \(.applicationName)"],
            shortTitle: "Ready pull requests",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: MergeAllGreenIntent(),
            phrases: ["Merge all green in \(.applicationName)"],
            shortTitle: "Merge all green",
            systemImageName: "arrow.triangle.merge"
        )
    }
}
