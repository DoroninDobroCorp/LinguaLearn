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
            popupController.showAnalyzing(event: event)
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
                    let displayMode = PopupPolicy.displayMode(for: response, isPreviewHotkey: true)
                    self.popupController.enqueue(
                        event: event,
                        response: response,
                        appURL: appURL,
                        replaceDraft: { correctedText in
                            monitor?.replaceDraft(preview, with: correctedText) ?? false
                        },
                        displayMode: displayMode
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

        let appURL = try? configuration?.validatedAppURL()
        let displayMode = PopupPolicy.displayMode(for: response, isPreviewHotkey: false)
        popupController.enqueue(event: event, response: response, appURL: appURL ?? nil, displayMode: displayMode)
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

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}
