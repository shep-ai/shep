import AppKit
import ShepKit
import SwiftUI

/// First launch (`design/screens/MacOnboardingFlow.png`): the same steps as the terminal, in one
/// window, skipping those already satisfied.
struct OnboardingView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let onboarding = app.onboarding
        ZStack {
            if onboarding.step == .welcome || onboarding.step == .firstPullRequest {
                SkyBackground(progress: SkyProgress(done: onboarding.step == .welcome ? 0 : 1, total: 1))
            }
            VStack(alignment: .leading, spacing: 18) {
                step(onboarding.step)
                if let message = onboarding.message {
                    Text(message).font(Typeface.ui(13)).foregroundStyle(Palette.state(.needsYou))
                }
            }
            .padding(48)
            .frame(maxWidth: 640, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func step(_ step: OnboardingStep) -> some View {
        switch step {
        case .welcome: WelcomeStep()
        case .agent: AgentStep()
        case .github: GitHubStep()
        case .repositories: RepositoryStep()
        case .nightShift: NightShiftStep()
        case .notifications: NotificationsStep()
        case .firstTask: FirstTaskStep()
        case .firstPullRequest: FirstPullRequestStep()
        }
    }
}

struct StepTitle: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(Typeface.ui(24, .semibold))
            if let subtitle {
                Text(subtitle).font(Typeface.ui(14)).foregroundStyle(Palette.secondary)
            }
        }
    }
}

struct PrimaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typeface.ui(14, .semibold))
                .foregroundStyle(Palette.onLantern)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 8).fill(Palette.lantern))
        }
        .buttonStyle(.plain)
    }
}

private struct WelcomeStep: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Hand Shep your issues tonight.").font(Typeface.display(44))
            Text("Wake up to pull requests that already pass CI.").font(Typeface.ui(16))
            PrimaryButton(title: "Get started") { Task { await app.onboarding.advance() } }
        }
    }
}

private struct AgentStep: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        StepTitle(title: "Which agent does the work?", subtitle: "Uses the CLI already on your Mac with your login. Shep never stores keys.")
        ForEach(AgentKind.allCases, id: \.self) { agent in
            Button {
                Task { await app.onboarding.choose(agent: agent) }
            } label: {
                Text(agent.displayName)
                    .font(Typeface.ui(15, .medium))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Palette.card))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

/// The daemon has no call that says whether `gh` is signed in, so this step explains and lets
/// the person continue.
private struct GitHubStep: View {
    static let login = "gh auth login"
    @Environment(AppModel.self) private var app

    var body: some View {
        StepTitle(
            title: "Connect GitHub",
            subtitle: "Shep reads issues and opens draft pull requests as you, through the GitHub CLI. If `gh auth status` says you are signed in, continue."
        )
        HStack(spacing: 12) {
            Button("Copy “\(Self.login)”") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(Self.login, forType: .string)
            }
            PrimaryButton(title: "Continue") { Task { await app.onboarding.advance() } }
        }
    }
}

private struct RepositoryStep: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        StepTitle(title: "Which repository?", subtitle: "Each task works in its own worktree. Your checkout is never touched.")
        PrimaryButton(title: "Choose a folder…") {
            if let path = FolderPicker.choose() {
                Task { await app.onboarding.choose(repository: path) }
            }
        }
    }
}
