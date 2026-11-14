import AppKit
import ShepKit
import SwiftUI

/// The settings the daemon has (`design/screens/MacSettings.png`): shift start, tasks in
/// parallel, the agent and the repository. The design's other rows (stop time, usage-limit
/// behaviour, CI fix attempts, brief time, keep awake) are not daemon settings yet.
struct SettingsView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var settings = app.settings
        Form {
            Section("Night shift") {
                DatePicker(
                    "Start at",
                    selection: Binding(get: { settings.shiftStart.date() }, set: { settings.shiftStart = ClockTime(date: $0) }),
                    displayedComponents: .hourAndMinute
                )
                Stepper("Tasks in parallel: \(settings.parallelism)", value: $settings.parallelism, in: ShepLimits.parallelism)
                Text("More finishes sooner but uses your agent's limit faster.")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
            }
            Section("Agent") {
                Picker("Agent", selection: $settings.agent) {
                    Text("Not chosen").tag(AgentKind?.none)
                    ForEach(AgentKind.allCases, id: \.self) { agent in
                        Text(agent.displayName).tag(AgentKind?.some(agent))
                    }
                }
                Text("Uses the CLI already on your Mac with your login. Shep never stores keys.")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
            }
            Section("Repository") {
                HStack {
                    TextField("Local checkout", text: $settings.repo)
                    Button("Choose…") {
                        if let path = FolderPicker.choose() { settings.repo = path }
                    }
                }
                Text("Each task works in its own worktree. Your checkout is never touched.")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
            }
            Section {
                Label("Pull requests are always drafts. Shep never merges on its own, at any setting.", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Palette.lantern)
            }
            HStack {
                Text(settings.problem ?? settings.message ?? "")
                    .foregroundStyle(settings.problem == nil ? Palette.secondary : Palette.state(.needsYou))
                Spacer()
                Button("Save") {
                    Task {
                        await settings.save()
                        await app.store.refreshSettings()
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(!settings.hasChanges || settings.problem != nil)
            }
        }
        .formStyle(.grouped)
        .frame(width: 560)
        .task { await settings.load() }
    }
}

enum FolderPicker {
    /// Asks for a folder; nil when cancelled.
    @MainActor
    static func choose() -> String? {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        return panel.runModal() == .OK ? panel.url?.path : nil
    }
}
