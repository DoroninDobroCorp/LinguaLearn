import AppKit
import LinguaLearnCaptureCore

final class CorrectionPopupController: NSObject {
    private struct Presentation {
        let event: CaptureEvent
        let response: WritingAnalyzeResponse
        let appURL: URL?
        let replaceDraft: ((String) -> Bool)?
        let isPreview: Bool

        var displayMode: PopupDisplayMode {
            PopupPresentationPolicy.displayMode(for: response, isPreview: isPreview)
        }

        var isCompact: Bool {
            displayMode == .compactChip
        }
    }

    private let panel: NSPanel
    private let contentStack = NSStackView()
    private let maximumPendingPresentations = 20
    private var presentations: [Presentation] = []
    private var autoDismissWorkItem: DispatchWorkItem?
    private var countdownTimer: Timer?
    private weak var countdownLabel: NSTextField?
    private var remainingAutoDismissSeconds = 0
    private var analyzingEventID: String?
    private var correctedText = ""
    private var currentAppURL: URL?
    private var replaceDraftHandler: ((String) -> Bool)?

    override init() {
        panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 320),
            styleMask: [.titled, .closable, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        super.init()
        configurePanel()
    }

    func enqueue(
        event: CaptureEvent,
        response: WritingAnalyzeResponse,
        appURL: URL?,
        replaceDraft: ((String) -> Bool)? = nil,
        isPreview: Bool = false
    ) {
        let presentation = Presentation(
            event: event,
            response: response,
            appURL: appURL,
            replaceDraft: replaceDraft,
            isPreview: isPreview
        )
        if analyzingEventID == event.eventID {
            analyzingEventID = nil
            rebuildContent(for: presentation)
            positionPanel()
            panel.orderFrontRegardless()
            scheduleAutoDismiss(duration: presentation.isCompact ? 1.8 : 6.0)
            return
        }
        if presentations.count >= maximumPendingPresentations {
            presentations.removeFirst(presentations.count - maximumPendingPresentations + 1)
        }
        presentations.append(presentation)
        if !panel.isVisible { showNext() }
    }

    func showAnalyzing(event: CaptureEvent) {
        guard !panel.isVisible else { return }
        cancelAutoDismiss()
        analyzingEventID = event.eventID
        for view in contentStack.arrangedSubviews {
            contentStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        let source = makeLabel("From \(event.sourceApp)", font: .systemFont(ofSize: 11, weight: .medium))
        source.textColor = .secondaryLabelColor
        contentStack.addArrangedSubview(source)
        contentStack.addArrangedSubview(makeSection(
            title: "Checking your English…",
            body: "The correction will appear here when the analysis is ready.",
            color: .labelColor
        ))
        panel.setContentSize(NSSize(width: 480, height: 150))
        positionPanel()
        panel.orderFrontRegardless()
    }

    func finishAnalyzingWithoutPopup(eventID: String) {
        guard analyzingEventID == eventID else { return }
        analyzingEventID = nil
        panel.orderOut(nil)
        showNext()
    }

    private func configurePanel() {
        panel.title = "LinguaLearn"
        panel.level = .floating
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.animationBehavior = .utilityWindow
        panel.delegate = self

        contentStack.orientation = .vertical
        contentStack.alignment = .leading
        contentStack.spacing = 10
        contentStack.edgeInsets = NSEdgeInsets(top: 18, left: 18, bottom: 16, right: 18)
        contentStack.translatesAutoresizingMaskIntoConstraints = false

        let visualEffect = NSVisualEffectView()
        visualEffect.material = .popover
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.addSubview(contentStack)
        panel.contentView = visualEffect

        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor),
            contentStack.topAnchor.constraint(equalTo: visualEffect.topAnchor),
            contentStack.bottomAnchor.constraint(equalTo: visualEffect.bottomAnchor)
        ])
    }

    private func showNext() {
        guard !presentations.isEmpty else { return }
        let presentation = presentations.removeFirst()
        rebuildContent(for: presentation)
        positionPanel()
        panel.orderFrontRegardless()
        scheduleAutoDismiss(duration: presentation.isCompact ? 1.8 : 6.0)
    }

    private func rebuildContent(for presentation: Presentation) {
        for view in contentStack.arrangedSubviews {
            contentStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
        countdownLabel = nil

        if presentation.isCompact {
            rebuildCompactContent(for: presentation)
        } else {
            rebuildDetailedContent(for: presentation)
        }
    }

    private func rebuildCompactContent(for presentation: Presentation) {
        contentStack.spacing = 6
        contentStack.edgeInsets = NSEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)

        let hStack = NSStackView()
        hStack.orientation = .horizontal
        hStack.spacing = 8
        hStack.alignment = .centerY

        let title = makeLabel("Grammar OK ✓", font: .systemFont(ofSize: 13, weight: .bold))
        title.textColor = .systemGreen
        hStack.addArrangedSubview(title)

        let sourceApp = presentation.event.sourceApp.trimmingCharacters(in: .whitespacesAndNewlines)
        if !sourceApp.isEmpty {
            let source = makeLabel("(\(sourceApp))", font: .systemFont(ofSize: 11, weight: .regular))
            source.textColor = .secondaryLabelColor
            hStack.addArrangedSubview(source)
        }

        contentStack.addArrangedSubview(hStack)

        contentStack.layoutSubtreeIfNeeded()
        let fitting = contentStack.fittingSize
        let width = max(fitting.width + 28, 160)
        let height = max(fitting.height + 20, 40)
        panel.setContentSize(NSSize(width: width, height: height))
    }

    private func rebuildDetailedContent(for presentation: Presentation) {
        let source = makeLabel("From \(presentation.event.sourceApp)", font: .systemFont(ofSize: 11, weight: .medium))
        source.textColor = .secondaryLabelColor
        contentStack.addArrangedSubview(source)

        contentStack.addArrangedSubview(makeSection(
            title: "Original",
            body: presentation.response.originalText ?? presentation.event.text,
            color: .secondaryLabelColor
        ))

        correctedText = presentation.response.correctedText ?? presentation.event.text
        currentAppURL = presentation.appURL
        replaceDraftHandler = presentation.replaceDraft
        let originalText = (presentation.response.originalText ?? presentation.event.text)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let correctionChanged = correctedText.trimmingCharacters(in: .whitespacesAndNewlines) != originalText
        contentStack.addArrangedSubview(makeSection(
            title: correctionChanged ? "Better version" : "Correct ✓",
            body: correctedText,
            color: .labelColor
        ))

        let explanations = presentation.response.errors.prefix(3).compactMap { error -> String? in
            guard let explanation = error.displayExplanation else { return nil }
            let change: String
            if let original = error.original, let correction = error.correction,
               !original.isEmpty, !correction.isEmpty {
                change = "\(original) → \(correction): "
            } else {
                change = ""
            }
            return "• \(change)\(explanation)"
        }
        if !explanations.isEmpty {
            contentStack.addArrangedSubview(makeSection(
                title: "Why",
                body: explanations.joined(separator: "\n"),
                color: .labelColor
            ))
        } else if let summary = presentation.response.summaryRu?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !summary.isEmpty {
            contentStack.addArrangedSubview(makeSection(
                title: "Why",
                body: summary,
                color: .labelColor
            ))
        } else if !correctionChanged {
            contentStack.addArrangedSubview(makeSection(
                title: "Why",
                body: "Всё правильно — грамматических ошибок не найдено.",
                color: .labelColor
            ))
        }

        var topicLabels: [String: String] = [:]
        for topic in presentation.response.errors.compactMap(\.topic) {
            topicLabels[topic] = topic
        }
        for evidence in presentation.response.topicEvidence {
            var label = evidence.topic
            if let delta = evidence.scoreDelta {
                label += delta > 0 ? " +\(delta)" : " \(delta)"
            }
            if let score = evidence.newScore { label += " → \(score)/100" }
            topicLabels[evidence.topic] = label
        }
        for change in presentation.response.topicChanges {
            guard let topic = change.displayName else { continue }
            var label = topic
            if let delta = change.delta { label += delta > 0 ? " +\(delta)" : " \(delta)" }
            if let score = change.score { label += " → \(score)/100" }
            topicLabels[topic] = label
        }
        let topics = topicLabels.keys.sorted().prefix(4).compactMap { topicLabels[$0] }
        if !topics.isEmpty {
            let topicStack = NSStackView()
            topicStack.orientation = .horizontal
            topicStack.spacing = 6
            topicStack.alignment = .centerY
            for topic in topics {
                let chip = makeLabel("  \(topic)  ", font: .systemFont(ofSize: 11, weight: .medium))
                chip.wantsLayer = true
                chip.layer?.backgroundColor = NSColor.controlAccentColor.withAlphaComponent(0.15).cgColor
                chip.layer?.cornerRadius = 7
                chip.lineBreakMode = .byTruncatingTail
                chip.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
                topicStack.addArrangedSubview(chip)
            }
            contentStack.addArrangedSubview(topicStack)
        }

        let buttons = NSStackView()
        buttons.orientation = .horizontal
        buttons.alignment = .centerY
        buttons.spacing = 8
        buttons.addArrangedSubview(makeButton("Copy corrected", action: #selector(copyCorrected)))
        if presentation.replaceDraft != nil {
            buttons.addArrangedSubview(makeButton("Replace draft", action: #selector(replaceDraft)))
        }
        let open = makeButton("Open LinguaLearn", action: #selector(openLinguaLearn))
        open.isEnabled = presentation.appURL != nil
        buttons.addArrangedSubview(open)
        buttons.addArrangedSubview(makeButton("Keep open", action: #selector(keepPopupOpen)))
        buttons.addArrangedSubview(makeButton("Dismiss", action: #selector(dismissPopup)))
        contentStack.addArrangedSubview(buttons)

        let countdown = makeLabel("", font: .systemFont(ofSize: 11, weight: .medium))
        countdown.textColor = .secondaryLabelColor
        countdownLabel = countdown
        contentStack.addArrangedSubview(countdown)

        contentStack.layoutSubtreeIfNeeded()
        let fitting = contentStack.fittingSize
        let height = min(max(fitting.height, 260), 620)
        panel.setContentSize(NSSize(width: 480, height: height))
    }

    private func makeSection(title: String, body: String, color: NSColor) -> NSView {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 3
        stack.addArrangedSubview(makeLabel(title, font: .systemFont(ofSize: 12, weight: .semibold)))
        let safeBody = body.count > 2_500 ? String(body.prefix(2_500)) + "…" : body
        let label = makeLabel(safeBody, font: .systemFont(ofSize: 13))
        label.textColor = color
        label.maximumNumberOfLines = 8
        stack.addArrangedSubview(label)
        stack.widthAnchor.constraint(equalToConstant: 444).isActive = true
        return stack
    }

    private func makeLabel(_ text: String, font: NSFont) -> NSTextField {
        let label = NSTextField(wrappingLabelWithString: text)
        label.font = font
        label.isSelectable = true
        return label
    }

    private func makeButton(_ title: String, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.controlSize = .small
        return button
    }

    private func positionPanel() {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main
        guard let visibleFrame = screen?.visibleFrame else { return }
        let frame = panel.frame
        panel.setFrameOrigin(NSPoint(
            x: visibleFrame.maxX - frame.width - 20,
            y: visibleFrame.maxY - frame.height - 20
        ))
    }

    private func scheduleAutoDismiss(duration: TimeInterval = 6.0) {
        cancelAutoDismiss()
        remainingAutoDismissSeconds = Int(ceil(duration))
        if duration > 2.0 {
            updateCountdownLabel()
            countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
                guard let self else {
                    timer.invalidate()
                    return
                }
                self.remainingAutoDismissSeconds -= 1
                self.updateCountdownLabel()
                if self.remainingAutoDismissSeconds <= 0 { timer.invalidate() }
            }
        }
        let workItem = DispatchWorkItem { [weak self] in
            self?.advanceQueue()
        }
        autoDismissWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: workItem)
    }

    private func updateCountdownLabel() {
        let seconds = max(remainingAutoDismissSeconds, 0)
        countdownLabel?.stringValue = "Closes in \(seconds)s — press Keep open to stop the timer"
    }

    private func cancelAutoDismiss() {
        autoDismissWorkItem?.cancel()
        autoDismissWorkItem = nil
        countdownTimer?.invalidate()
        countdownTimer = nil
    }

    private func advanceQueue() {
        cancelAutoDismiss()
        analyzingEventID = nil
        panel.orderOut(nil)
        showNext()
    }

    @objc private func copyCorrected() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(correctedText, forType: .string)
    }

    @objc private func openLinguaLearn() {
        guard let url = currentAppURL else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func keepPopupOpen() {
        cancelAutoDismiss()
        countdownLabel?.stringValue = "Kept open — press Dismiss when you are done"
    }

    @objc private func replaceDraft() {
        guard let replaceDraftHandler else { return }
        cancelAutoDismiss()
        if replaceDraftHandler(correctedText) {
            countdownLabel?.stringValue = "Draft replaced — review it, then press Enter to send"
        } else {
            countdownLabel?.stringValue = "Draft changed — use Copy corrected instead"
        }
    }

    @objc private func dismissPopup() {
        advanceQueue()
    }
}

extension CorrectionPopupController: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        cancelAutoDismiss()
        analyzingEventID = nil
        DispatchQueue.main.async { [weak self] in self?.showNext() }
    }
}
