import AppKit
import ShepKit
import SwiftUI

enum WindowID {
    static let review = "review"
}

@main
struct ShepMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Window("Shep", id: WindowID.review) {
            RootView()
                .environment(delegate.app)
        }
        .defaultSize(width: 1280, height: 820)
        .commands { ShepCommands(app: delegate.app) }

        // `Settings` alone would name ShepKit's settings type.
        SwiftUI.Settings {
            SettingsView()
                .environment(delegate.app)
        }

        MenuBarExtra {
            MenuBarView()
                .environment(delegate.app)
        } label: {
            MenuBarLabel(app: delegate.app)
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    lazy var app = AppModel()
    private var running: Task<Void, Never>?

    func applicationWillFinishLaunching(_ notification: Notification) {
        Typeface.register()
        // Run from `swift run` the binary is not a bundle; make it a regular app with a Dock icon.
        NSApp.setActivationPolicy(.regular)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        app.notifier.activate()
        running = Task { await app.start() }
        NSApp.activate(ignoringOtherApps: true)
    }

    /// The menu bar extra keeps watch after the window closes.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }
}

struct ShepCommands: Commands {
    let app: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("Add Tasks…") { app.showAddTasks() }
                .keyboardShortcut("n")
            Button("Merge All Green") { Task { await app.mergeAllGreen() } }
                .keyboardShortcut("m", modifiers: [.command, .shift])
        }
    }
}

/// The lantern, and a short count while there is something to count.
struct MenuBarLabel: View {
    let app: AppModel

    var body: some View {
        HStack(spacing: 4) {
            if let icon = Assets.menuIcon {
                Image(nsImage: icon)
            } else {
                Image(systemName: "moon.stars")
            }
            if let compact = app.summary.compact {
                Text(compact)
            }
        }
    }
}
