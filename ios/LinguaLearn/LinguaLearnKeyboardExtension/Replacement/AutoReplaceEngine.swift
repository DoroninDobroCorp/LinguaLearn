import UIKit

public class AutoReplaceEngine {
    @discardableResult
    public static func replace(originalText: String, correctedText: String, proxy: UITextDocumentProxy) -> Bool {
        guard originalText != correctedText else { return true }

        let currentContext = proxy.documentContextBeforeInput ?? ""
        if !currentContext.isEmpty && !currentContext.hasSuffix(originalText) && currentContext != originalText {
            // Stale draft guard: draft has changed while analysis was pending.
            // Copy corrected text to pasteboard and do not delete modified characters.
            UIPasteboard.general.string = correctedText
            return false
        }

        let deleteCount = originalText.count
        for _ in 0..<deleteCount {
            proxy.deleteBackward()
        }

        proxy.insertText(correctedText)
        return true
    }
}
