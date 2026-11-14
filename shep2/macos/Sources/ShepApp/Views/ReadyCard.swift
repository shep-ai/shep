import AppKit
import ShepKit
import SwiftUI

/// A Ready task: proof or diff on top (Space switches), then what changed, the chips, the
/// second opinion and the decisions (`design/screens/MacReview.png`).
struct ReadyCard: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let review = app.review
        ScrollView {
            if let task = review.selected {
                VStack(alignment: .leading, spacing: 0) {
                    paneHeader
                    Group {
                        switch review.pane {
                        case .proof: ProofPane(proof: card?.proof ?? [])
                        case .diff: DiffView(diff: review.diff).frame(minHeight: 320)
                        }
                    }
                    .padding(16)
                    Divider().overlay(Palette.line)
                    VStack(alignment: .leading, spacing: 14) {
                        Text(card?.meta ?? task.reference ?? "").font(Typeface.code(12)).foregroundStyle(Palette.secondary)
                        Text(task.title).font(Typeface.ui(24, .semibold))
                        HStack(spacing: 8) {
                            ForEach(card?.chips ?? [], id: \.self) { Chip(text: $0) }
                        }
                        if let opinion = card?.secondOpinion {
                            (Text("Second opinion: ").foregroundStyle(Palette.lantern).bold() + Text(opinion))
                                .font(Typeface.ui(15))
                        }
                        if review.isWritingNote {
                            noteBox(review)
                        } else {
                            decisions(task)
                        }
                    }
                    .padding(20)
                }
                .background(RoundedRectangle(cornerRadius: 14).fill(Palette.card))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.line, lineWidth: 1))
                .padding(24)
            }
        }
    }

    private var card: ReviewCard? {
        app.review.selectedDetail.map { ReviewCard(detail: $0) }
    }

    private var paneHeader: some View {
        HStack {
            Text(app.review.pane == .proof ? "PROOF" : "DIFF · \(app.review.diff.summary)")
            Spacer()
            Text("SPACE")
        }
        .font(Typeface.code(11))
        .foregroundStyle(Palette.secondary)
        .padding([.horizontal, .top], 16)
    }

    private func decisions(_ task: ShepTask) -> some View {
        HStack(spacing: 12) {
            KeyButton(title: "Merge", key: "M", prominent: true) { Task { await app.review.merge() } }
                .disabled(!app.review.canMerge)
            KeyButton(title: "Send back", key: "S") { app.review.beginNote() }
            Button("Skip  J") { Task { await app.review.handle(.next) } }
                .buttonStyle(.plain)
                .foregroundStyle(Palette.secondary)
            Spacer()
            if let pr = task.pr {
                Button("Open PR #\(pr.number) ↩") { app.open(pr.url) }
                    .buttonStyle(.plain)
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
            }
        }
    }

    private func noteBox(_ model: ReviewViewModel) -> some View {
        @Bindable var review = model
        return VStack(alignment: .leading, spacing: 8) {
            TextField("What should change? The agent reads this on the same pull request.", text: $review.note, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...5)
                .onSubmit { Task { await review.submitNote() } }
            HStack {
                Button("Send back") { Task { await review.submitNote() } }
                    .keyboardShortcut(.return, modifiers: .command)
                Button("Cancel") { review.cancelNote() }
                    .keyboardShortcut(.cancelAction)
            }
        }
    }
}

/// Proof on this machine: the first screenshot large, then every file.
struct ProofPane: View {
    static let previewLines = 30
    let proof: [ProofItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let shot = proof.first(where: \.isImage), let image = NSImage(contentsOfFile: shot.path) {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if let text = proof.first(where: { !$0.isImage }) {
                Text(preview(text.path))
                    .font(Typeface.code(12))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("No proof files yet.").foregroundStyle(Palette.secondary)
            }
            HStack(spacing: 8) {
                ForEach(proof) { item in
                    Button(item.name) { NSWorkspace.shared.open(URL(fileURLWithPath: item.path)) }
                        .buttonStyle(.link)
                }
            }
            .font(Typeface.code(11))
        }
    }

    private func preview(_ path: String) -> String {
        let text = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
        return text.split(separator: "\n", omittingEmptySubsequences: false).prefix(Self.previewLines).joined(separator: "\n")
    }
}

/// The changed files on the left, the selected file's lines on the right.
struct DiffView: View {
    let diff: DiffDocument
    @State private var selectedPath: String?

    init(diff: DiffDocument) {
        self.diff = diff
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(diff.summary.uppercased()).font(Typeface.code(11)).foregroundStyle(Palette.secondary)
                ForEach(diff.files) { file in
                    Button {
                        selectedPath = file.path
                    } label: {
                        HStack {
                            Text(file.path).lineLimit(1).truncationMode(.head)
                            Spacer()
                            Text(file.added >= file.removed ? "+\(file.added)" : "-\(file.removed)")
                                .foregroundStyle(Palette.state(file.added >= file.removed ? .ready : .needsYou))
                        }
                        .font(Typeface.code(12))
                        .padding(6)
                        .background(RoundedRectangle(cornerRadius: 6).fill(file.path == current?.path ? Palette.dusk : .clear))
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(width: 230)
            ScrollView([.vertical, .horizontal]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array((current?.lines ?? []).enumerated()), id: \.offset) { _, line in
                        DiffLineView(line: line)
                    }
                }
            }
        }
    }

    private var current: DiffDocument.File? {
        diff.files.first { $0.path == selectedPath } ?? diff.files.first
    }
}

struct DiffLineView: View {
    let line: DiffDocument.Line

    var body: some View {
        let (sign, color, fill): (String, Color, Color) = {
            switch line.kind {
            case .added: return ("+ ", Palette.state(.ready), Palette.state(.ready).opacity(0.08))
            case .removed: return ("- ", Palette.state(.needsYou), Palette.state(.needsYou).opacity(0.08))
            case .hunk: return ("", Palette.secondary, .clear)
            case .context: return ("  ", Palette.text, .clear)
            }
        }()
        Text(sign + line.text)
            .font(Typeface.code(12))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .background(fill)
    }
}
