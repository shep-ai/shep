import Foundation

/// What the App Intents (Spotlight, Siri, Shortcuts) do, as sentences to say back.
public struct ShepIntents: Sendable {
    static let nothingReady = "Nothing is ready yet."

    let client: any ShepClient

    public init(client: any ShepClient) {
        self.client = client
    }

    /// "Queue issue": `#412`, `owner/repo#412`, a link or a sentence.
    public func queue(_ input: String) async throws -> String {
        let task = try await client.add(input: input.trimmed)
        return "Queued “\(task.reference ?? task.title)” for tonight."
    }

    /// "Show ready pull requests".
    public func readyPullRequests() async throws -> String {
        let ready = try await client.board().ready
        guard !ready.isEmpty else { return Self.nothingReady }
        let items = ready.map { task in task.row + (task.pr.map { " (PR #\($0.number))" } ?? "") }
        return "\(ready.count) ready: \(items.joined(separator: ", "))."
    }

    /// "Merge all green".
    public func mergeAllGreen() async -> String {
        await GreenMerge(client: client).run().summary
    }
}
