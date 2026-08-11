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
    targets: [
        .target(
            name: "LinguaLearnCaptureCore",
            linkerSettings: [
                .linkedFramework("NaturalLanguage")
            ]
        ),
        .executableTarget(
            name: "LinguaLearnCapture",
            dependencies: ["LinguaLearnCaptureCore"],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("Network")
            ]
        ),
        .testTarget(
            name: "LinguaLearnCaptureCoreTests",
            dependencies: ["LinguaLearnCaptureCore"]
        )
    ],
    swiftLanguageModes: [.v5]
)
