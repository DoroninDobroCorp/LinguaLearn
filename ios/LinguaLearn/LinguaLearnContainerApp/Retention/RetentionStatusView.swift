import SwiftUI

struct RetentionStatusView: View {
    @StateObject private var retentionManager = RetentionManager()
    @EnvironmentObject var authManager: AuthManager
    @State private var showingExportModal = false
    @State private var showingDeleteConfirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Data Rights & Privacy")
                .font(.headline)

            Text("LinguaLearn English protects your text privacy. Raw captured original text is automatically purged based on your retention preference, while maintaining your learning evidence.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            Divider()

            Button("Export My Data Package (JSON)") {
                retentionManager.exportData()
                showingExportModal = true
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.blue.opacity(0.1))
            .cornerRadius(8)

            Button("Delete Account & All Data") {
                showingDeleteConfirm = true
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(Color.red.opacity(0.1))
            .foregroundColor(.red)
            .cornerRadius(8)

            Spacer()
        }
        .padding()
        .sheet(isPresented: $showingExportModal) {
            ScrollView {
                Text(retentionManager.exportedJson ?? "Loading JSON export...")
                    .font(.caption)
                    .padding()
            }
        }
        .alert("Confirm Account Deletion", isPresented: $showingDeleteConfirm) {
            Button("Delete Permanently", role: .destructive) {
                retentionManager.deleteAccount { success in
                    if success {
                        authManager.logout()
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will cascade deletion across all 11 user data tables. This action cannot be undone.")
        }
    }
}
