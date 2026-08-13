// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "LinguaLearnCapture",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "LinguaLearnCaptureCore", targets: ["LinguaLearnCaptureCore"]),
        .executable(name: "LinguaLearnCapture", targets: ["LinguaLearnCapture"])
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.6.0")
    ],
    targets: [
        .target(
            name: "LinguaLearnCaptureCore",
            linkerSettings: [
                .linkedFramework("NaturalLanguage"),
                .linkedFramework("Security")
            ]
        ),
        .executableTarget(
            name: "LinguaLearnCapture",
            dependencies: [
                "LinguaLearnCaptureCore",
                .product(name: "Sparkle", package: "Sparkle")
            ],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("Network"),
                .linkedFramework("Security")
            ]
        ),
        .testTarget(
            name: "LinguaLearnCaptureCoreTests",
            dependencies: ["LinguaLearnCaptureCore"]
        )
    ],
    swiftLanguageModes: [.v5]
)
