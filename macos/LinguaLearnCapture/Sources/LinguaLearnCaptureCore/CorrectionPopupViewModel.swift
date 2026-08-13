import Foundation

public struct FormattedWritingError: Equatable, Sendable {
    public let original: String?
    public let correction: String?
    public let explanation: String?
    public let kind: String?
    public let category: String?

    public init(
        original: String? = nil,
        correction: String? = nil,
        explanation: String? = nil,
        kind: String? = nil,
        category: String? = nil
    ) {
        self.original = original
        self.correction = correction
        self.explanation = explanation
        self.kind = kind
        self.category = category
    }

    public var displayText: String {
        let expl = explanation?.trimmingCharacters(in: .whitespacesAndNewlines)
        let orig = original?.trimmingCharacters(in: .whitespacesAndNewlines)
        let corr = correction?.trimmingCharacters(in: .whitespacesAndNewlines)

        if let orig, let corr, !orig.isEmpty, !corr.isEmpty {
            if let expl, !expl.isEmpty {
                return "\(orig) → \(corr): \(expl)"
            } else {
                return "\(orig) → \(corr)"
            }
        }
        if let expl, !expl.isEmpty {
            return expl
        }
        if let corr, !corr.isEmpty {
            return corr
        }
        return orig ?? ""
    }
}

public struct CorrectionPopupViewModel: Equatable, Sendable {
    public let eventID: String
    public let sourceApp: String
    public let originalText: String
    public let correctedText: String
    public let recommendedText: String
    public let bestTextToUse: String
    public let displayMode: PopupDisplayMode
    public let autoDismissSeconds: TimeInterval
    public let isClearError: Bool
    public let isPreviewHotkey: Bool
    public let assessment: String?
    public let summaryRu: String?

    public let grammarErrors: [FormattedWritingError]
    public let mechanicalCorrections: [FormattedWritingError]
    public let optionalSuggestions: [FormattedWritingError]
    public let topicBadges: [String]

    public var headerTitle: String {
        let trimmedBest = bestTextToUse.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedOrig = originalText.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedBest != trimmedOrig || isClearError {
            return "Better version"
        } else {
            return "Correct ✓"
        }
    }

    public init(
        event: CaptureEvent,
        response: WritingAnalyzeResponse,
        isPreviewHotkey: Bool = false
    ) {
        self.eventID = event.eventID
        self.sourceApp = event.sourceApp
        self.originalText = (response.originalText ?? event.text).trimmingCharacters(in: .whitespacesAndNewlines)
        self.correctedText = (response.correctedText ?? event.text).trimmingCharacters(in: .whitespacesAndNewlines)

        let rec = response.recommendedText?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let rec, !rec.isEmpty {
            self.recommendedText = rec
            self.bestTextToUse = rec
        } else if !self.correctedText.isEmpty {
            self.recommendedText = self.correctedText
            self.bestTextToUse = self.correctedText
        } else {
            self.recommendedText = self.originalText
            self.bestTextToUse = self.originalText
        }

        self.isPreviewHotkey = isPreviewHotkey
        self.displayMode = PopupPolicy.displayMode(for: response, isPreviewHotkey: isPreviewHotkey)
        self.autoDismissSeconds = self.displayMode == .compactChip ? 1.8 : 6.0
        self.isClearError = response.isClearError
        self.assessment = response.assessment
        self.summaryRu = response.summaryRu?.trimmingCharacters(in: .whitespacesAndNewlines)

        self.grammarErrors = response.errors.map { err in
            FormattedWritingError(
                original: err.original,
                correction: err.correction,
                explanation: err.displayExplanation,
                kind: err.kind ?? "grammar_error",
                category: err.category
            )
        }

        self.mechanicalCorrections = response.mechanicalCorrections.map { err in
            FormattedWritingError(
                original: err.original,
                correction: err.correction,
                explanation: err.displayExplanation,
                kind: err.kind ?? "mechanical",
                category: err.category
            )
        }

        self.optionalSuggestions = response.optionalSuggestions.map { err in
            FormattedWritingError(
                original: err.original,
                correction: err.correction,
                explanation: err.displayExplanation,
                kind: err.kind ?? "style",
                category: err.category
            )
        }

        var labels: [String: String] = [:]
        for topic in response.errors.compactMap(\.topic) {
            labels[topic] = topic
        }
        for evidence in response.topicEvidence {
            var label = evidence.topic
            if let delta = evidence.scoreDelta {
                label += delta > 0 ? " +\(delta)" : " \(delta)"
            }
            if let score = evidence.newScore { label += " → \(score)/100" }
            labels[evidence.topic] = label
        }
        for change in response.topicChanges {
            guard let topic = change.displayName else { continue }
            var label = topic
            if let delta = change.delta { label += delta > 0 ? " +\(delta)" : " \(delta)" }
            if let score = change.score { label += " → \(score)/100" }
            labels[topic] = label
        }
        self.topicBadges = labels.keys.sorted().prefix(4).compactMap { labels[$0] }
    }
}
