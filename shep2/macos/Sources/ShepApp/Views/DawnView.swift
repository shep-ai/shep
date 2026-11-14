import ShepKit
import SwiftUI

/// The queue is clear (`design/screens/MacDawn.png`): the sky at full dawn, the morning in three
/// numbers, and the way to tonight.
struct DawnView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let dawn = app.review.dawn
        ZStack(alignment: .bottomLeading) {
            SkyBackground(progress: app.review.sky)
            LinearGradient(colors: [.clear, Palette.midnight], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 12) {
                Text("Dawn.").font(Typeface.display(96))
                Text("The pen is full. Nothing left to review.").font(Typeface.ui(19))
                HStack(alignment: .lastTextBaseline, spacing: 24) {
                    stat(dawn.merged, "merged")
                    stat(dawn.sentBack, "sent back")
                    stat(dawn.waiting, "waiting")
                    Spacer()
                    Button("Queue tonight's work") { app.showAddTasks() }
                        .buttonStyle(.borderedProminent)
                        .tint(Palette.lantern)
                        .foregroundStyle(Palette.onLantern)
                    ShareLink("Share the morning", item: dawn.shareText)
                }
            }
            .padding(56)
        }
        .clipped()
    }

    private func stat(_ value: Int, _ label: String) -> some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            Text("\(value)").font(Typeface.display(34))
            Text(label).font(Typeface.ui(14)).foregroundStyle(Palette.secondary)
        }
    }
}
