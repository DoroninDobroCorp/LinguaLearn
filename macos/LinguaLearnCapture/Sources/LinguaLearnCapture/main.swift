import AppKit
import Darwin
import Foundation

private final class SingleInstanceLock {
    private let descriptor: Int32

    init?() {
        let supportDirectory = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0].appendingPathComponent("LinguaLearnCapture", isDirectory: true)
        do {
            try FileManager.default.createDirectory(
                at: supportDirectory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
        } catch {
            return nil
        }

        let path = supportDirectory.appendingPathComponent("agent.lock").path
        let opened = Darwin.open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard opened >= 0 else { return nil }
        _ = Darwin.fchmod(opened, S_IRUSR | S_IWUSR)
        guard Darwin.lockf(opened, F_TLOCK, 0) == 0 else {
            Darwin.close(opened)
            return nil
        }
        descriptor = opened
    }

    deinit {
        _ = Darwin.lockf(descriptor, F_ULOCK, 0)
        Darwin.close(descriptor)
    }
}

// Keep this object alive for the whole process. A second launch exits cleanly,
// so it cannot install a second event tap and double-submit one physical send.
guard let instanceLock = SingleInstanceLock() else { exit(0) }
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
withExtendedLifetime(instanceLock) {
    application.run()
}
