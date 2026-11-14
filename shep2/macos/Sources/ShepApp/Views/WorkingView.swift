import AppKit
import ShepKit
import SwiftUI

/// A task while its agent works (`design/screens/MacWorking.png`): the agent's screen live, the
/// diff and proof so far, checks and the night's events, and a note box that types into the
/// agent. The design's plan checklist and Stop button have no daemon call yet, so they are not
/// here.
struct WorkingView: View {
    enum Tab: String, CaseIterable {
        case session = "Session"
        case diff = "Diff"
        case proof = "Proof"
    }

    @State private var model: WorkingViewModel
    @State private var tab = Tab.session

    /// Explicit: a private `@State` would make the memberwise initializer private.
    init(model: WorkingViewModel) {
        _model = State(initialValue: model)
    }

    var body: some View {
        @Bindable var working = model
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Text(working.title).font(Typeface.ui(16, .semibold)).lineLimit(1)
                    Chip(text: "Working" + (working.elapsed.map { " · \($0)" } ?? ""), color: Palette.state(.working))
                    if working.isLive {
                        Chip(text: "live", color: Palette.state(.ready))
                    }
                    Spacer()
                    Picker("", selection: $tab) {
                        ForEach(Tab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                }
                Text(working.activity).font(Typeface.ui(14)).foregroundStyle(Palette.secondary)
                Group {
                    switch tab {
                    case .session:
                        ScrollView {
                            Text(working.screen.isEmpty ? "No agent screen right now." : working.screen)
                                .font(Typeface.code(12))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .defaultScrollAnchor(.bottom)
                    case .diff:
                        DiffView(diff: working.diff)
                    case .proof:
                        ProofPane(proof: working.proof)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Palette.card))
                HStack {
                    TextField("Add a note for the agent, it reads it at the next step", text: $working.note)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await working.sendNote() } }
                    Button("Send note") { Task { await working.sendNote() } }
                        .disabled(!working.isLive || working.isSending)
                }
                if let message = working.message {
                    Text(message).font(Typeface.ui(12)).foregroundStyle(Palette.state(.needsYou))
                }
            }
            .padding(20)
            Divider().overlay(Palette.line)
            WorkingSidebar(model: working)
                .frame(width: 280)
        }
        .task { await model.start() }
    }
}

private struct WorkingSidebar: View {
    let model: WorkingViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                heading("CHECKS")
                if model.checks.isEmpty {
                    Text("CI runs after the push").foregroundStyle(Palette.secondary)
                }
                ForEach(model.checks, id: \.name) { check in
                    HStack {
                        Text(check.name)
                        Spacer()
                        Text(check.state.rawValue.lowercased()).foregroundStyle(Palette.secondary)
                    }
                }
                heading("TONIGHT")
                ForEach(Array(model.events.enumerated()), id: \.offset) { _, event in
                    HStack(alignment: .top) {
                        Text(ClockTime(date: Date(timeIntervalSince1970: TimeInterval(event.at))).text)
                            .font(Typeface.code(11))
                            .foregroundStyle(Palette.secondary)
                        Text(event.detail)
                    }
                }
                if let pr = model.detail?.task.pr {
                    Button("Open draft PR #\(pr.number)") {
                        if let url = URL(string: pr.url) { NSWorkspace.shared.open(url) }
                    }
                    .padding(.top, 8)
                }
            }
            .font(Typeface.ui(13))
            .padding(16)
        }
        .background(Palette.night)
    }

    private func heading(_ text: String) -> some View {
        Text(text).font(Typeface.code(11)).foregroundStyle(Palette.secondary).padding(.top, 8)
    }
}
