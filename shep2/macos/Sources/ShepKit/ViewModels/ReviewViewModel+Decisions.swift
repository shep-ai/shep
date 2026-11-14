import Foundation

/// Merge, send back with a note, answer: the three decisions a person makes. The daemon has
/// the last word; these checks only spare a round trip and say why a key did nothing.
extension ReviewViewModel {
    static let onlyReadyMerges = "Only a Ready task can be merged."
    static let onlyReadySendsBack = "Only a Ready task can be sent back."
    static let onlyNeedsYouAnswers = "Only a task that needs you takes an answer."

    public var canMerge: Bool { selected?.state == .ready && !isBusy }
    public var canAnswer: Bool { selected?.state == .needsYou && !answer.trimmed.isEmpty && !isBusy }

    /// M: merge the pull request. Shep never merges on its own; this is the person's press.
    public func merge() async {
        guard let task = selected else { return }
        guard task.state == .ready else {
            message = Self.onlyReadyMerges
            return
        }
        await decide(task, .merge)
    }

    /// S: open the note that goes back with the task.
    public func beginNote() {
        guard selected?.state == .ready else {
            message = Self.onlyReadySendsBack
            return
        }
        isWritingNote = true
    }

    public func cancelNote() {
        isWritingNote = false
        note = ""
    }

    public func submitNote() async {
        let text = note.trimmed
        guard let task = selected, !text.isEmpty else { return }
        if await decide(task, .sendBack(note: text)) {
            isWritingNote = false
            note = ""
            sentBack += 1
        }
    }

    /// Answers the agent's question; the task goes back to Working.
    public func submitAnswer() async {
        let text = answer.trimmed
        guard let task = selected, !text.isEmpty else { return }
        guard task.state == .needsYou else {
            message = Self.onlyNeedsYouAnswers
            return
        }
        if await decide(task, .answer(text: text)) {
            answer = ""
        }
    }

    /// Sends the decision, then reads the board and selects whatever took the task's place.
    @discardableResult
    func decide(_ task: ShepTask, _ action: ReviewAction) async -> Bool {
        let index = selectedIndex ?? 0
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await client.review(id: task.id, action: action)
            let fresh = try await client.board()
            board = fresh
            queue = fresh.reviewQueue
            await select(id: queue.isEmpty ? nil : queue[min(index, queue.count - 1)].id)
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }
}
