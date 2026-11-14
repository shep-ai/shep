import Foundation
import Observation

/// What a line of input will be added as. The daemon parses it for real; this is the preview.
public enum AddInputKind: Equatable, Sendable {
    case issue, link, sentence

    static let linkSchemes = ["https://", "http://"]

    public init(classifying text: String) {
        let text = text.trimmed
        if Self.linkSchemes.contains(where: { text.lowercased().hasPrefix($0) }) {
            self = .link
        } else if Self.isIssueReference(text) {
            self = .issue
        } else {
            self = .sentence
        }
    }

    /// `#412` or `owner/repo#412`.
    private static func isIssueReference(_ text: String) -> Bool {
        let parts = text.split(separator: "#", omittingEmptySubsequences: false)
        guard parts.count == 2, let number = parts.last, !number.isEmpty, number.allSatisfy(\.isNumber) else {
            return false
        }
        let repo = parts[0]
        return repo.isEmpty || (repo.split(separator: "/").count == 2 && !repo.contains(" "))
    }
}

/// Tonight's work: one task per line (issue, link or sentence), or every open issue with a label.
@MainActor
@Observable
public final class AddTaskViewModel {
    public enum Mode: Equatable, Sendable, CaseIterable { case tasks, label }
    public enum When: Equatable, Sendable, CaseIterable { case tonight, now }

    public struct Entry: Equatable, Sendable, Identifiable {
        public let id: Int
        public let text: String
        public let kind: AddInputKind
    }

    public static let defaultLabel = "shep"

    public var mode = Mode.tasks
    public var input = ""
    public var label = AddTaskViewModel.defaultLabel
    public var when = When.tonight
    public private(set) var settings: Settings?
    public private(set) var queued = 0
    public private(set) var message: String?
    public private(set) var isBusy = false

    @ObservationIgnored private let client: any ShepClient

    public init(client: any ShepClient) {
        self.client = client
    }

    public func load() async {
        settings = try? await client.settingsGet()
        if let board = try? await client.board() { update(board: board) }
    }

    public func update(board: Board) {
        queued = board.queued.count
    }

    public var entries: [Entry] {
        input.split(separator: "\n").map { String($0).trimmed }.filter { !$0.isEmpty }.enumerated()
            .map { Entry(id: $0.offset, text: $0.element, kind: AddInputKind(classifying: $0.element)) }
    }

    public var canSubmit: Bool {
        !isBusy && (mode == .tasks ? !entries.isEmpty : !label.trimmed.isEmpty)
    }

    public var shiftStart: ClockTime { settings?.shiftStart ?? ShepLimits.defaultShiftStart }
    public var parallelism: Int { settings?.parallelism ?? ShepLimits.defaultParallelism }

    /// `3 to add · with 2 already queued, about 2 rounds of 3 in parallel`.
    public var plan: String? {
        let adding = entries.count
        guard mode == .tasks, adding > 0 else { return nil }
        let rounds = (adding + queued + parallelism - 1) / max(parallelism, 1)
        let already = queued > 0 ? "with \(queued) already queued, " : ""
        let roundWord = rounds == 1 ? "round" : "rounds"
        return "\(adding) to add · \(already)about \(rounds) \(roundWord) of \(parallelism) in parallel"
    }

    public func submit() async {
        guard canSubmit else { return }
        isBusy = true
        defer { isBusy = false }
        message = nil
        let added: Int
        switch mode {
        case .tasks:
            guard let count = await addLines() else { return }
            added = count
        case .label:
            do {
                added = try await client.addLabel(label: label.trimmed).count
            } catch {
                message = error.localizedDescription
                return
            }
        }
        await startQueue(added: added)
    }

    /// Adds each line; lines the daemon refuses stay in the input. Nil when nothing was added.
    private func addLines() async -> Int? {
        var failed: [String] = []
        var added = 0
        for entry in entries {
            do {
                _ = try await client.add(input: entry.text)
                added += 1
            } catch {
                if failed.isEmpty { message = "\(entry.text): \(error.localizedDescription)" }
                failed.append(entry.text)
            }
        }
        input = failed.joined(separator: "\n")
        return added > 0 ? added : nil
    }

    private func startQueue(added: Int) async {
        let problem = message
        do {
            switch when {
            case .tonight:
                _ = try await client.start(when: .at(shiftStart))
                message = "Added \(added) · tonight at \(shiftStart.text)"
            case .now:
                let outcome = try await client.start(when: .now)
                let started: Int
                if case let .started(tasks) = outcome { started = tasks.count } else { started = 0 }
                message = "Added \(added) · \(started) started now"
            }
        } catch {
            message = "Added \(added), but starting failed: \(error.localizedDescription)"
        }
        if let problem { message = [message, problem].compactMap { $0 }.joined(separator: " · ") }
    }
}
