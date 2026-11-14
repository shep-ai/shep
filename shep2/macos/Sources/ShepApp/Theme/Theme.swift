import AppKit
import CoreText
import ShepKit
import SwiftUI

/// The brand ramp, night to dawn, and the five state colours (`design/screens/Brand.png`).
enum Palette {
    static let midnight = Color(hex: 0x070A1C)
    static let night = Color(hex: 0x141A44)
    static let dusk = Color(hex: 0x262C66)
    static let violetHour = Color(hex: 0x4D3F78)
    static let rose = Color(hex: 0x8A5374)
    static let ember = Color(hex: 0xC9763A)
    static let lantern = Color(hex: 0xF3B45C)
    static let dawn = Color(hex: 0xFFE4B0)

    static let card = Color(hex: 0x11153A)
    static let line = Color(hex: 0x262C66)
    static let text = Color(hex: 0xE9E7F2)
    static let secondary = Color(hex: 0xA3AAC8)
    static let onLantern = Color(hex: 0x1A1405)

    static func state(_ state: TaskState) -> Color {
        switch state {
        case .queued, .unknown: return Color(hex: 0x7D84A8)
        case .working: return Color(hex: 0x93B2FF)
        case .needsYou: return Color(hex: 0xFF8F7A)
        case .ready: return Color(hex: 0x8FD6A8)
        case .merged: return lantern
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Gloock for moments, Hanken Grotesk for the interface, JetBrains Mono for code and numbers.
/// All three are SIL OFL 1.1 and bundled with their licences; if registering them fails,
/// `Font.custom` falls back to the system font.
enum Typeface {
    enum Family {
        static let display = "Gloock"
        static let interface = "Hanken Grotesk"
        static let code = "JetBrains Mono"
    }

    static let fontExtension = "ttf"

    static func display(_ size: CGFloat) -> Font { .custom(Family.display, size: size) }
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom(Family.interface, size: size).weight(weight)
    }
    static func code(_ size: CGFloat) -> Font { .custom(Family.code, size: size) }

    /// Registers the bundled fonts for this process.
    static func register() {
        let urls = Assets.bundle?.urls(forResourcesWithExtension: fontExtension, subdirectory: Assets.fontsFolder) ?? []
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

/// Pictures from `specs/151-shep-2/design/atlas/assets`.
enum Assets {
    static let fontsFolder = "Fonts"
    static let imagesFolder = "Images"
    static let resourceBundleName = "ShepMac_ShepApp.bundle"
    static let lantern = "icon-lantern"
    static let heroDawn = "hero-dawn"
    static let heroNight = "hero-night"
    static let menuIconSize = NSSize(width: 18, height: 18)

    /// The resources: inside `Shep.app/Contents/Resources` when packaged by
    /// `scripts/make-app.sh`, else next to the `swift build` products.
    static let bundle: Bundle? = {
        if let packaged = Bundle.main.resourceURL?.appendingPathComponent(resourceBundleName),
           let bundle = Bundle(url: packaged) {
            return bundle
        }
        return Bundle.module
    }()

    static func image(_ name: String) -> NSImage? {
        guard let url = bundle?.url(forResource: name, withExtension: "png", subdirectory: imagesFolder) else { return nil }
        return NSImage(contentsOf: url)
    }

    /// `sky-3of6`: the frame for this much progress.
    static func sky(_ progress: SkyProgress) -> NSImage? {
        image("sky-\(progress.frame)of\(SkyProgress.lastFrame)")
    }

    static var menuIcon: NSImage? {
        guard let icon = image(lantern)?.copy() as? NSImage else { return nil }
        icon.size = menuIconSize
        return icon
    }
}

/// The dithered sky behind a screen; pixel art, so it is never smoothed.
struct SkyBackground: View {
    let progress: SkyProgress

    var body: some View {
        if let image = Assets.sky(progress) {
            Image(nsImage: image)
                .resizable()
                .interpolation(.none)
                .aspectRatio(contentMode: .fill)
        } else {
            LinearGradient(colors: [Palette.midnight, Palette.night], startPoint: .top, endPoint: .bottom)
        }
    }
}

/// A rounded panel on the night background.
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 14).fill(Palette.card))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.line, lineWidth: 1))
    }
}

/// A small rounded label, like "CI green".
struct Chip: View {
    let text: String
    var color: Color = Palette.secondary

    var body: some View {
        Text(text)
            .font(Typeface.ui(12, .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .overlay(Capsule().stroke(color.opacity(0.5), lineWidth: 1))
    }
}

/// A button with the key that presses it, like "Merge  M".
struct KeyButton: View {
    let title: String
    let key: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title).font(Typeface.ui(14, .semibold))
                Text(key)
                    .font(Typeface.code(11))
                    .padding(.horizontal, 5)
                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(.secondary, lineWidth: 1))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .foregroundStyle(prominent ? Palette.onLantern : Palette.text)
            .background(RoundedRectangle(cornerRadius: 8).fill(prominent ? Palette.lantern : Palette.night))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line, lineWidth: prominent ? 0 : 1))
        }
        .buttonStyle(.plain)
    }
}
