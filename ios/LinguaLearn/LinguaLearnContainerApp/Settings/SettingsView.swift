import SwiftUI

struct SettingsView: View {
    @StateObject private var privacyManager = PrivacyConsentManager()
    @EnvironmentObject var authManager: AuthManager
    @State private var apiUrlInput: String = AppConfig.baseUrl
    @State private var isSavedAlertPresented: Bool = false

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

                Section(header: Text("API Server Endpoint (HTTPS)")) {
                    TextField("https://145.239.82.124.sslip.io/english", text: $apiUrlInput)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .keyboardType(.URL)

                    HStack {
                        Button("Save URL") {
                            AppConfig.setBaseUrl(apiUrlInput)
                            apiUrlInput = AppConfig.baseUrl
                            isSavedAlertPresented = true
                        }
                        .foregroundColor(.blue)

                        Spacer()

                        Button("Reset Default") {
                            AppConfig.clearBaseUrl()
                            apiUrlInput = AppConfig.baseUrl
                        }
                        .foregroundColor(.secondary)
                    }
                }

                Section(header: Text("Device, Diagnostics & Keyboard")) {
                    NavigationLink(destination: DiagnosticsView()) {
                        Label("Diagnostics / Test Connection", systemImage: "stethoscope")
                    }

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
            .alert("API URL Saved", isPresented: $isSavedAlertPresented, actions: {
                Button("OK", role: .cancel) { }
            }, message: {
                Text("API endpoint configured in shared App Group: \(apiUrlInput)")
            })
        }
    }
}

struct DiagnosticsView: View {
    @EnvironmentObject var authManager: AuthManager
    @State private var appVersion: String = "1.0.0"
    @State private var configuredUrl: String = AppConfig.baseUrl
    @State private var backendCommit: String = "Not tested"
    @State private var backendVersion: String = "-"
    @State private var authStatus: String = "Checking..."
    @State private var deviceTokenStatus: String = "Checking..."
    @State private var queueDepth: Int = 0
    @State private var syncStatus: String = "Idle"
    @State private var isTesting: Bool = false

    var body: some View {
        Form {
            Section(header: Text("Client & Server Configuration")) {
                HStack {
                    Text("App Version")
                    Spacer()
                    Text(appVersion)
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Configured URL")
                    Spacer()
                    Text(configuredUrl)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.trailing)
                }
                HStack {
                    Text("Backend Commit")
                    Spacer()
                    Text(backendCommit)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                if backendVersion != "-" {
                    HStack {
                        Text("Backend Version")
                        Spacer()
                        Text(backendVersion)
                            .foregroundColor(.secondary)
                    }
                }
            }

            Section(header: Text("Runtime Status")) {
                HStack {
                    Text("Auth Status")
                    Spacer()
                    Text(authStatus)
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Device Token")
                    Spacer()
                    Text(deviceTokenStatus)
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Queue Depth")
                    Spacer()
                    Text("\(queueDepth) items")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Sync Status")
                    Spacer()
                    Text(syncStatus)
                        .foregroundColor(syncStatus.contains("Error") ? .red : (syncStatus.contains("Connected") ? .green : .secondary))
                }
            }

            Section {
                Button(action: testConnection) {
                    HStack {
                        Spacer()
                        if isTesting {
                            ProgressView()
                                .padding(.trailing, 5)
                            Text("Testing Reachability...")
                        } else {
                            Image(systemName: "network")
                            Text("Test Connection")
                        }
                        Spacer()
                    }
                }
                .disabled(isTesting)
            }
        }
        .navigationTitle("Diagnostics")
        .onAppear {
            refreshDiagnostics()
        }
    }

    private func refreshDiagnostics() {
        appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        configuredUrl = AppConfig.baseUrl
        queueDepth = RetryQueue.shared.count
        
        if let user = authManager.currentUser {
            authStatus = "Authenticated (\(user.email))"
        } else {
            authStatus = "Unauthenticated"
        }

        if KeychainAppGroupManager.loadDeviceToken() != nil {
            deviceTokenStatus = "Present"
        } else {
            deviceTokenStatus = "None"
        }
    }

    private func testConnection() {
        isTesting = true
        syncStatus = "Testing reachability..."
        
        let targetUrl = AppConfig.baseUrl
        let healthUrlStr = targetUrl.hasSuffix("/") ? "\(targetUrl)health" : "\(targetUrl)/health"
        guard let healthEndpoint = URL(string: healthUrlStr) else {
            isTesting = false
            syncStatus = "Error: Invalid URL"
            return
        }

        var request = URLRequest(url: healthEndpoint)
        request.httpMethod = "GET"
        request.timeoutInterval = 10

        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isTesting = false
                if let error = error {
                    self.syncStatus = "Error: \(error.localizedDescription)"
                    self.backendCommit = "Error"
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    self.syncStatus = "Error: Invalid response"
                    return
                }

                if (200..<300).contains(httpResponse.statusCode), let data = data {
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        let commit = json["gitCommit"] as? String ?? "unknown"
                        let version = json["appVersion"] as? String ?? "1.0.0"
                        self.backendCommit = commit
                        self.backendVersion = version
                        self.syncStatus = "Connected (HTTP \(httpResponse.statusCode))"
                    } else {
                        self.backendCommit = "unknown"
                        self.syncStatus = "Connected (HTTP \(httpResponse.statusCode))"
                    }
                } else {
                    self.syncStatus = "Error: HTTP \(httpResponse.statusCode)"
                    self.backendCommit = "Error"
                }
            }
        }.resume()
    }
}

