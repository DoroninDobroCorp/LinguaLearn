package com.factory.lingualearn.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue
import kotlin.concurrent.thread

@Composable
fun SettingsScreen(
    authManager: AuthManager,
    onLogout: () -> Unit,
    onNavigateToQueue: (() -> Unit)? = null
) {
    val privacyManager = remember { PrivacyConsentManager(authManager.context) }
    var capturePaused by remember { mutableStateOf(privacyManager.isCapturePaused()) }
    var consentGiven by remember { mutableStateOf(privacyManager.isConsentGiven()) }
    var apiBaseUrlInput by remember { mutableStateOf(authManager.getApiBaseUrl()) }
    var urlSavedMessage by remember { mutableStateOf<String?>(null) }

    var backendCommit by remember { mutableStateOf("Not tested") }
    var syncStatus by remember { mutableStateOf("Idle") }
    var isTestingConnection by remember { mutableStateOf(false) }

    val appVersion = "1.0.0"
    val configuredUrl = authManager.getApiBaseUrl()
    val authStatus = if (authManager.isAuthenticated()) "Authenticated (${authManager.getUserEmail() ?: ""})" else "Unauthenticated"
    val deviceTokenStatus = if (!authManager.getDeviceToken().isNullOrEmpty()) "Present" else "None"
    val queueDepth = remember { BackgroundSyncQueue(authManager.context).getQueueItems().size }

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
                Text("Diagnostics & Test Connection", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Text("App Version: $appVersion", style = MaterialTheme.typography.bodySmall)
                Text("Configured URL: $configuredUrl", style = MaterialTheme.typography.bodySmall)
                Text("Backend Commit: $backendCommit", style = MaterialTheme.typography.bodySmall)
                Text("Auth Status: $authStatus", style = MaterialTheme.typography.bodySmall)
                Text("Device Token: $deviceTokenStatus", style = MaterialTheme.typography.bodySmall)
                Text("Queue Depth: $queueDepth items", style = MaterialTheme.typography.bodySmall)
                Text("Sync Status: $syncStatus", style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            isTestingConnection = true
                            syncStatus = "Testing..."
                            thread {
                                val client = ApiClient(authManager.getApiBaseUrl())
                                val (success, commit) = client.testConnection()
                                val syncQueue = BackgroundSyncQueue(authManager.context)
                                val synced = syncQueue.sync(client)
                                if (success) {
                                    backendCommit = commit
                                    syncStatus = if (synced > 0) "Connected (HTTP 200, synced $synced items)" else "Connected (HTTP 200)"
                                } else {
                                    backendCommit = "Error"
                                    syncStatus = "Error: $commit"
                                }
                                isTestingConnection = false
                            }
                        },
                        enabled = !isTestingConnection,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (isTestingConnection) "Testing..." else "Test Connection")
                    }

                    if (onNavigateToQueue != null) {
                        OutlinedButton(
                            onClick = onNavigateToQueue,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Manage Queue")
                        }
                    }
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

