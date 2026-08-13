import UIKit

public class KeyboardViewController: UIInputViewController {
    public var nextKeyboardButton: UIButton!
    public var checkButton: UIButton!
    public var sendButton: UIButton!
    public var spaceButton: UIButton!
    public var deleteButton: UIButton!
    public var keyButtons: [UIButton] = []
    
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
        view.backgroundColor = UIColor.systemGroupedBackground

        let mainStack = UIStackView()
        mainStack.axis = .vertical
        mainStack.distribution = .fillEqually
        mainStack.spacing = 6
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(mainStack)

        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            mainStack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8),
            mainStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 4),
            mainStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -4)
        ])

        // Keyboard Row 1: Q W E R T Y U I O P
        let row1Keys = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"]
        mainStack.addArrangedSubview(createRowStack(keys: row1Keys))

        // Keyboard Row 2: A S D F G H J K L
        let row2Keys = ["A", "S", "D", "F", "G", "H", "J", "K", "L"]
        mainStack.addArrangedSubview(createRowStack(keys: row2Keys))

        // Keyboard Row 3: Z X C V B N M ⌫
        let row3Keys = ["Z", "X", "C", "V", "B", "N", "M", "⌫"]
        mainStack.addArrangedSubview(createRowStack(keys: row3Keys))

        // Keyboard Row 4: Next, Check, Space, Send
        let row4Stack = UIStackView()
        row4Stack.axis = .horizontal
        row4Stack.distribution = .fillProportionally
        row4Stack.spacing = 6

        self.nextKeyboardButton = UIButton(type: .system)
        self.nextKeyboardButton.setTitle(NSLocalizedString("Next Keyboard", comment: "Title for switching keyboards"), for: [])
        self.nextKeyboardButton.titleLabel?.font = UIFont.systemFont(ofSize: 13, weight: .regular)
        self.nextKeyboardButton.backgroundColor = UIColor.tertiarySystemFill
        self.nextKeyboardButton.layer.cornerRadius = 5
        self.nextKeyboardButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)

        self.checkButton = UIButton(type: .system)
        self.checkButton.setTitle(NSLocalizedString("Check", comment: "Manual check button with previewOnly"), for: .normal)
        self.checkButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        self.checkButton.backgroundColor = UIColor.secondarySystemGroupedBackground
        self.checkButton.setTitleColor(UIColor.systemBlue, for: .normal)
        self.checkButton.layer.cornerRadius = 5
        self.checkButton.addTarget(self, action: #selector(handleCheckTrigger), for: .touchUpInside)

        self.spaceButton = UIButton(type: .system)
        self.spaceButton.setTitle("Space", for: .normal)
        self.spaceButton.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .medium)
        self.spaceButton.backgroundColor = UIColor.secondarySystemGroupedBackground
        self.spaceButton.layer.cornerRadius = 5
        self.spaceButton.addTarget(self, action: #selector(handleSpaceKey), for: .touchUpInside)

        self.sendButton = UIButton(type: .system)
        self.sendButton.setTitle(NSLocalizedString("Send", comment: "Send button for explicit trigger"), for: .normal)
        self.sendButton.titleLabel?.font = UIFont.systemFont(ofSize: 15, weight: .bold)
        self.sendButton.backgroundColor = UIColor.systemBlue
        self.sendButton.setTitleColor(.white, for: .normal)
        self.sendButton.layer.cornerRadius = 5
        self.sendButton.addTarget(self, action: #selector(handleSendTrigger), for: .touchUpInside)

        row4Stack.addArrangedSubview(self.nextKeyboardButton)
        row4Stack.addArrangedSubview(self.checkButton)
        row4Stack.addArrangedSubview(self.spaceButton)
        row4Stack.addArrangedSubview(self.sendButton)

        self.nextKeyboardButton.widthAnchor.constraint(equalTo: row4Stack.widthAnchor, multiplier: 0.20).isActive = true
        self.checkButton.widthAnchor.constraint(equalTo: row4Stack.widthAnchor, multiplier: 0.20).isActive = true
        self.sendButton.widthAnchor.constraint(equalTo: row4Stack.widthAnchor, multiplier: 0.20).isActive = true

        mainStack.addArrangedSubview(row4Stack)
    }

    private func createRowStack(keys: [String]) -> UIStackView {
        let rowStack = UIStackView()
        rowStack.axis = .horizontal
        rowStack.distribution = .fillEqually
        rowStack.spacing = 4

        for key in keys {
            let button = UIButton(type: .system)
            button.setTitle(key, for: .normal)
            button.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .regular)
            button.backgroundColor = UIColor.secondarySystemGroupedBackground
            button.setTitleColor(UIColor.label, for: .normal)
            button.layer.cornerRadius = 5

            if key == "⌫" {
                self.deleteButton = button
                button.addTarget(self, action: #selector(handleDeleteKey), for: .touchUpInside)
            } else {
                button.addTarget(self, action: #selector(handleLetterKey(_:)), for: .touchUpInside)
                keyButtons.append(button)
            }
            rowStack.addArrangedSubview(button)
        }
        return rowStack
    }

    @objc public func handleLetterKey(_ sender: UIButton) {
        guard let letter = sender.title(for: .normal) else { return }
        typeCharacter(letter)
    }

    @objc public func handleSpaceKey() {
        typeCharacter(" ")
    }

    @objc public func handleDeleteKey() {
        textDocumentProxy.deleteBackward()
        currentDraft = textDocumentProxy.documentContextBeforeInput ?? ""
        // Typing alone does NOT automatically send event analysis.
    }

    public func typeCharacter(_ char: String) {
        textDocumentProxy.insertText(char)
        currentDraft = textDocumentProxy.documentContextBeforeInput ?? (currentDraft + char)
        // Typing alone does NOT automatically send event analysis.
    }

    public func typeText(_ text: String) {
        for char in text {
            typeCharacter(String(char))
        }
    }

    override public func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        if let textBefore = textDocumentProxy.documentContextBeforeInput {
            currentDraft = textBefore
        }
        // Typing alone does NOT automatically send event analysis.
        // Analysis event is triggered ONLY on explicit Send/Enter or Check trigger.
    }

    @objc public func handleCheckTrigger() {
        triggerSendEvent(previewOnly: true)
    }

    @objc public func handleSendTrigger() {
        triggerSendEvent(previewOnly: false)
    }

    @objc public func handleReturnKey() {
        textDocumentProxy.insertText("\n")
        triggerSendEvent(previewOnly: false)
    }

    public func triggerSendEvent(previewOnly: Bool = false, explicitText: String? = nil) {
        guard !AppGroupManager.shared.isCapturePaused() else { return }

        let context = InputFieldContext(
            isSecureTextEntry: textDocumentProxy.isSecureTextEntry == true
        )

        let textToSend = explicitText ?? textDocumentProxy.documentContextBeforeInput ?? currentDraft
        guard !textToSend.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let filterResult = CandidateFilter.evaluate(text: textToSend, context: context)
        if filterResult.accepted {
            processCandidateText(textToSend, previewOnly: previewOnly)
        }
    }

    public func processCandidateText(_ text: String, previewOnly: Bool = false) {
        guard let token = AppGroupManager.shared.getDeviceToken() else { return }

        let eventId = UUID().uuidString
        let payload = QueuedWritingPayload(
            schemaVersion: 1,
            eventId: eventId,
            sourceApp: "LinguaLearnKeyboardExtension",
            originalText: text,
            previewOnly: previewOnly
        )
        self.lastSentPayload = payload

        apiClient.analyze(payload: payload, deviceToken: token) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let response):
                    if response.accepted {
                        let tier = AnalysisTier.resolve(from: response)
                        let targetText = (response.recommendedText?.isEmpty == false ? response.recommendedText : response.correctedText) ?? response.correctedText
                        self?.showPreviewPopup(original: text, targetText: targetText, response: response, tier: tier)
                    }
                case .failure:
                    if !previewOnly {
                        self?.retryQueue.enqueue(payload: payload)
                    }
                }
            }
        }
    }

    private func showPreviewPopup(original: String, targetText: String, response: AnalysisResponse, tier: AnalysisTier) {
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

        let isChanged = (original != targetText)
        let preview = AnalysisPreview(
            originalText: original,
            targetText: targetText,
            summaryRu: response.summaryRu,
            changed: isChanged,
            tier: tier
        )

        previewPopup?.configure(preview: preview)
        previewPopup?.isHidden = false

        previewPopup?.onReplace = { [weak self] in
            guard let self = self else { return }
            AutoReplaceEngine.replace(originalText: original, correctedText: targetText, proxy: self.textDocumentProxy)
            self.previewPopup?.isHidden = true
        }

        previewPopup?.onDismiss = { [weak self] in
            self?.previewPopup?.isHidden = true
        }
    }
}
