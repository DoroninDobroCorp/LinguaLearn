import AppKit
import LinguaLearnCaptureCore

final class CorrectionPopupController: NSObject {
    private struct Presentation {
        let viewModel: CorrectionPopupViewModel
        let appURL: URL?
        let replaceDraft: ((String) -> Bool)?
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
    private var currentDisplayMode: PopupDisplayMode?
    private var targetTextToApply = ""
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
        isPreviewHotkey: Bool = false
    ) {
        let viewModel = CorrectionPopupViewModel(event: event, response: response, isPreviewHotkey: isPreviewHotkey)
        let presentation = Presentation(
            viewModel: viewModel,
            appURL: appURL,
            replaceDraft: replaceDraft
        )
        if viewModel.displayMode == .compactChip {
            // Success confirmations are ephemeral status, not an inbox. Keep
            // at most the newest one and replace a currently visible chip.
            presentations.removeAll { $0.viewModel.displayMode == .compactChip }
            if panel.isVisible && currentDisplayMode == .compactChip && analyzingEventID == nil {
                rebuildContent(for: presentation)
                positionPanel()
                panel.orderFrontRegardless()
                scheduleAutoDismiss(seconds: presentation.viewModel.autoDismissSeconds)
                return
            }
        }
        if analyzingEventID == event.eventID {
            analyzingEventID = nil
            rebuildContent(for: presentation)
            positionPanel()
            panel.orderFrontRegardless()
            scheduleAutoDismiss(seconds: presentation.viewModel.autoDismissSeconds)
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
        currentDisplayMode = nil
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
        scheduleAutoDismiss(seconds: presentation.viewModel.autoDismissSeconds)
    }

    private func rebuildContent(for presentation: Presentation) {
        for view in contentStack.arrangedSubviews {
            contentStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        let vm = presentation.viewModel
        currentDisplayMode = vm.displayMode

        if vm.displayMode == .compactChip {
            let chipLabel = makeLabel("Grammar OK ✓", font: .systemFont(ofSize: 13, weight: .semibold))
            chipLabel.textColor = .labelColor
            contentStack.addArrangedSubview(chipLabel)
            contentStack.layoutSubtreeIfNeeded()
            let fitting = contentStack.fittingSize
            panel.setContentSize(NSSize(width: max(fitting.width + 36, 180), height: 42))
            return
        }

        let source = makeLabel("From \(vm.sourceApp)", font: .systemFont(ofSize: 11, weight: .medium))
        source.textColor = .secondaryLabelColor
        contentStack.addArrangedSubview(source)

        contentStack.addArrangedSubview(makeSection(
            title: "Original",
            body: vm.originalText,
            color: .secondaryLabelColor
        ))

        targetTextToApply = vm.bestTextToUse
        currentAppURL = presentation.appURL
        replaceDraftHandler = presentation.replaceDraft

        let allErrors = vm.grammarErrors + vm.mechanicalCorrections + vm.optionalSuggestions
        let highlightedCorrected = makeHighlightedAttributedString(
            original: vm.originalText,
            corrected: vm.bestTextToUse,
            errors: allErrors
        )

        contentStack.addArrangedSubview(makeAttributedSection(
            title: vm.headerTitle,
            attributedBody: highlightedCorrected
        ))

        if !vm.grammarErrors.isEmpty {
            let body = vm.grammarErrors.map { "• " + $0.displayText }.joined(separator: "\n")
            contentStack.addArrangedSubview(makeSection(
                title: "Grammar errors",
                body: body,
                color: .labelColor
            ))
        }

        if !vm.mechanicalCorrections.isEmpty {
            let body = vm.mechanicalCorrections.map { "• " + $0.displayText }.joined(separator: "\n")
            contentStack.addArrangedSubview(makeSection(
                title: "Mechanical fixes",
                body: body,
                color: .labelColor
            ))
        }

        if !vm.optionalSuggestions.isEmpty {
            let body = vm.optionalSuggestions.map { "• " + $0.displayText }.joined(separator: "\n")
            contentStack.addArrangedSubview(makeSection(
                title: "Optional suggestions",
                body: body,
                color: .labelColor
            ))
        }

        if vm.grammarErrors.isEmpty && vm.mechanicalCorrections.isEmpty && vm.optionalSuggestions.isEmpty {
            if let summary = vm.summaryRu, !summary.isEmpty {
                contentStack.addArrangedSubview(makeSection(
                    title: "Why",
                    body: summary,
                    color: .labelColor
                ))
            } else if vm.bestTextToUse == vm.originalText {
                contentStack.addArrangedSubview(makeSection(
                    title: "Why",
                    body: "Всё правильно — грамматических ошибок не найдено.",
                    color: .labelColor
                ))
            }
        }

        if !vm.topicBadges.isEmpty {
            let topicStack = NSStackView()
            topicStack.orientation = .horizontal
            topicStack.spacing = 6
            topicStack.alignment = .centerY
            for topic in vm.topicBadges {
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

    private func makeHighlightedAttributedString(
        original: String,
        corrected: String,
        errors: [FormattedWritingError]
    ) -> NSAttributedString {
        let safeCorrected = corrected.count > 2_500 ? String(corrected.prefix(2_500)) + "…" : corrected
        let attributed = NSMutableAttributedString(
            string: safeCorrected,
            attributes: [
                .font: NSFont.systemFont(ofSize: 13),
                .foregroundColor: NSColor.labelColor
            ]
        )

        let ranges = SentenceDiffHighlighter.computeCorrectionRanges(
            original: original,
            corrected: safeCorrected,
            errors: errors
        )

        let safeLength = (safeCorrected as NSString).length
        for range in ranges {
            guard range.location + range.length <= safeLength else { continue }
            attributed.addAttributes([
                .foregroundColor: NSColor.systemRed,
                .font: NSFont.systemFont(ofSize: 13, weight: .medium)
            ], range: range)
        }

        return attributed
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

    private func makeAttributedSection(title: String, attributedBody: NSAttributedString) -> NSView {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 3
        stack.addArrangedSubview(makeLabel(title, font: .systemFont(ofSize: 12, weight: .semibold)))
        let label = NSTextField(wrappingLabelWithString: "")
        label.attributedStringValue = attributedBody
        label.isSelectable = true
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

    private func scheduleAutoDismiss(seconds: TimeInterval = 6.0) {
        cancelAutoDismiss()
        remainingAutoDismissSeconds = Int(ceil(seconds))
        updateCountdownLabel()
        if remainingAutoDismissSeconds > 2 {
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
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: workItem)
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
        currentDisplayMode = nil
        panel.orderOut(nil)
        showNext()
    }

    @objc private func copyCorrected() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(targetTextToApply, forType: .string)
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
        if replaceDraftHandler(targetTextToApply) {
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
