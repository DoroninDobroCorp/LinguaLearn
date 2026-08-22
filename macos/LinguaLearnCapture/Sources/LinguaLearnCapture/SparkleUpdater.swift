import AppKit
import Sparkle

final class SparkleUpdater: NSObject, SPUUpdaterDelegate {
    static let shared = SparkleUpdater()

    private(set) var updaterController: SPUStandardUpdaterController?

    override private init() {
        super.init()
    }

    func start() {
        guard updaterController == nil else { return }
        let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
        controller.updater.automaticallyDownloadsUpdates = true
        controller.updater.automaticallyChecksForUpdates = true
        updaterController = controller
    }

    func checkForUpdates() {
        if updaterController == nil {
            start()
        }
        updaterController?.checkForUpdates(nil)
    }

    var canCheckForUpdates: Bool {
        updaterController?.updater.canCheckForUpdates ?? true
    }
}
