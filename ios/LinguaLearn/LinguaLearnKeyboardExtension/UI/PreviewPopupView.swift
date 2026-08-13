import UIKit
import SwiftUI

public enum AnalysisTier: String, Codable {
    case clearError = "clear_error"
    case mechanicalOnly = "mechanical_only"
    case acceptable = "acceptable"
    case correct = "correct"

    public var title: String {
        switch self {
        case .clearError:
            return "Grammar Error Found"
        case .mechanicalOnly:
            return "Grammar OK ✓ (Fixes available)"
        case .acceptable:
            return "Grammar OK ✓ (Stylistic suggestion)"
        case .correct:
            return "Grammar OK ✓"
        }
    }

    public var isDetailedCard: Bool {
        return self == .clearError
    }

    public static func resolve(from response: AnalysisResponse) -> AnalysisTier {
        if let raw = response.assessment, let tier = AnalysisTier(rawValue: raw) {
            return tier
        }
        if response.hasClearError == true || !(response.errors ?? []).isEmpty {
            return .clearError
        }
        if !(response.mechanicalCorrections ?? []).isEmpty {
            return .mechanicalOnly
        }
        if !(response.optionalSuggestions ?? []).isEmpty {
            return .acceptable
        }
        return .correct
    }
}

public struct AnalysisPreview {
    public let originalText: String
    public let targetText: String
    public let summaryRu: String
    public let changed: Bool
    public let tier: AnalysisTier

    public var correctedText: String { targetText }

    public init(
        originalText: String,
        targetText: String,
        summaryRu: String,
        changed: Bool,
        tier: AnalysisTier = .clearError
    ) {
        self.originalText = originalText
        self.targetText = targetText
        self.summaryRu = summaryRu
        self.changed = changed
        self.tier = tier
    }

    public init(originalText: String, correctedText: String, summaryRu: String, changed: Bool) {
        self.init(
            originalText: originalText,
            targetText: correctedText,
            summaryRu: summaryRu,
            changed: changed,
            tier: changed ? .clearError : .correct
        )
    }
}

public class PreviewPopupView: UIView {
    private let badgeLabel = UILabel()
    private let summaryLabel = UILabel()
    private let correctedLabel = UILabel()
    private let replaceButton = UIButton(type: .system)
    private let dismissButton = UIButton(type: .system)
    private var autoDismissTimer: Timer?

    public var onReplace: (() -> Void)?
    public var onDismiss: (() -> Void)?

    override public init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }

    required public init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        backgroundColor = UIColor.systemBackground
        layer.cornerRadius = 10
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.15
        layer.shadowRadius = 8
        layer.shadowOffset = CGSize(width: 0, height: 2)

        badgeLabel.font = UIFont.systemFont(ofSize: 12, weight: .bold)
        badgeLabel.textColor = UIColor.systemBlue

        summaryLabel.font = UIFont.systemFont(ofSize: 13, weight: .regular)
        summaryLabel.textColor = UIColor.secondaryLabel
        summaryLabel.numberOfLines = 2

        correctedLabel.font = UIFont.systemFont(ofSize: 15, weight: .bold)
        correctedLabel.textColor = UIColor.systemGreen
        correctedLabel.numberOfLines = 2

        replaceButton.setTitle("Replace", for: .normal)
        replaceButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        replaceButton.addTarget(self, action: #selector(handleReplace), for: .touchUpInside)

        dismissButton.setTitle("Dismiss", for: .normal)
        dismissButton.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .regular)
        dismissButton.setTitleColor(UIColor.secondaryLabel, for: .normal)
        dismissButton.addTarget(self, action: #selector(handleDismiss), for: .touchUpInside)

        let buttonStack = UIStackView(arrangedSubviews: [dismissButton, replaceButton])
        buttonStack.axis = .horizontal
        buttonStack.spacing = 16

        let mainStack = UIStackView(arrangedSubviews: [badgeLabel, correctedLabel, summaryLabel, buttonStack])
        mainStack.axis = .vertical
        mainStack.spacing = 4
        mainStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(mainStack)
        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            mainStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            mainStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            mainStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
        ])
    }

    public func configure(preview: AnalysisPreview) {
        autoDismissTimer?.invalidate()
        autoDismissTimer = nil

        badgeLabel.text = preview.tier.title
        badgeLabel.textColor = preview.tier.isDetailedCard ? UIColor.systemRed : UIColor.systemGreen

        correctedLabel.text = preview.targetText
        correctedLabel.isHidden = preview.targetText.isEmpty || (!preview.changed && !preview.tier.isDetailedCard)

        summaryLabel.text = preview.summaryRu
        summaryLabel.isHidden = preview.summaryRu.isEmpty

        replaceButton.isHidden = !preview.changed

        if !preview.tier.isDetailedCard {
            // Non-clear_error tiers display compact chip UI with auto-dismiss after 2 seconds
            autoDismissTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
                self?.handleDismiss()
            }
        }
    }

    @objc private func handleReplace() {
        autoDismissTimer?.invalidate()
        onReplace?()
    }

    @objc private func handleDismiss() {
        autoDismissTimer?.invalidate()
        onDismiss?()
    }
}
