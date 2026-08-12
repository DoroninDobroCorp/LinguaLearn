import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var deviceTokenManager: DeviceTokenManager
    @State private var selectedTab = 0

    var body: some View {
        Group {
            if authManager.isAuthenticated {
                TabView(selection: $selectedTab) {
                    TodayPracticeView()
                        .tabItem {
                            Label("Today", systemImage: "pencil.and.outline")
                        }
                        .tag(0)

                    InboxView()
                        .tabItem {
                            Label("Inbox", systemImage: "tray.full")
                        }
                        .tag(1)

                    SettingsView()
                        .tabItem {
                            Label("Settings", systemImage: "gearshape")
                        }
                        .tag(2)
                }
            } else {
                LoginView()
            }
        }
    }
}
