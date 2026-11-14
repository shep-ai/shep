import Foundation

/// The sky is the progress bar: night at nothing done, dawn when everything is. The app draws
/// one of `frameCount` pictures (`sky-0of6` … `sky-6of6`).
public struct SkyProgress: Equatable, Sendable {
    public static let frameCount = 7
    public static let lastFrame = frameCount - 1

    public let done: Int
    public let total: Int

    public init(done: Int, total: Int) {
        self.done = done
        self.total = total
    }

    /// The morning review: each decision brightens the sky.
    public static func morning(decided: Int, waiting: Int) -> SkyProgress {
        SkyProgress(done: decided, total: decided + waiting)
    }

    /// 0 at night, 1 at dawn. Nothing to do counts as dawn.
    public var fraction: Double {
        guard total > 0 else { return 1 }
        return Double(clampedDone) / Double(total)
    }

    public var frame: Int {
        guard total > 0 else { return Self.lastFrame }
        return clampedDone * Self.lastFrame / total
    }

    private var clampedDone: Int { min(max(done, 0), total) }
}

/// How long something has run, the way a person says it: `42s`, `4m 12s`, `1h 05m`.
public enum Elapsed {
    static let minute: Int64 = 60
    static let hour: Int64 = 3_600

    public static func text(seconds: Int64) -> String {
        let seconds = max(seconds, 0)
        if seconds < minute { return "\(seconds)s" }
        if seconds < hour { return "\(seconds / minute)m \(seconds % minute)s" }
        let minutes = (seconds % hour) / minute
        return "\(seconds / hour)h \(twoDigits(minutes))m"
    }
}

extension ClockTime {
    /// `23:00`.
    public var text: String {
        "\(twoDigits(hour)):\(twoDigits(minute))"
    }

    public init(date: Date, calendar: Calendar = .current) {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        self.init(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
    }

    /// This time of day on `day`, for date pickers.
    public func date(on day: Date = Date(), calendar: Calendar = .current) -> Date {
        calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
    }

    public var isValid: Bool {
        (0..<ShepLimits.hoursPerDay).contains(hour) && (0..<ShepLimits.minutesPerHour).contains(minute)
    }
}

/// `5` -> `05`.
func twoDigits<N: BinaryInteger>(_ value: N) -> String {
    value < 10 && value >= 0 ? "0\(value)" : "\(value)"
}
