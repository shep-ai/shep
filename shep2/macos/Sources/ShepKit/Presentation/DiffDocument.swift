import Foundation

/// A unified diff (`TaskDetail.diff`) split into files and lines for the diff view.
public struct DiffDocument: Equatable, Sendable {
    public enum LineKind: Equatable, Sendable {
        case hunk, context, added, removed
    }

    public struct Line: Equatable, Sendable {
        public let kind: LineKind
        public let text: String
    }

    public struct File: Equatable, Sendable, Identifiable {
        public var path: String
        public var lines: [Line] = []
        public var id: String { path }
        public var added: Int { lines.filter { $0.kind == .added }.count }
        public var removed: Int { lines.filter { $0.kind == .removed }.count }
    }

    private enum Marker {
        static let file = "diff --git "
        static let oldPath = "--- "
        static let newPath = "+++ "
        static let hunk = "@@"
        static let newSide = "b/"
        static let oldSide = "a/"
        static let noFile = "/dev/null"
        static let noNewline = "\\"
    }

    public let files: [File]

    public init(patch: String) {
        var files: [File] = []
        var inHeader = false
        var lines = patch.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        if lines.last == "" {
            lines.removeLast()
        }
        for line in lines {
            if line.hasPrefix(Marker.file) {
                files.append(File(path: Self.pathFromGitHeader(line)))
                inHeader = true
            } else if line.hasPrefix(Marker.oldPath), inHeader || files.isEmpty {
                if files.isEmpty { files.append(File(path: "")) }
                let old = Self.strip(String(line.dropFirst(Marker.oldPath.count)), side: Marker.oldSide)
                if files[files.count - 1].path.isEmpty, old != Marker.noFile { files[files.count - 1].path = old }
            } else if line.hasPrefix(Marker.newPath), inHeader {
                let new = Self.strip(String(line.dropFirst(Marker.newPath.count)), side: Marker.newSide)
                if new != Marker.noFile { files[files.count - 1].path = new }
            } else if line.hasPrefix(Marker.hunk), !files.isEmpty {
                inHeader = false
                files[files.count - 1].lines.append(Line(kind: .hunk, text: line))
            } else if !inHeader, !files.isEmpty, let parsed = Self.body(line) {
                files[files.count - 1].lines.append(parsed)
            }
        }
        self.files = files.filter { !$0.path.isEmpty || !$0.lines.isEmpty }
    }

    /// `3 files · +41 -12`.
    public var summary: String {
        guard !files.isEmpty else { return "No changes yet" }
        let added = files.map(\.added).reduce(0, +)
        let removed = files.map(\.removed).reduce(0, +)
        let noun = files.count == 1 ? "file" : "files"
        return "\(files.count) \(noun) · +\(added) -\(removed)"
    }

    private static func body(_ line: String) -> Line? {
        guard let first = line.first else { return Line(kind: .context, text: "") }
        let rest = String(line.dropFirst())
        switch first {
        case "+": return Line(kind: .added, text: rest)
        case "-": return Line(kind: .removed, text: rest)
        case " ": return Line(kind: .context, text: rest)
        default: return line.hasPrefix(Marker.noNewline) ? nil : Line(kind: .context, text: line)
        }
    }

    /// `diff --git a/x b/y` -> `y`.
    private static func pathFromGitHeader(_ line: String) -> String {
        let rest = String(line.dropFirst(Marker.file.count))
        if let range = rest.range(of: " " + Marker.newSide, options: .backwards) {
            return String(rest[range.upperBound...])
        }
        return rest
    }

    private static func strip(_ path: String, side: String) -> String {
        path.hasPrefix(side) ? String(path.dropFirst(side.count)) : path
    }
}
