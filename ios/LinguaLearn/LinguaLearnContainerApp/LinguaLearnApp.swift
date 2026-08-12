import SwiftUI

@main
struct LinguaLearnApp: App {
    @StateObject private var authManager = AuthManager()
    @StateObject private var deviceTokenManager = DeviceTokenManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(deviceTokenManager)
        }
    }
}
