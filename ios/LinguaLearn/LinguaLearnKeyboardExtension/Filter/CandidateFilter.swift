import Foundation
import UIKit

public struct CandidateFilterResult {
    public let accepted: Bool
    public let reason: String?

    public static func allow() -> CandidateFilterResult {
        return CandidateFilterResult(accepted: true, reason: nil)
    }

    public static func reject(reason: String) -> CandidateFilterResult {
        return CandidateFilterResult(accepted: false, reason: reason)
    }
}

public struct InputFieldContext {
    public let isSecureTextEntry: Bool
    public let accessibilityLabel: String?
    public let placeholder: String?
    public let returnKeyType: UIReturnKeyType

    public init(
        isSecureTextEntry: Bool = false,
        accessibilityLabel: String? = nil,
        placeholder: String? = nil,
        returnKeyType: UIReturnKeyType = .default
    ) {
        self.isSecureTextEntry = isSecureTextEntry
        self.accessibilityLabel = accessibilityLabel
        self.placeholder = placeholder
        self.returnKeyType = returnKeyType
    }
}

public class CandidateFilter {
    private static let secureKeywords = [
        "secure", "password", "passcode", "secret", "one-time code", "verification code", "pin", "cvv"
    ]

    private static let codeKeywords = [
        "const ", "let ", "var ", "function", "=>", "import ", "export ", "class ", "def ", "return ", "console.log"
    ]

    public static func isSecureField(_ context: InputFieldContext) -> Bool {
        if context.isSecureTextEntry {
            return true
        }

        let combined = "\(context.accessibilityLabel ?? "") \(context.placeholder ?? "")".lowercased()
        for keyword in secureKeywords {
            if combined.contains(keyword) {
                return true
            }
        }
        return false
    }

    public static func containsCyrillic(_ text: String) -> Bool {
        let cyrillicPattern = "[\\u0400-\\u04FF]"
        return text.range(of: cyrillicPattern, options: .regularExpression) != nil
    }

    public static func isUrlOrEmail(_ text: String) -> Bool {
        let urlPattern = "https?://[^\\s]+"
        let emailPattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return text.range(of: urlPattern, options: .regularExpression) != nil ||
               text.range(of: emailPattern, options: .regularExpression) != nil
    }

    public static func isCodeOrCommand(_ text: String) -> Bool {
        for keyword in codeKeywords {
            if text.contains(keyword) {
                return true
            }
        }
        if text.contains("{") && text.contains("}") {
            return true
        }
        if text.contains("()") || text.contains("[]") {
            return true
        }
        return false
    }

    public static func hasSentenceTerminator(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let lastChar = trimmed.last else { return false }
        return lastChar == "." || lastChar == "!" || lastChar == "?"
    }

    public static func evaluate(text: String, context: InputFieldContext? = nil) -> CandidateFilterResult {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return .reject(reason: "empty")
        }

        if let ctx = context, isSecureField(ctx) {
            return .reject(reason: "secure_field")
        }

        if containsCyrillic(trimmed) {
            return .reject(reason: "contains_cyrillic")
        }

        if isUrlOrEmail(trimmed) {
            return .reject(reason: "url_or_email")
        }

        if isCodeOrCommand(trimmed) {
            return .reject(reason: "code_or_command")
        }

        let words = trimmed.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        let hasTerminator = hasSentenceTerminator(trimmed)

        if !hasTerminator && words.count < 3 {
            return .reject(reason: "no_sentence_terminator")
        }

        return .allow()
    }
}
