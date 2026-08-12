import SwiftUI

struct SettingsView: View {
    @StateObject private var privacyManager = PrivacyConsentManager()
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Privacy & Writing Capture")) {
                    Toggle("Pause All Capture", isOn: $privacyManager.capturePaused)
                        .onChange(of: privacyManager.capturePaused) { _ in
                            privacyManager.saveSettings()
                        }

                    Picker("Raw Text Retention", selection: $privacyManager.retentionDays) {
                        Text("Immediate purge (0 days)").tag(0)
                        Text("7 days").tag(7)
                        Text("30 days (default)").tag(30)
                    }
                    .onChange(of: privacyManager.retentionDays) { _ in
                        privacyManager.saveSettings()
                    }
                }

                Section(header: Text("Device & Keyboard")) {
                    NavigationLink(destination: DeviceTokenView()) {
                        Label("Paired Devices & Keyboard Tokens", systemImage: "keyboard")
                    }

                    NavigationLink(destination: RetentionStatusView()) {
                        Label("Retention Status & Account Data", systemImage: "shield.checkmark")
                    }
                }

                Section(header: Text("Account")) {
                    if let user = authManager.currentUser {
                        HStack {
                            Text("Logged in as")
                            Spacer()
                            Text(user.email)
                                .foregroundColor(.secondary)
                        }
                    }

                    Button("Log Out") {
                        authManager.logout()
                    }
                    .foregroundColor(.red)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
