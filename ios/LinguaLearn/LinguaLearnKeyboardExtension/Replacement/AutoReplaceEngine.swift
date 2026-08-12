import UIKit

public class AutoReplaceEngine {
    public static func replace(originalText: String, correctedText: String, proxy: UITextDocumentProxy) {
        guard originalText != correctedText else { return }

        let deleteCount = originalText.count
        for _ in 0..<deleteCount {
            proxy.deleteBackward()
        }

        proxy.insertText(correctedText)
    }
}
