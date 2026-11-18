import ShepKit
import SwiftUI

/// Tonight's work (`design/screens/MacAddTask.png`). The design's "Open issues" list needs a
/// call that lists a repository's issues, which the daemon does not have yet; until then a task
/// is typed or pasted (an issue reference, a link, a sentence) or queued by label.
struct AddTasksView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var add = app.addTasks
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Tonight's work").font(Typeface.display(34))
                Spacer()
                Text("⌘N").font(Typeface.code(12)).foregroundStyle(Palette.secondary)
            }
            Picker("", selection: $add.mode) {
                Text("Issues, links or tasks").tag(AddTaskViewModel.Mode.tasks)
                Text("By label").tag(AddTaskViewModel.Mode.label)
            }
            .pickerStyle(.segmented)
            .frame(width: 320)

            switch add.mode {
            case .tasks:
                TextEditor(text: $add.input)
                    .font(Typeface.code(13))
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .frame(height: 120)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Palette.midnight))
                Text("One per line: #412, owner/repo#412, a Linear, Jira, Notion or Slack link, or a sentence.")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
                ForEach(add.entries) { entry in
                    HStack {
                        Text(entry.text).font(Typeface.ui(14)).lineLimit(1)
                        Spacer()
                        Text(kindLabel(entry.kind)).font(Typeface.ui(12)).foregroundStyle(Palette.lantern)
                    }
                }
            case .label:
                TextField("Label", text: $add.label)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 240)
                Text("Queues every open issue labelled “\(add.label)” that is not on the board yet.")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
            }

            HStack(spacing: 12) {
                Text("Start").font(Typeface.ui(13))
                Picker("", selection: $add.when) {
                    Text("Tonight · \(add.shiftStart.text)").tag(AddTaskViewModel.When.tonight)
                    Text("Now").tag(AddTaskViewModel.When.now)
                }
                .pickerStyle(.segmented)
                .frame(width: 220)
                if let plan = add.plan {
                    Text(plan).font(Typeface.ui(12)).foregroundStyle(Palette.secondary)
                }
            }
            if let message = add.message {
                Text(message).font(Typeface.ui(13))
            }
            HStack {
                Label("Shep only opens draft pull requests. You press Merge.", systemImage: "info.circle")
                    .font(Typeface.ui(12))
                    .foregroundStyle(Palette.secondary)
                Spacer()
                Button("Close") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(add.mode == .tasks ? "Add \(add.entries.count) to tonight" : "Add by label") {
                    Task { await add.submit() }
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .tint(Palette.lantern)
                .disabled(!add.canSubmit)
            }
        }
        .padding(28)
        .frame(width: 660)
        .background(Palette.night)
        .task { await add.load() }
    }

    private func kindLabel(_ kind: AddInputKind) -> String {
        switch kind {
        case .issue: return "issue"
        case .link: return "link"
        case .sentence: return "task"
        }
    }
}
