import AppKit
import LinguaLearnCaptureCore

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let popupController = CorrectionPopupController()
    private var configuration: CaptureConfiguration?
    private var coordinator: CaptureCoordinator?
    private var accessibilityMonitor: AccessibilityCaptureMonitor?
    private var ingressServer: LoopbackIngressServer?
    private var hookInboxImporter: HookInboxImporter?
    private var pauseItem: NSMenuItem?
    private var statusMenuItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusItem()
        SparkleUpdater.shared.start()
        reloadConfiguration(showErrors: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        hookInboxImporter?.stop()
        accessibilityMonitor?.stop()
        ingressServer?.stop()
    }

    private func configureStatusItem() {
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "text.bubble.fill", accessibilityDescription: "LinguaLearn Capture")
            if button.image == nil { button.title = "LL" }
            button.toolTip = "LinguaLearn Capture"
        }

        let menu = NSMenu()
        let status = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        statusMenuItem = status
        menu.addItem(.separator())

        let pause = NSMenuItem(title: "Pause new capture", action: #selector(togglePause), keyEquivalent: "p")
        pause.target = self
        menu.addItem(pause)
        pauseItem = pause

        let permission = NSMenuItem(
            title: "Request capture permissions…",
            action: #selector(requestAccessibilityPermission),
            keyEquivalent: ""
        )
        permission.target = self
        menu.addItem(permission)

        let openConfig = NSMenuItem(title: "Open config…", action: #selector(openConfiguration), keyEquivalent: ",")
        openConfig.target = self
        menu.addItem(openConfig)

        let pairMac = NSMenuItem(title: "Pair This Mac…", action: #selector(pairThisMac), keyEquivalent: "")
        pairMac.target = self
        menu.addItem(pairMac)

        let updates = NSMenuItem(title: "Check for Updates…", action: #selector(checkForUpdates), keyEquivalent: "u")
        updates.target = self
        menu.addItem(updates)

        let diagnostics = NSMenuItem(title: "Diagnostics / Test Connection…", action: #selector(openDiagnostics), keyEquivalent: "d")
        diagnostics.target = self
        menu.addItem(diagnostics)

        let reload = NSMenuItem(title: "Reload config", action: #selector(reloadFromMenu), keyEquivalent: "r")
        reload.target = self
        menu.addItem(reload)
        menu.addItem(.separator())

        let quit = NSMenuItem(title: "Quit LinguaLearn Capture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        statusItem.menu = menu
    }

    private func reloadConfiguration(showErrors: Bool) {
        hookInboxImporter?.stop()
        accessibilityMonitor?.stop()
        ingressServer?.stop()
        hookInboxImporter = nil
        accessibilityMonitor = nil
        ingressServer = nil
        coordinator = nil

        do {
            let config = try ConfigurationStore.loadOrCreate()
            configuration = config

            let coordinator = CaptureCoordinator(
                configuration: config,
                pendingEventsURL: ConfigurationStore.pendingEventsURL
            )
            coordinator.onAnalysis = { [weak self] event, response in
                self?.handleAnalysis(event: event, response: response)
            }
            coordinator.onFailure = { [weak self] event, error in
                self?.popupController.finishAnalyzingWithoutPopup(eventID: event.eventID)
                self?.setStatus("Analysis failed: \(error.localizedDescription)")
            }
            self.coordinator = coordinator
            coordinator.startQueue()

            let hookInboxImporter = HookInboxImporter(
                store: HookInboxStore(configurationURL: ConfigurationStore.configurationURL),
                coordinator: coordinator
            )
            self.hookInboxImporter = hookInboxImporter
            // The timer's first deadline is `.now()`, so files written while the agent was not
            // running are transferred immediately, then rechecked periodically.
            hookInboxImporter.start()

            let monitor = AccessibilityCaptureMonitor(
                configuration: config,
                onCapture: { [weak self] sentence in
                    self?.submitAccessibilitySentence(sentence)
                },
                onPreview: { [weak self] preview in
                    self?.previewDraft(preview)
                }
            )
            accessibilityMonitor = monitor

            let ingress = LoopbackIngressServer(
                port: config.ingressPort,
                ingressToken: try config.validatedIngressToken(),
                healthProvider: { [weak self] in
                    var eventTapRunning = false
                    var diagnostics: AccessibilityCaptureMonitor.Diagnostics?
                    if Thread.isMainThread {
                        eventTapRunning = self?.accessibilityMonitor?.isRunning ?? false
                        diagnostics = self?.accessibilityMonitor?.diagnostics
                    } else {
                        DispatchQueue.main.sync {
                            eventTapRunning = self?.accessibilityMonitor?.isRunning ?? false
                            diagnostics = self?.accessibilityMonitor?.diagnostics
                        }
                    }
                    return LoopbackIngressServer.HealthStatus(
                        ok: true,
                        accessibilityTrusted: AccessibilityCaptureMonitor.isTrusted,
                        inputMonitoringGranted: AccessibilityCaptureMonitor.hasInputMonitoringAccess,
                        eventTapRunning: eventTapRunning,
                        paused: self?.coordinator?.isPaused ?? true,
                        queueDepth: self?.coordinator?.queueDepth ?? 0,
                        storageHealthy: self?.coordinator?.isStorageHealthy ?? false,
                        lastInputEvent: diagnostics?.lastInputEvent,
                        lastCaptureDecision: diagnostics?.lastDecision,
                        lastCaptureSourceApp: diagnostics?.lastSourceApp,
                        lastInputEventAt: diagnostics?.lastEventAt
                    )
                }
            ) { [weak self] payload in
                guard let self, let coordinator = self.coordinator else { return .paused }
                let original = payload.captureEvent
                let eventID = original.eventID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "local-\(UUID().uuidString.lowercased())"
                    : original.eventID
                return coordinator.submit(CaptureEvent(
                    eventID: eventID,
                    sourceApp: original.sourceApp,
                    text: original.text,
                    sentAt: original.sentAt
                ))
            }
            try ingress.start()
            ingressServer = ingress

            if config.captureEnabled {
                if !AccessibilityCaptureMonitor.isTrusted {
                    _ = AccessibilityCaptureMonitor.requestPermission(prompt: true)
                }
                if !AccessibilityCaptureMonitor.hasInputMonitoringAccess {
                    _ = AccessibilityCaptureMonitor.requestInputMonitoringPermission()
                }
                let started = monitor.start()
                setStatus(started ? "Capturing • queue \(coordinator.queueDepth)" : capturePermissionStatus())
            } else {
                setStatus("Paused by config")
            }
            updatePauseMenu()
        } catch {
            NSLog("[LinguaLearn] reloadConfiguration error: %@", error.localizedDescription)
            hookInboxImporter?.stop()
            hookInboxImporter = nil
            coordinator = nil
            configuration = nil
            setStatus("Configuration error")
            if showErrors { showAlert(title: "LinguaLearn Capture", message: error.localizedDescription) }
        }
    }

    private func submitAccessibilitySentence(_ sentence: AccessibilityCaptureMonitor.CapturedSentence) {
        guard let coordinator else { return }
        let event = CaptureEvent(
            // A confirmed send is a unique practice event even when the learner
            // intentionally repeats identical text. This UUID survives every
            // network retry because the full event is stored in the durable queue.
            eventID: "ax-\(UUID().uuidString.lowercased())",
            sourceApp: sentence.sourceApp,
            text: sentence.text,
            sentAt: sentence.capturedAt
        )
        switch coordinator.submit(event) {
        case .queued:
            setStatus("Capturing • queue \(coordinator.queueDepth)")
        case .queueFull:
            setStatus("Queue full — newest sentence skipped")
        case .storageUnavailable:
            setStatus("Capture storage unavailable — sentence not queued")
        case .paused, .filtered, .duplicate:
            break
        }
    }

    private func previewDraft(_ preview: AccessibilityCaptureMonitor.DraftPreview) {
        guard let configuration, let monitor = accessibilityMonitor else { return }
        let event = CaptureEvent(
            eventID: "preview-\(UUID().uuidString.lowercased())",
            sourceApp: preview.sourceApp,
            text: preview.text,
            sentAt: preview.capturedAt
        )
        popupController.showAnalyzing(event: event)
        setStatus("Checking draft with Gemini…")

        AnalysisAPIClient(configuration: configuration).analyze(event: event, previewOnly: true) { [weak self, weak monitor] result in
            DispatchQueue.main.async {
                guard let self else { return }
                switch result {
                case .success(let response):
                    guard response.accepted else {
                        self.popupController.finishAnalyzingWithoutPopup(eventID: event.eventID)
                        self.setStatus("Draft was not an English sentence")
                        return
                    }
                    let appURL = try? configuration.validatedAppURL()
                    self.popupController.enqueue(
                        event: event,
                        response: response,
                        appURL: appURL,
                        replaceDraft: { correctedText in
                            monitor?.replaceDraft(preview, with: correctedText) ?? false
                        },
                        isPreviewHotkey: true
                    )
                    self.setStatus("Draft correction ready")
                case .failure(let error):
                    self.popupController.finishAnalyzingWithoutPopup(eventID: event.eventID)
                    self.setStatus("Draft analysis failed: \(error.localizedDescription)")
                }
            }
        }
    }

    private func handleAnalysis(event: CaptureEvent, response: WritingAnalyzeResponse) {
        guard response.accepted else {
            popupController.finishAnalyzingWithoutPopup(eventID: event.eventID)
            setStatus("Capturing • sentence not accepted")
            return
        }
        setStatus("Capturing • queue \(coordinator?.queueDepth ?? 0)")

        if response.isClearError == false && configuration?.showOnlyWhenChanged == true {
            popupController.finishAnalyzingWithoutPopup(eventID: event.eventID)
            return
        }

        let appURL = try? configuration?.validatedAppURL()
        popupController.enqueue(event: event, response: response, appURL: appURL ?? nil, isPreviewHotkey: false)
    }

    private func setStatus(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            self?.statusMenuItem?.title = text
            self?.statusItem.button?.toolTip = "LinguaLearn Capture — \(text)"
        }
    }

    private func updatePauseMenu() {
        let paused = coordinator?.isPaused ?? true
        pauseItem?.title = paused ? "Resume new capture" : "Pause new capture"
        pauseItem?.state = paused ? .on : .off
    }

    @objc private func togglePause() {
        guard let coordinator else { return }
        let willPause = !coordinator.isPaused
        coordinator.setPaused(willPause)
        if var config = configuration {
            config.captureEnabled = !willPause
            do {
                try ConfigurationStore.write(config)
                configuration = config
            } catch {
                showAlert(title: "Could not save capture state", message: error.localizedDescription)
            }
        }
        if willPause {
            accessibilityMonitor?.stop()
            setStatus("Paused • pending queue still delivers")
        } else {
            let started = accessibilityMonitor?.start() ?? false
            setStatus(started ? "Capturing • queue \(coordinator.queueDepth)" : capturePermissionStatus())
        }
        updatePauseMenu()
    }

    @objc private func requestAccessibilityPermission() {
        _ = AccessibilityCaptureMonitor.requestPermission(prompt: true)
        _ = AccessibilityCaptureMonitor.requestInputMonitoringPermission()
        if accessibilityMonitor?.start() == true {
            setStatus("Capturing • queue \(coordinator?.queueDepth ?? 0)")
        } else {
            setStatus(capturePermissionStatus())
        }
    }

    private func capturePermissionStatus() -> String {
        if !AccessibilityCaptureMonitor.isTrusted {
            return "Hook ready • Accessibility permission needed"
        }
        if !AccessibilityCaptureMonitor.hasInputMonitoringAccess {
            return "Hook ready • Input Monitoring permission needed"
        }
        return "Hook ready • event monitor unavailable"
    }

    private var lastBackendCommit: String = "Not tested"

    @objc private func openDiagnostics() {
        let appVersion = "1.0.0"
        let configuredURL = configuration?.apiURL ?? "Not configured"
        let tokenPresent = !(configuration?.bearerToken.isEmpty ?? true) && configuration?.bearerToken != "CHANGE_ME"
        let authStatus = tokenPresent ? "Authenticated (Token Present)" : "Unauthenticated / Missing Token"
        let deviceTokenStatus = tokenPresent ? "Present" : "None"
        let queueDepth = coordinator?.queueDepth ?? 0
        let syncStatus = coordinator?.isPaused == true ? "Paused" : "Active"

        let message = """
        App Version: \(appVersion)
        Configured URL: \(configuredURL)
        Backend Commit: \(lastBackendCommit)
        Auth Status: \(authStatus)
        Device Token Status: \(deviceTokenStatus)
        Queue Depth: \(queueDepth) items
        Sync Status: \(syncStatus)
        """

        let alert = NSAlert()
        alert.messageText = "LinguaLearn macOS Diagnostics"
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Test Connection")
        alert.addButton(withTitle: "Close")

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            testConnectionFromDiagnostics()
        }
    }

    private func testConnectionFromDiagnostics() {
        guard let configuration else {
            showAlert(title: "Diagnostics Error", message: "Configuration not loaded")
            return
        }
        let client = AnalysisAPIClient(configuration: configuration)
        client.testConnection { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let health):
                    let commit = health.gitCommit ?? "unknown"
                    self?.lastBackendCommit = commit
                    self?.showAlert(
                        title: "Connection Test Succeeded ✓",
                        message: "Backend status: \(health.status ?? "healthy")\nBackend commit: \(commit)\nApp version: \(health.appVersion ?? "1.0.0")"
                    )
                case .failure(let error):
                    self?.lastBackendCommit = "Error"
                    self?.showAlert(
                        title: "Connection Test Failed",
                        message: error.localizedDescription
                    )
                }
            }
        }
    }

    @objc private func openConfiguration() {
        do {
            _ = try ConfigurationStore.loadOrCreate()
            NSWorkspace.shared.activateFileViewerSelecting([ConfigurationStore.configurationURL])
        } catch {
            showAlert(title: "Cannot open config", message: error.localizedDescription)
        }
    }

    @objc private func reloadFromMenu() {
        reloadConfiguration(showErrors: true)
    }

    @objc private func checkForUpdates() {
        SparkleUpdater.shared.checkForUpdates()
    }

    @objc private func pairThisMac() {
        let alert = NSAlert()
        alert.messageText = "Pair This Mac"
        alert.informativeText = "Enter your device token (ll_dev_...) to pair this Mac with your LinguaLearn account:"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Pair")
        alert.addButton(withTitle: "Cancel")

        let inputTextField = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        inputTextField.placeholderString = "ll_dev_..."
        if let currentToken = configuration?.bearerToken, currentToken != "CHANGE_ME" {
            inputTextField.stringValue = currentToken
        }
        alert.accessoryView = inputTextField

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            let newToken = inputTextField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !newToken.isEmpty else { return }

            if var config = configuration {
                config.bearerToken = newToken
                do {
                    try ConfigurationStore.write(config)
                    configuration = config
                    reloadConfiguration(showErrors: true)
                    showAlert(title: "Pairing Successful", message: "This Mac has been paired with LinguaLearn!")
                } catch {
                    showAlert(title: "Pairing Error", message: error.localizedDescription)
                }
            }
        }
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}
