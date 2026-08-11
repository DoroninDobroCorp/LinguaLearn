import Foundation

/// A deliberately small, app-independent allowlist for controls that unambiguously submit text.
///
/// Accessibility hit-testing is noisy: it can return an image inside a button, a toolbar control,
/// or an unrelated element beneath the pointer. Callers should walk to a button ancestor and pass
/// each of its semantic labels separately. This type does not perform fuzzy/substring matching so
/// labels such as "Send later" or "Do not send" cannot trigger capture.
public enum SendControlHeuristic {
    private static let recognizedRole = "AXButton"

    private static let recognizedLabels: Set<String> = [
        "send",
        "send message",
        "send prompt",
        "send reply",
        "send comment",
        "send text",
        "send now",
        "submit",
        "submit message",
        "submit prompt",
        "submit reply",
        "submit comment",
        "submit response",
        "submit form",
        "post",
        "post message",
        "post reply",
        "post comment",
        "отправить",
        "отправить сообщение",
        "отправить запрос",
        "отправить ответ",
        "отправить комментарий",
        "отправить текст",
        "опубликовать",
        "опубликовать сообщение",
        "опубликовать комментарий"
    ]

    /// Returns true only for an AX button with at least one exact recognized semantic label.
    /// Title, description, help, and identifier should be supplied as separate candidates so an
    /// unrelated description cannot be concatenated into an otherwise accepted label.
    public static func recognizes(role: String, labelCandidates: [String]) -> Bool {
        guard role.caseInsensitiveCompare(recognizedRole) == .orderedSame else { return false }
        return labelCandidates.contains { recognizedLabels.contains(normalizedLabel($0)) }
    }

    private static func normalizedLabel(_ rawLabel: String) -> String {
        let camelCaseSeparated = rawLabel.replacingOccurrences(
            of: #"([\p{Ll}\d])(\p{Lu})"#,
            with: "$1 $2",
            options: .regularExpression
        )
        let folded = camelCaseSeparated.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        var tokens = folded
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }

        let roleWords: Set<String> = ["button", "btn", "control", "кнопка"]
        while let first = tokens.first, roleWords.contains(first) { tokens.removeFirst() }
        while let last = tokens.last, roleWords.contains(last) { tokens.removeLast() }
        return tokens.joined(separator: " ")
    }
}
