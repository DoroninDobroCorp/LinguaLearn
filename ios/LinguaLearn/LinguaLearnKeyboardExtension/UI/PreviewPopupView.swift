import UIKit
import SwiftUI

public struct AnalysisPreview {
    public let originalText: String
    public let correctedText: String
    public let summaryRu: String
    public let changed: Bool

    public init(originalText: String, correctedText: String, summaryRu: String, changed: Bool) {
        self.originalText = originalText
        self.correctedText = correctedText
        self.summaryRu = summaryRu
        self.changed = changed
    }
}

public class PreviewPopupView: UIView {
    private let summaryLabel = UILabel()
    private let correctedLabel = UILabel()
    private let replaceButton = UIButton(type: .system)
    private let dismissButton = UIButton(type: .system)

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

        let mainStack = UIStackView(arrangedSubviews: [correctedLabel, summaryLabel, buttonStack])
        mainStack.axis = .vertical
        mainStack.spacing = 6
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
        correctedLabel.text = preview.correctedText
        summaryLabel.text = preview.summaryRu
        replaceButton.isHidden = !preview.changed
    }

    @objc private func handleReplace() {
        onReplace?()
    }

    @objc private func handleDismiss() {
        onDismiss?()
    }
}
