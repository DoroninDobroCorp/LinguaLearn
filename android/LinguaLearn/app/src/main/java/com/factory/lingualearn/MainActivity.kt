package com.factory.lingualearn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.auth.LoginScreen
import com.factory.lingualearn.devices.DeviceTokenScreen
import com.factory.lingualearn.inbox.InboxScreen
import com.factory.lingualearn.retention.RetentionStatusScreen
import com.factory.lingualearn.settings.SettingsScreen
import com.factory.lingualearn.today.TodayPracticeScreen

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val authManager = AuthManager(applicationContext)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var isAuthenticated by remember { mutableStateOf(authManager.isAuthenticated()) }

                    if (!isAuthenticated) {
                        LoginScreen(
                            authManager = authManager,
                            onLoginSuccess = { isAuthenticated = true }
                        )
                    } else {
                        MainNavigationScreen(
                            authManager = authManager,
                            onLogout = { isAuthenticated = false }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun MainNavigationScreen(
    authManager: AuthManager,
    onLogout: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    label = { Text("Today") },
                    icon = { Text("📅") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    label = { Text("Inbox") },
                    icon = { Text("📥") }
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    label = { Text("Devices") },
                    icon = { Text("📱") }
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    label = { Text("Retention") },
                    icon = { Text("🔒") }
                )
                NavigationBarItem(
                    selected = selectedTab == 4,
                    onClick = { selectedTab = 4 },
                    label = { Text("Settings") },
                    icon = { Text("⚙️") }
                )
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> TodayPracticeScreen()
                1 -> InboxScreen()
                2 -> DeviceTokenScreen(context = authManager.context)
                3 -> RetentionStatusScreen()
                4 -> SettingsScreen(
                    authManager = authManager,
                    onLogout = onLogout
                )
            }
        }
    }
}
