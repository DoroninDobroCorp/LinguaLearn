import SwiftUI

struct TodayPracticeView: View {
    @StateObject private var viewModel = PracticeViewModel()
    @State private var selectedAnswers: [String: String] = [:]

    var body: some View {
        NavigationView {
            VStack {
                if viewModel.isCompleted {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .resizable()
                            .frame(width: 60, height: 60)
                            .foregroundColor(.green)
                        Text("Practice Complete!")
                            .font(.title2)
                            .bold()
                        Text("Your topic mastery scores have been updated.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                } else if viewModel.exercises.isEmpty {
                    Text("Loading today's practice session...")
                        .foregroundColor(.secondary)
                } else {
                    List {
                        ForEach(viewModel.exercises) { exercise in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(exercise.topic)
                                    .font(.caption)
                                    .bold()
                                    .foregroundColor(.blue)

                                Text(exercise.prompt)
                                    .font(.body)

                                if let options = exercise.options {
                                    ForEach(options, id: \.self) { option in
                                        Button(action: {
                                            selectedAnswers[exercise.prompt] = option
                                        }) {
                                            HStack {
                                                Text(option)
                                                Spacer()
                                                if selectedAnswers[exercise.prompt] == option {
                                                    Image(systemName: "checkmark")
                                                }
                                            }
                                        }
                                        .foregroundColor(selectedAnswers[exercise.prompt] == option ? .blue : .primary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    Button("Submit Answers") {
                        let answersArray = viewModel.exercises.map { ex in
                            ["prompt": ex.prompt, "answer": selectedAnswers[ex.prompt] ?? ""]
                        }
                        viewModel.completeSession(userAnswers: answersArray)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .padding()
                }
            }
            .navigationTitle("Today's Practice")
        }
    }
}
