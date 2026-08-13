import UIKit

public class KeyboardViewController: UIInputViewController {
    public var nextKeyboardButton: UIButton!
    public var sendButton: UIButton!
    private var previewPopup: PreviewPopupView?
    private let apiClient = ApiClient()
    private let retryQueue = NetworkRetryQueue()
    public var currentDraft: String = ""
    public var lastSentPayload: QueuedWritingPayload?

    override public func updateViewConstraints() {
        super.updateViewConstraints()
    }

    override public func viewDidLoad() {
        super.viewDidLoad()
        setupKeyboardUI()
        retryQueue.flush()
    }

    private func setupKeyboardUI() {
        self.nextKeyboardButton = UIButton(type: .system)
        self.nextKeyboardButton.setTitle(NSLocalizedString("Next Keyboard", comment: "Title for the button that switches keyboards"), for: [])
        self.nextKeyboardButton.sizeToFit()
        self.nextKeyboardButton.translatesAutoresizingMaskIntoConstraints = false
        self.nextKeyboardButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        self.sendButton = UIButton(type: .system)
        self.sendButton.setTitle(NSLocalizedString("Send", comment: "Send button for explicit trigger"), for: .normal)
        self.sendButton.sizeToFit()
        self.sendButton.translatesAutoresizingMaskIntoConstraints = false
        self.sendButton.addTarget(self, action: #selector(handleSendTrigger), for: .touchUpInside)

        self.view.addSubview(self.nextKeyboardButton)
        self.view.addSubview(self.sendButton)

        self.nextKeyboardButton.leftAnchor.constraint(equalTo: self.view.leftAnchor, constant: 8).isActive = true
        self.nextKeyboardButton.bottomAnchor.constraint(equalTo: self.view.bottomAnchor, constant: -8).isActive = true

        self.sendButton.rightAnchor.constraint(equalTo: self.view.rightAnchor, constant: -8).isActive = true
        self.sendButton.bottomAnchor.constraint(equalTo: self.view.bottomAnchor, constant: -8).isActive = true
    }

    override public func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)

        guard let textBefore = textDocumentProxy.documentContextBeforeInput else { return }
        currentDraft = textBefore

        // Typing alone does NOT automatically send event analysis.
        // Analysis event is triggered ONLY on explicit Send/Enter trigger.
    }

    @objc public func handleSendTrigger() {
        triggerSendEvent()
    }

    @objc public func handleReturnKey() {
        textDocumentProxy.insertText("\n")
        triggerSendEvent()
    }

    public func triggerSendEvent(explicitText: String? = nil) {
        guard !AppGroupManager.shared.isCapturePaused() else { return }

        let context = InputFieldContext(
            isSecureTextEntry: textDocumentProxy.isSecureTextEntry == true
        )

        let textToSend = explicitText ?? textDocumentProxy.documentContextBeforeInput ?? currentDraft
        guard !textToSend.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let filterResult = CandidateFilter.evaluate(text: textToSend, context: context)
        if filterResult.accepted {
            processCandidateText(textToSend)
        }
    }

    public func processCandidateText(_ text: String) {
        guard let token = AppGroupManager.shared.getDeviceToken() else { return }

        let eventId = UUID().uuidString
        let payload = QueuedWritingPayload(
            schemaVersion: 1,
            eventId: eventId,
            sourceApp: "LinguaLearnKeyboardExtension",
            originalText: text,
            previewOnly: false
        )
        self.lastSentPayload = payload

        apiClient.analyze(payload: payload, deviceToken: token) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let response):
                    if response.accepted && response.changed {
                        self?.showPreviewPopup(original: text, response: response)
                    }
                case .failure:
                    self?.retryQueue.enqueue(payload: payload)
                }
            }
        }
    }

    private func showPreviewPopup(original: String, response: AnalysisResponse) {
        if previewPopup == nil {
            let popup = PreviewPopupView(frame: .zero)
            popup.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(popup)
            NSLayoutConstraint.activate([
                popup.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
                popup.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                popup.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.9)
            ])
            previewPopup = popup
        }

        let preview = AnalysisPreview(
            originalText: original,
            correctedText: response.correctedText,
            summaryRu: response.summaryRu,
            changed: response.changed
        )

        previewPopup?.configure(preview: preview)
        previewPopup?.isHidden = false

        previewPopup?.onReplace = { [weak self] in
            guard let self = self else { return }
            AutoReplaceEngine.replace(originalText: original, correctedText: response.correctedText, proxy: self.textDocumentProxy)
            self.previewPopup?.isHidden = true
        }

        previewPopup?.onDismiss = { [weak self] in
            self?.previewPopup?.isHidden = true
        }
    }
}
