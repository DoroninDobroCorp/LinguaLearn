import SwiftUI

struct InboxView: View {
    @StateObject private var viewModel = InboxViewModel()

    var body: some View {
        NavigationView {
            List(viewModel.samples) { sample in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(sample.sourceApp)
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.gray.opacity(0.2))
                            .cornerRadius(4)

                        Spacer()
                        Text(sample.createdAt)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    if let original = sample.originalText {
                        Text("Original: \(original)")
                            .font(.body)
                            .foregroundColor(.red)
                    }

                    if let corrected = sample.correctedText {
                        Text("Corrected: \(corrected)")
                            .font(.body)
                            .foregroundColor(.green)
                            .bold()
                    }

                    if let summary = sample.summaryRu, !summary.isEmpty {
                        Text(summary)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Button(action: {
                            viewModel.submitFeedback(sampleId: sample.id, feedbackType: "helpful")
                        }) {
                            Label("Helpful", systemImage: "hand.thumbsup")
                                .font(.caption)
                        }

                        Spacer()

                        Button(action: {
                            viewModel.submitFeedback(sampleId: sample.id, feedbackType: "undo_progress")
                        }) {
                            Label("Undo Impact", systemImage: "arrow.uturn.backward")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(.vertical, 4)
            }
            .navigationTitle("Correction Inbox")
            .refreshable {
                viewModel.fetchSamples()
            }
        }
    }
}
