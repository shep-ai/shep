import AppKit
import ShepKit
import SwiftUI

/// The menu bar extra: the night at a glance on Macs without a Dynamic Island
/// (`design/screens/MacSystem.png`). It is the app's progress surface; see README for why
/// there is no Live Activity.
struct MenuBarView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        let summary = app.summary
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(summary.title).font(Typeface.ui(14, .semibold))
                Spacer()
                if let settings = app.store.settings {
                    Text("shift \(settings.shiftStart.text)").font(Typeface.code(11)).foregroundStyle(Palette.secondary)
                }
            }
            ProgressView(value: summary.sky.fraction)
                .tint(Palette.lantern)
            ForEach(summary.rows) { row in
                HStack(spacing: 8) {
                    StateGlyph(state: row.state)
                    Text(row.text).font(Typeface.ui(13)).lineLimit(1)
                }
            }
            if case let .offline(reason) = app.store.status {
                Text(reason).font(Typeface.ui(12)).foregroundStyle(Palette.state(.needsYou))
            }
            if let report = app.lastReport {
                Text(report).font(Typeface.ui(12)).foregroundStyle(Palette.secondary)
            }
            Divider()
            menuButton("Open review window") { showReview() }
            menuButton("Add a task…") {
                showReview()
                app.showAddTasks()
            }
            if !app.store.board.ready.isEmpty {
                menuButton("Merge all green") { Task { await app.mergeAllGreen() } }
            }
            Divider()
            menuButton("Quit Shep") { NSApp.terminate(nil) }
        }
        .padding(16)
        .frame(width: 340)
        .foregroundStyle(Palette.text)
        .background(Palette.night)
    }

    private func showReview() {
        openWindow(id: WindowID.review)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func menuButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(Typeface.ui(13)).frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}

/// ✓ ready, ! needs you, ● working, · queued.
struct StateGlyph: View {
    let state: TaskState

    var body: some View {
        Group {
            switch state {
            case .ready, .merged: Image(systemName: "checkmark")
            case .needsYou: Text("!").font(Typeface.ui(13, .bold))
            case .working: Circle().frame(width: 8, height: 8)
            case .queued, .unknown: Text("·")
            }
        }
        .foregroundStyle(Palette.state(state))
        .frame(width: 14)
    }
}
