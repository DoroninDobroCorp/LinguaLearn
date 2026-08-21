import XCTest
import UIKit
@testable import LinguaLearnContainerApp

final class MockTextDocumentProxy: NSObject, UITextDocumentProxy {
    var documentContextBeforeInput: String?
    var documentContextAfterInput: String?
    var selectedText: String?
    var documentInputMode: UITextInputMode?
    var documentIdentifier: UUID = UUID()
    var hasText: Bool { !(documentContextBeforeInput?.isEmpty ?? true) }

    var insertedTexts: [String] = []
    var deleteCount: Int = 0

    init(initialText: String = "") {
        self.documentContextBeforeInput = initialText
    }

    func adjustTextPosition(byCharacterOffset offset: Int) {}

    func setMarkedText(_ markedText: String, selectedRange: NSRange) {}

    func unmarkText() {}

    func insertText(_ text: String) {
        insertedTexts.append(text)
        documentContextBeforeInput = (documentContextBeforeInput ?? "") + text
    }

    func deleteBackward() {
        deleteCount += 1
        if let current = documentContextBeforeInput, !current.isEmpty {
            documentContextBeforeInput = String(current.dropLast())
        }
    }
}

final class AutoReplaceEngineTests: XCTestCase {

    func testReplaceUnchangedDraftSucceeds() {
        let original = "She dont know"
        let corrected = "She doesn't know"
        let proxy = MockTextDocumentProxy(initialText: "She dont know")

        let result = AutoReplaceEngine.replace(
            originalText: original,
            correctedText: corrected,
            proxy: proxy
        )

        XCTAssertTrue(result)
        XCTAssertEqual(proxy.deleteCount, original.count)
        XCTAssertEqual(proxy.insertedTexts, [corrected])
        XCTAssertEqual(proxy.documentContextBeforeInput, corrected)
    }

    func testReplaceStaleModifiedDraftFallsBackToClipboardWithoutCorrupting() {
        let original = "She dont know"
        let corrected = "She doesn't know"
        // Learner continued typing something else while request was in-flight
        let proxy = MockTextDocumentProxy(initialText: "She changed the topic completely")

        let result = AutoReplaceEngine.replace(
            originalText: original,
            correctedText: corrected,
            proxy: proxy
        )

        XCTAssertFalse(result)
        XCTAssertEqual(proxy.deleteCount, 0, "Must not delete characters if draft was modified")
        XCTAssertEqual(proxy.insertedTexts.count, 0, "Must not insert text if draft was modified")
        XCTAssertEqual(UIPasteboard.general.string, corrected, "Corrected text must be saved to clipboard")
    }

    func testReplaceIdenticalTextIsNoOp() {
        let text = "Everything is correct."
        let proxy = MockTextDocumentProxy(initialText: text)

        let result = AutoReplaceEngine.replace(
            originalText: text,
            correctedText: text,
            proxy: proxy
        )

        XCTAssertTrue(result)
        XCTAssertEqual(proxy.deleteCount, 0)
        XCTAssertEqual(proxy.insertedTexts.count, 0)
    }
}
