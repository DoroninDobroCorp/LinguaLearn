package com.factory.lingualearn.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.factory.lingualearn.auth.AuthManager

@Composable
fun SettingsScreen(
    authManager: AuthManager,
    onLogout: () -> Unit
) {
    val privacyManager = remember { PrivacyConsentManager(authManager.context) }
    var capturePaused by remember { mutableStateOf(privacyManager.isCapturePaused()) }
    var consentGiven by remember { mutableStateOf(privacyManager.isConsentGiven()) }
    var apiBaseUrlInput by remember { mutableStateOf(authManager.getApiBaseUrl()) }
    var urlSavedMessage by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Settings & Privacy", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Backend API Configuration", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = apiBaseUrlInput,
                    onValueChange = { apiBaseUrlInput = it },
                    label = { Text("HTTPS API Base URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = {
                        val cleanUrl = apiBaseUrlInput.trim()
                        if (cleanUrl.isNotEmpty()) {
                            authManager.setApiBaseUrl(cleanUrl)
                            urlSavedMessage = "API URL saved successfully."
                        }
                    }
                ) {
                    Text("Save API URL")
                }
                urlSavedMessage?.let { msg ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(msg, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Capture Controls", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Pause IME Writing Analysis")
                    Switch(
                        checked = capturePaused,
                        onCheckedChange = {
                            capturePaused = it
                            privacyManager.setCapturePaused(it)
                        }
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Writing Practice Consent")
                    Switch(
                        checked = consentGiven,
                        onCheckedChange = {
                            consentGiven = it
                            privacyManager.setConsentGiven(it)
                        }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Account", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(4.dp))
                Text("Logged in as: ${authManager.getUserEmail() ?: "User"}")
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = {
                        authManager.logout()
                        onLogout()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Log Out")
                }
            }
        }
    }
}

