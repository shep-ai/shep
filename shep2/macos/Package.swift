// swift-tools-version:5.10
// The Shep 2 Mac app.
//
// - ShepKit: protocol types (generated from ../schema/openrpc.json), the JSON-RPC client over the
//   daemon's Unix socket, and every view model. Foundation only; builds and tests on Linux too.
// - ShepApp: the SwiftUI + AppKit app. Declared only when building on macOS.
import PackageDescription

var products: [Product] = [.library(name: "ShepKit", targets: ["ShepKit"])]
var targets: [Target] = [
    .target(name: "ShepKit"),
    .testTarget(name: "ShepKitTests", dependencies: ["ShepKit"], resources: [.copy("Fixtures")]),
]

#if os(macOS)
products.append(.executable(name: "Shep", targets: ["ShepApp"]))
targets.append(
    .executableTarget(
        name: "ShepApp",
        dependencies: ["ShepKit"],
        resources: [.copy("Resources/Fonts"), .copy("Resources/Images")]
    )
)
#endif

let package = Package(
    name: "ShepMac",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)
