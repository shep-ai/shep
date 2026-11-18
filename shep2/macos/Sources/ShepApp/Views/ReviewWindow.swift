import AppKit
import ShepKit
import SwiftUI

/// Onboarding until it is done, then the review window.
struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            if app.onboarding.isComplete {
                ReviewWindow()
            } else {
                OnboardingView()
            }
        }
        .frame(minWidth: 960, minHeight: 620)
        .background(Palette.midnight)
        .foregroundStyle(Palette.text)
        .preferredColorScheme(.dark)
    }
}

/// The morning review (`design/screens/MacReview.png`): the queue by verdict on the left, the
/// selected task on the right, decided with single keys.
struct ReviewWindow: View {
    @Environment(AppModel.self) private var app
    @FocusState private var keysFocused: Bool

    var body: some View {
        @Bindable var shared = app
        NavigationSplitView {
            ReviewSidebar()
                .navigationSplitViewColumnWidth(min: 220, ideal: 248, max: 300)
        } detail: {
            VStack(spacing: 0) {
                ReviewHeader()
                Divider().overlay(Palette.line)
                ReviewDetail()
            }
            .background(Palette.midnight)
        }
        .focusable()
        .focused($keysFocused)
        .focusEffectDisabled()
        .onKeyPress(phases: .down, action: handle)
        .onAppear { keysFocused = true }
        .onChange(of: app.review.selectedId) { keysFocused = !app.review.isWritingNote }
        .sheet(isPresented: $shared.showingAddTasks) {
            AddTasksView()
        }
        .toolbar {
            ToolbarItem {
                Button {
                    app.showAddTasks()
                } label: {
                    Label("Add tasks", systemImage: "plus")
                }
                .help("Tonight's work (⌘N)")
            }
        }
    }

    private func handle(_ press: KeyPress) -> KeyPress.Result {
        if press.key == .escape {
            Task { await app.review.handle(.cancel) }
            return .handled
        }
        if press.key == .return, let url = app.review.selected?.pr?.url {
            app.open(url)
            return .handled
        }
        guard press.modifiers.subtracting(.shift).isEmpty,
              let character = press.characters.first,
              let key = ReviewKey(character: character)
        else { return .ignored }
        Task { await app.review.handle(key) }
        return .handled
    }
}

struct ReviewSidebar: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("REVIEW")
                .font(Typeface.code(11))
                .foregroundStyle(Palette.secondary)
                .padding(.horizontal, 12)
                .padding(.bottom, 6)
            ForEach(Board.reviewOrder + [.merged], id: \.self) { state in
                Button {
                    Task { await app.review.select(id: app.review.board.tasks(state).first?.id) }
                } label: {
                    HStack {
                        Circle().fill(Palette.state(state)).frame(width: 8, height: 8)
                        Text(state == .merged ? "Merged today" : state.label).font(Typeface.ui(14))
                        Spacer()
                        Text("\(app.review.count(state))").font(Typeface.code(12)).foregroundStyle(Palette.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(app.review.selected?.state == state ? Palette.dusk : Color.clear)
                    )
                }
                .buttonStyle(.plain)
                .disabled(state == .merged || app.review.count(state) == 0)
            }
            Spacer()
            TonightCard()
        }
        .padding(12)
        .background(SkyBackground(progress: app.review.sky).opacity(0.35))
        .background(Palette.night)
    }
}

/// "Tonight · 23:00 — 2 queued · keeps your Mac awake on power".
struct TonightCard: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let shift = app.store.settings?.shiftStart ?? ShepLimits.defaultShiftStart
        VStack(alignment: .leading, spacing: 4) {
            Text("Tonight · \(shift.text)").font(Typeface.ui(13, .semibold))
            Text("\(app.review.board.queued.count) queued · keeps your Mac awake on power")
                .font(Typeface.ui(12))
                .foregroundStyle(Palette.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Palette.midnight.opacity(0.8)))
    }
}

struct ReviewHeader: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        HStack(spacing: 12) {
            Text("Morning").font(Typeface.ui(16, .semibold))
            Text("\(app.review.position) · sorted by verdict · the sky brightens with each decision")
                .font(Typeface.ui(13))
                .foregroundStyle(Palette.secondary)
            Spacer()
            if case let .offline(reason) = app.store.status {
                Chip(text: reason, color: Palette.state(.needsYou))
            }
            Chip(text: "\(app.review.board.ready.count) ready · \(app.review.board.needsYou.count) needs you", color: Palette.lantern)
        }
        .padding(.horizontal, 24)
        .frame(height: 54)
    }
}

/// The selected task, laid out for its state; dawn when nothing is left.
struct ReviewDetail: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            if app.review.isDawn, app.store.status == .live {
                DawnView()
            } else if let task = app.review.selected {
                switch task.state {
                case .ready: ReadyCard()
                case .needsYou: NeedsYouView()
                case .working:
                    WorkingView(model: WorkingViewModel(client: app.client, taskId: task.id)).id(task.id)
                case .queued, .merged, .unknown: QueuedCard(task: task)
                }
            } else {
                ContentUnavailableView("Nothing to review", systemImage: "moon.stars", description: Text("Add tasks for tonight with ⌘N."))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .overlay(alignment: .bottom) {
            if let message = app.review.message {
                Text(message)
                    .font(Typeface.ui(13))
                    .padding(10)
                    .background(Capsule().fill(Palette.card))
                    .padding(16)
            }
        }
    }
}

struct QueuedCard: View {
    let task: ShepTask

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: 8) {
                Text(task.headline).font(Typeface.ui(22, .semibold))
                Text("Queued: starts with tonight's shift, or now from Add tasks.")
                    .font(Typeface.ui(14))
                    .foregroundStyle(Palette.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(24)
    }
}
