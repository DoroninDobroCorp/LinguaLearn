import AppKit
import ApplicationServices
import LinguaLearnCaptureCore

final class AccessibilityCaptureMonitor {
    struct Diagnostics {
        let lastInputEvent: String?
        let lastDecision: String?
        let lastSourceApp: String?
        let lastEventAt: Date?
    }

    struct CapturedSentence {
        let sourceApp: String
        let text: String
        let capturedAt: Date
    }

    struct DraftPreview {
        let element: AXUIElement
        let processIdentifier: pid_t
        let sourceApp: String
        let text: String
        let capturedAt: Date
    }

    private struct Candidate {
        let element: AXUIElement
        let processIdentifier: pid_t
        let sourceApp: String
        let text: String
        let capturedAt: Date
        let deadline: Date
    }

    private struct SourceApplication {
        let bundleIdentifier: String
        let processIdentifier: pid_t
    }

    private let configuration: CaptureConfiguration
    private let policy: CapturePolicy
    private let onCapture: (CapturedSentence) -> Void
    private let onPreview: (DraftPreview) -> Void
    private let diagnosticsLock = NSLock()
    private var diagnosticsState = Diagnostics(
        lastInputEvent: nil,
        lastDecision: nil,
        lastSourceApp: nil,
        lastEventAt: nil
    )
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    init(
        configuration: CaptureConfiguration,
        onCapture: @escaping (CapturedSentence) -> Void,
        onPreview: @escaping (DraftPreview) -> Void
    ) {
        self.configuration = configuration
        policy = CapturePolicy(configuration: configuration)
        self.onCapture = onCapture
        self.onPreview = onPreview
    }

    static var isTrusted: Bool { AXIsProcessTrusted() }
    static var hasInputMonitoringAccess: Bool { CGPreflightListenEventAccess() }
    var isRunning: Bool { eventTap != nil && runLoopSource != nil }
    var diagnostics: Diagnostics {
        diagnosticsLock.lock()
        defer { diagnosticsLock.unlock() }
        return diagnosticsState
    }

    @discardableResult
    static func requestPermission(prompt: Bool) -> Bool {
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([promptKey: prompt] as CFDictionary)
    }

    @discardableResult
    static func requestInputMonitoringPermission() -> Bool {
        CGRequestListenEventAccess()
    }

    func start() -> Bool {
        guard Self.isTrusted, Self.hasInputMonitoringAccess else { return false }
        guard eventTap == nil else { return true }

        let eventMask = CGEventMask(1 << CGEventType.keyDown.rawValue)
            | CGEventMask(1 << CGEventType.leftMouseDown.rawValue)
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            // The tap remains observational for every event except the exact preview hotkey,
            // Control+Option+G, which is consumed so it cannot type a stray character.
            options: .defaultTap,
            eventsOfInterest: eventMask,
            callback: Self.eventTapCallback,
            userInfo: pointer
        ) else {
            return false
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        eventTap = tap
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        return true
    }

    func stop() {
        if let eventTap { CGEvent.tapEnable(tap: eventTap, enable: false) }
        if let runLoopSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes) }
        eventTap = nil
        runLoopSource = nil
    }

    deinit { stop() }

    private static let eventTapCallback: CGEventTapCallBack = { _, type, event, userInfo in
        guard let userInfo else { return Unmanaged.passUnretained(event) }
        let monitor = Unmanaged<AccessibilityCaptureMonitor>.fromOpaque(userInfo).takeUnretainedValue()
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = monitor.eventTap { CGEvent.tapEnable(tap: tap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        switch type {
        case .keyDown:
            if monitor.handleKeyDown(event) { return nil }
        case .leftMouseDown:
            monitor.handleLeftMouseDown(event)
        default:
            break
        }
        return Unmanaged.passUnretained(event)
    }

    /// Returns true only for the exact grammar-preview shortcut, which should be consumed.
    private func handleKeyDown(_ event: CGEvent) -> Bool {
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let shortcutModifiers: CGEventFlags = [.maskControl, .maskAlternate]
        let disallowedShortcutModifiers: CGEventFlags = [.maskCommand, .maskShift]
        if keyCode == 5,
           event.flags.intersection(shortcutModifiers) == shortcutModifiers,
           event.flags.intersection(disallowedShortcutModifiers).isEmpty {
            handlePreviewShortcut()
            return true
        }

        guard keyCode == 36 || keyCode == 76 else { return false }
        recordDiagnostic(event: "returnKey", decision: "eventSeen")
        guard event.getIntegerValueField(.keyboardEventAutorepeat) == 0 else { return false }

        let blockedModifiers: CGEventFlags = [.maskShift, .maskControl, .maskAlternate]
        guard event.flags.intersection(blockedModifiers).isEmpty else {
            recordDiagnostic(event: "returnKey", decision: "modifierBlocked")
            return false
        }
        guard let source = allowedFrontmostApplication() else {
            recordDiagnostic(event: "returnKey", decision: "sourceNotAllowed")
            return false
        }
        guard let candidate = focusedCandidate(for: source) else {
            recordDiagnostic(event: "returnKey", decision: "focusedEditableNotFound", sourceApp: source.bundleIdentifier)
            return false
        }
        recordDiagnostic(event: "returnKey", decision: "awaitingComposerClear", sourceApp: source.bundleIdentifier)
        confirmComposerWasCleared(candidate, allowReplacementComposer: true)
        return false
    }

    private func handlePreviewShortcut() {
        recordDiagnostic(event: "previewHotkey", decision: "eventSeen")
        guard let source = allowedFrontmostApplication() else {
            recordDiagnostic(event: "previewHotkey", decision: "sourceNotAllowed")
            return
        }
        guard let candidate = focusedCandidate(for: source) else {
            recordDiagnostic(event: "previewHotkey", decision: "focusedEditableNotFound", sourceApp: source.bundleIdentifier)
            return
        }
        recordDiagnostic(event: "previewHotkey", decision: "previewQueued", sourceApp: source.bundleIdentifier)
        onPreview(DraftPreview(
            element: candidate.element,
            processIdentifier: candidate.processIdentifier,
            sourceApp: candidate.sourceApp,
            text: candidate.text,
            capturedAt: candidate.capturedAt
        ))
    }

    func replaceDraft(_ preview: DraftPreview, with correctedText: String) -> Bool {
        guard processIdentifier(of: preview.element) == preview.processIdentifier,
              isEditable(preview.element) else { return false }
        let role: String = attribute(kAXRoleAttribute, from: preview.element) ?? ""
        guard !isSecure(element: preview.element, role: role),
              let current: String = attribute(kAXValueAttribute, from: preview.element),
              current.trimmingCharacters(in: .whitespacesAndNewlines)
                == preview.text.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return false
        }
        return AXUIElementSetAttributeValue(
            preview.element,
            kAXValueAttribute as CFString,
            correctedText as CFString
        ) == .success
    }

    private func handleLeftMouseDown(_ event: CGEvent) {
        recordDiagnostic(event: "leftMouseDown", decision: "eventSeen")
        guard let source = allowedFrontmostApplication() else {
            recordDiagnostic(event: "leftMouseDown", decision: "sourceNotAllowed")
            return
        }

        // Some Electron/WebKit apps expose an icon-only send button with no accessible label. We
        // accept either a named send control or an otherwise pressable button, but still require
        // the exact focused composer to become empty after the click before capturing anything.
        // This keeps capture send-triggered instead of observing drafts continuously.
        guard isPotentialSendControl(at: event.location, processIdentifier: source.processIdentifier) else {
            recordDiagnostic(event: "leftMouseDown", decision: "sendControlNotRecognized", sourceApp: source.bundleIdentifier)
            return
        }
        guard let candidate = focusedCandidate(for: source) else {
            recordDiagnostic(event: "leftMouseDown", decision: "focusedEditableNotFound", sourceApp: source.bundleIdentifier)
            return
        }
        recordDiagnostic(event: "leftMouseDown", decision: "awaitingComposerClear", sourceApp: source.bundleIdentifier)
        confirmComposerWasCleared(candidate, allowReplacementComposer: true)
    }

    private func allowedFrontmostApplication() -> SourceApplication? {
        guard let application = NSWorkspace.shared.frontmostApplication,
              let bundleIdentifier = application.bundleIdentifier,
              policy.allows(bundleIdentifier: bundleIdentifier) else {
            return nil
        }
        return SourceApplication(
            bundleIdentifier: bundleIdentifier,
            processIdentifier: application.processIdentifier
        )
    }

    private func focusedCandidate(for source: SourceApplication) -> Candidate? {
        guard let editable = focusedEditableElement(for: source) else { return nil }
        let text = editable.value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 8_000 else { return nil }
        let capturedAt = Date()
        return Candidate(
            element: editable.element,
            processIdentifier: source.processIdentifier,
            sourceApp: source.bundleIdentifier,
            text: text,
            capturedAt: capturedAt,
            deadline: capturedAt.addingTimeInterval(Double(configuration.composerClearTimeoutMilliseconds) / 1_000)
        )
    }

    private func focusedEditableElement(for source: SourceApplication) -> (element: AXUIElement, value: String)? {
        let system = AXUIElementCreateSystemWide()
        guard var element: AXUIElement = attribute(kAXFocusedUIElementAttribute, from: system) else { return nil }

        // Web content-editable controls sometimes focus a static-text child rather than the
        // editable AXTextArea itself. Walk only the focused element's short, same-process ancestor
        // chain and select the first element with a settable string value.
        for _ in 0..<7 {
            guard processIdentifier(of: element) == source.processIdentifier else { return nil }
            let role: String = attribute(kAXRoleAttribute, from: element) ?? ""
            if isSecure(element: element, role: role) { return nil }
            if isEditable(element), let value: String = attribute(kAXValueAttribute, from: element) {
                return (element, value)
            }
            guard let parent: AXUIElement = attribute(kAXParentAttribute, from: element) else { break }
            element = parent
        }
        return nil
    }

    private func isPotentialSendControl(at point: CGPoint, processIdentifier expectedPID: pid_t) -> Bool {
        let system = AXUIElementCreateSystemWide()
        var hitElement: AXUIElement?
        guard AXUIElementCopyElementAtPosition(
            system,
            Float(point.x),
            Float(point.y),
            &hitElement
        ) == .success, var element = hitElement else {
            return false
        }

        // Hit-testing often returns an image or static-text child inside the actual button. Walk a
        // short ancestor chain, but never cross into another process or accept a non-button role.
        for _ in 0..<6 {
            guard processIdentifier(of: element) == expectedPID else { return false }
            if let role: String = attribute(kAXRoleAttribute, from: element) {
                let labels: [String] = [
                    attribute(kAXTitleAttribute, from: element),
                    attribute(kAXDescriptionAttribute, from: element),
                    attribute(kAXHelpAttribute, from: element),
                    attribute(kAXIdentifierAttribute, from: element)
                ].compactMap { $0 }
                if SendControlHeuristic.recognizes(role: role, labelCandidates: labels) {
                    return true
                }
                if role.caseInsensitiveCompare(kAXButtonRole as String) == .orderedSame,
                   labels.allSatisfy({ $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }),
                   actionNames(of: element).contains(kAXPressAction as String) {
                    return true
                }
            }
            guard let parent: AXUIElement = attribute(kAXParentAttribute, from: element) else { return false }
            element = parent
        }
        return false
    }

    private func actionNames(of element: AXUIElement) -> [String] {
        var names: CFArray?
        guard AXUIElementCopyActionNames(element, &names) == .success else { return [] }
        return names as? [String] ?? []
    }

    private func processIdentifier(of element: AXUIElement) -> pid_t? {
        var processIdentifier: pid_t = 0
        guard AXUIElementGetPid(element, &processIdentifier) == .success else { return nil }
        return processIdentifier
    }

    private func isEditable(_ element: AXUIElement) -> Bool {
        var settable = DarwinBoolean(false)
        guard AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success else {
            return false
        }
        return settable.boolValue
    }

    private func isSecure(element: AXUIElement, role: String) -> Bool {
        let fields: [String] = [
            role,
            attribute(kAXSubroleAttribute, from: element) ?? "",
            attribute(kAXTitleAttribute, from: element) ?? "",
            attribute(kAXDescriptionAttribute, from: element) ?? "",
            attribute(kAXPlaceholderValueAttribute, from: element) ?? ""
        ]
        let secureTerms = ["secure", "password", "passcode", "secret", "one-time code", "verification code"]
        return fields
            .joined(separator: " ")
            .lowercased()
            .contains(whereAny: secureTerms)
    }

    private func confirmComposerWasCleared(_ candidate: Candidate, allowReplacementComposer: Bool) {
        let interval: TimeInterval = 0.08
        DispatchQueue.main.asyncAfter(deadline: .now() + interval) { [weak self] in
            guard let self else { return }
            let current: String? = self.attribute(kAXValueAttribute, from: candidate.element)
            if current?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true {
                self.recordDiagnostic(
                    event: "composerConfirmation",
                    decision: "capturedOriginalCleared",
                    sourceApp: candidate.sourceApp
                )
                self.onCapture(CapturedSentence(
                    sourceApp: candidate.sourceApp,
                    text: candidate.text,
                    capturedAt: candidate.capturedAt
                ))
                return
            }
            // React/Electron may destroy and recreate its content-editable node after sending.
            // Treat that as confirmation only when the replacement focused editor belongs to the
            // same process and is empty; a non-empty replacement remains a draft and is ignored.
            if allowReplacementComposer, current == nil {
                let source = SourceApplication(
                    bundleIdentifier: candidate.sourceApp,
                    processIdentifier: candidate.processIdentifier
                )
                if let replacement = self.focusedEditableElement(for: source),
                   replacement.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    self.recordDiagnostic(
                        event: "composerConfirmation",
                        decision: "capturedReplacementEmpty",
                        sourceApp: candidate.sourceApp
                    )
                    self.onCapture(CapturedSentence(
                        sourceApp: candidate.sourceApp,
                        text: candidate.text,
                        capturedAt: candidate.capturedAt
                    ))
                    return
                }
            }
            guard Date() < candidate.deadline else {
                self.recordDiagnostic(
                    event: "composerConfirmation",
                    decision: "composerDidNotClear",
                    sourceApp: candidate.sourceApp
                )
                return
            }
            self.confirmComposerWasCleared(candidate, allowReplacementComposer: allowReplacementComposer)
        }
    }

    private func recordDiagnostic(event: String, decision: String, sourceApp: String? = nil) {
        diagnosticsLock.lock()
        diagnosticsState = Diagnostics(
            lastInputEvent: event,
            lastDecision: decision,
            lastSourceApp: sourceApp,
            lastEventAt: Date()
        )
        diagnosticsLock.unlock()
    }

    private func attribute<T>(_ name: String, from element: AXUIElement) -> T? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value as? T
    }
}

private extension String {
    func contains(whereAny terms: [String]) -> Bool {
        terms.contains(where: contains)
    }
}
