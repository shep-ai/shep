import ShepKit
import SwiftUI

/// A task waiting on a person: the agent's question, the answer box, and the diff so far
/// (`design/screens/MacNeedsYou.png`).
struct NeedsYouView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var review = app.review
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text(askedLine)
                    .font(Typeface.code(11))
                    .foregroundStyle(Palette.state(.needsYou))
                Text(review.question ?? "The agent is waiting for you.")
                    .font(Typeface.ui(17))
                HStack(spacing: 10) {
                    TextField("Your answer", text: $review.answer, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(1...4)
                        .onSubmit { Task { await review.submitAnswer() } }
                    Button {
                        Task { await review.submitAnswer() }
                    } label: {
                        Text("Answer and continue")
                            .font(Typeface.ui(14, .semibold))
                            .foregroundStyle(Palette.onLantern)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Palette.lantern))
                    }
                    .buttonStyle(.plain)
                    .disabled(!review.canAnswer)
                }
            }
            .padding(18)
            .background(RoundedRectangle(cornerRadius: 14).fill(Palette.state(.needsYou).opacity(0.08)))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.state(.needsYou).opacity(0.4), lineWidth: 1))

            DiffView(diff: review.diff)
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 14).fill(Palette.card))
        }
        .padding(24)
    }

    /// "THE AGENT ASKED AT 04:30".
    private var askedLine: String {
        let asked = app.review.selectedDetail?.events.last { $0.kind == .asked }
        guard let asked else { return "THE AGENT ASKED" }
        let time = ClockTime(date: Date(timeIntervalSince1970: TimeInterval(asked.at)))
        return "THE AGENT ASKED AT \(time.text)"
    }
}
