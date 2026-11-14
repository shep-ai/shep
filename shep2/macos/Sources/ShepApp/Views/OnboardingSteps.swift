import ShepKit
import SwiftUI

struct NightShiftStep: View {
    @Environment(AppModel.self) private var app
    @State private var start = ShepLimits.defaultShiftStart.date()
    @State private var parallelism = ShepLimits.defaultParallelism

    var body: some View {
        StepTitle(title: "When should Shep work?", subtitle: "Laptop lid closed? It still works with power and an external display.")
        DatePicker("Start each night at", selection: $start, displayedComponents: .hourAndMinute)
        Stepper("Tasks in parallel: \(parallelism)", value: $parallelism, in: ShepLimits.parallelism)
        PrimaryButton(title: "Continue") {
            Task { await app.onboarding.setNightShift(start: ClockTime(date: start), parallelism: parallelism) }
        }
    }
}

struct NotificationsStep: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        StepTitle(
            title: "One message at dawn",
            subtitle: "Shep notifies you once when the shift ends, and when a task needs an answer. Never in the middle of the night."
        )
        HStack(spacing: 12) {
            PrimaryButton(title: "Allow notifications") { Task { await app.onboarding.allowNotifications() } }
            Button("Not now") { Task { await app.onboarding.advance() } }
        }
    }
}

struct FirstTaskStep: View {
    @Environment(AppModel.self) private var app
    @State private var input = ""

    var body: some View {
        StepTitle(title: "Try it on one of your issues", subtitle: "An issue like #412, a link, or a sentence. It starts right now.")
        TextField("#412", text: $input)
            .textFieldStyle(.roundedBorder)
            .font(Typeface.code(14))
            .frame(width: 320)
        HStack(spacing: 12) {
            PrimaryButton(title: "Start it now") { Task { await app.onboarding.startFirstTask(input) } }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("or skip to tonight") { app.onboarding.finish() }
                .buttonStyle(.plain)
                .foregroundStyle(Palette.secondary)
        }
    }
}

struct FirstPullRequestStep: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if let ready = app.onboarding.firstReady {
            Text("Your first pull request is ready.").font(Typeface.display(40))
            Text(ready.headline).font(Typeface.ui(15))
            HStack(spacing: 12) {
                PrimaryButton(title: "Review it") {
                    app.onboarding.finish()
                    Task { await app.review.select(id: ready.id) }
                }
                Button("Queue tonight's work") {
                    app.onboarding.finish()
                    app.showAddTasks()
                }
            }
        } else {
            StepTitle(title: "Working on it", subtitle: "The agent is on your first task. This page changes when its pull request is ready.")
            ProgressView().controlSize(.small)
            Button("Continue to the review window") { app.onboarding.finish() }
        }
        Text("Tip: the lantern in your menu bar shows the shift at a glance.")
            .font(Typeface.ui(12))
            .foregroundStyle(Palette.secondary)
    }
}
