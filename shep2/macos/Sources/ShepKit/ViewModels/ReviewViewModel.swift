import Foundation
import Observation

/// The single-key decisions of the review window.
public enum ReviewKey: Equatable, Sendable {
    case merge, sendBack, next, previous, togglePane, cancel

    /// M merge, S send back, J next, K previous, Space proof/diff. Escape and Return come from
    /// the view as keys, not characters.
    public init?(character: Character) {
        switch character.lowercased() {
        case "m": self = .merge
        case "s": self = .sendBack
        case "j": self = .next
        case "k": self = .previous
        case " ": self = .togglePane
        default: return nil
        }
    }
}

public enum ReviewPane: Equatable, Sendable {
    case proof, diff

    mutating func toggle() {
        self = self == .proof ? .diff : .proof
    }
}

/// The dawn screen's three numbers.
public struct DawnSummary: Equatable, Sendable {
    public let merged: Int
    public let sentBack: Int
    public let waiting: Int
}

/// The morning review: every task not merged yet, sorted by verdict (Ready, Needs you, Working,
/// Queued), one selected, decided with single keys. Decisions live in
/// `ReviewViewModel+Decisions.swift`.
@MainActor
@Observable
public final class ReviewViewModel {
    public internal(set) var board = Board.empty
    public internal(set) var queue: [ShepTask] = []
    public internal(set) var selectedId: TaskId?
    public internal(set) var detail: TaskDetail?
    public internal(set) var pane = ReviewPane.proof
    public internal(set) var isWritingNote = false
    public internal(set) var message: String?
    public internal(set) var isBusy = false
    /// Tasks sent back this session, for the dawn screen.
    public internal(set) var sentBack = 0
    public var note = ""
    public var answer = ""

    @ObservationIgnored let client: any ShepClient
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let calendar: Calendar

    public init(client: any ShepClient, now: @escaping () -> Date = Date.init, calendar: Calendar = .current) {
        self.client = client
        self.now = now
        self.calendar = calendar
    }

    public var selected: ShepTask? { queue.first { $0.id == selectedId } }
    public var selectedIndex: Int? { queue.firstIndex { $0.id == selectedId } }

    /// `1 of 6`.
    public var position: String {
        guard let index = selectedIndex else { return "" }
        return "\(index + 1) of \(queue.count)"
    }

    /// The selected task's detail, once it has arrived.
    public var selectedDetail: TaskDetail? {
        detail?.task.id == selectedId ? detail : nil
    }

    public var question: String? { selectedDetail?.task.question ?? selected?.question }
    public var diff: DiffDocument { DiffDocument(patch: selectedDetail?.diff ?? "") }
    public var mergedToday: Int { board.merged(since: LocalDay.start(of: now(), calendar: calendar)).count }
    public var waiting: Int { board.ready.count + board.needsYou.count }
    public func count(_ state: TaskState) -> Int { state == .merged ? mergedToday : board.tasks(state).count }

    /// Nothing left to decide and nothing running: queued work waits for tonight.
    public var isDawn: Bool { board.ready.isEmpty && board.needsYou.isEmpty && board.working.isEmpty }
    public var dawn: DawnSummary { DawnSummary(merged: mergedToday, sentBack: sentBack, waiting: waiting) }
    public var sky: SkyProgress { .morning(decided: mergedToday + sentBack, waiting: waiting) }

    /// Takes a new board, keeping the selected task when it is still there.
    public func update(board: Board) async {
        let previousIndex = selectedIndex ?? 0
        self.board = board
        queue = board.reviewQueue
        if let selectedId, queue.contains(where: { $0.id == selectedId }) {
            if selected?.updatedAt != selectedDetail?.task.updatedAt {
                await loadDetail()
            }
            return
        }
        await select(id: queue.isEmpty ? nil : queue[min(previousIndex, queue.count - 1)].id)
    }

    public func select(id: TaskId?) async {
        selectedId = id
        message = nil
        answer = ""
        await loadDetail()
    }

    public func handle(_ key: ReviewKey) async {
        if isWritingNote {
            if key == .cancel { cancelNote() }
            return
        }
        switch key {
        case .next: await move(by: 1)
        case .previous: await move(by: -1)
        case .togglePane: pane.toggle()
        case .merge: await merge()
        case .sendBack: beginNote()
        case .cancel: message = nil
        }
    }

    func loadDetail() async {
        guard let id = selectedId else {
            detail = nil
            return
        }
        do {
            let loaded = try await client.taskDetail(id: id)
            if selectedId == id { detail = loaded }
        } catch {
            message = error.localizedDescription
        }
    }

    private func move(by step: Int) async {
        guard !queue.isEmpty else { return }
        let index = min(max((selectedIndex ?? 0) + step, 0), queue.count - 1)
        if queue[index].id != selectedId {
            await select(id: queue[index].id)
        }
    }
}
