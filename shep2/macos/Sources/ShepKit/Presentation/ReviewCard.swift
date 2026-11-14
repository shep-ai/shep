import Foundation

/// Where a task's CI stands, in the words the review card uses.
public enum CiStatus: Equatable, Sendable {
    case green
    case failed([String])
    case running
    case noCI
    case unknown

    /// The events that say how CI went, newest last.
    static let ciEvents: Set<EventKind> = [.ciGreen, .noCi, .ciFailed]

    public init(_ detail: TaskDetail) {
        let failed = detail.checks.filter { $0.state == .failed }.map(\.name)
        if !failed.isEmpty {
            self = .failed(failed)
        } else if detail.checks.contains(where: { $0.state == .pending }) {
            self = .running
        } else if !detail.checks.isEmpty {
            self = .green
        } else {
            switch detail.events.last(where: { Self.ciEvents.contains($0.kind) })?.kind {
            case .ciGreen?: self = .green
            case .noCi?: self = .noCI
            case .ciFailed?: self = .failed([])
            default: self = .unknown
            }
        }
    }

    public var label: String? {
        switch self {
        case .green: return "CI green"
        case let .failed(names): return names.isEmpty ? "CI failed" : "CI failed: \(names.joined(separator: ", "))"
        case .running: return "CI running"
        case .noCI: return "no CI"
        case .unknown: return nil
        }
    }
}

/// A proof file on this machine: test output or a screenshot.
public struct ProofItem: Equatable, Sendable, Identifiable {
    /// The image types the daemon treats as screenshots (`IMAGES` in `shep-app/src/brief.rs`).
    static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp"]

    public let path: String
    public var id: String { path }

    public init(path: String) {
        self.path = path
    }

    public var name: String { (path as NSString).lastPathComponent }
    public var isImage: Bool { Self.imageExtensions.contains((path as NSString).pathExtension.lowercased()) }
}

/// The review card for one task: the line above the title, the chips, the second opinion and
/// the proof (`design/screens/MacReview.png`).
public struct ReviewCard: Equatable, Sendable {
    static let draft = "draft"

    public let meta: String
    public let chips: [String]
    public let secondOpinion: String?
    public let proof: [ProofItem]

    public init(detail: TaskDetail, now: Date = Date()) {
        let task = detail.task
        let age = Ago.text(seconds: UnixTime(now.timeIntervalSince1970) - task.updatedAt)
        meta = [task.repository, task.reference, age, task.pr == nil ? nil : Self.draft]
            .compactMap { $0 }.joined(separator: " · ")
        var chips: [String] = []
        if let ci = CiStatus(detail).label { chips.append(ci) }
        let stat = detail.stat
        if stat.files > 0 {
            chips.append("+\(stat.added) -\(stat.removed) · \(stat.files) \(stat.files == 1 ? "file" : "files")")
        }
        let fixes = detail.events.filter { $0.kind == .ciFailed }.count
        if fixes > 0, task.state == .ready {
            chips.append("fixed \(fixes) CI \(fixes == 1 ? "failure" : "failures")")
        }
        self.chips = chips
        secondOpinion = detail.review?.trimmed.isEmpty == false ? detail.review : nil
        proof = detail.proof.map(ProofItem.init(path:))
    }
}

/// How long ago, short: `just now`, `5m ago`, `6h ago`, `2d ago`.
public enum Ago {
    static let minute: Int64 = 60
    static let hour: Int64 = 3_600
    static let day: Int64 = 86_400

    public static func text(seconds: Int64) -> String {
        if seconds < minute { return "just now" }
        if seconds < hour { return "\(seconds / minute)m ago" }
        if seconds < day { return "\(seconds / hour)h ago" }
        return "\(seconds / day)d ago"
    }
}
