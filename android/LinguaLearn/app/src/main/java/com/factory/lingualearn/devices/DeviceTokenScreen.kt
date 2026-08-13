package com.factory.lingualearn.devices

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun DeviceTokenScreen(context: Context) {
    val scope = rememberCoroutineScope()
    val manager = remember { DeviceTokenManager(context) }
    var activeToken by remember { mutableStateOf(manager.getActiveDeviceToken()) }
    var deviceNameInput by remember { mutableStateOf(manager.getActiveDeviceName() ?: "Android Pixel IME") }
    var newlyCreatedToken by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Device Pairing & IME Tokens", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Manage device authorization tokens used by the LinguaLearn IME Keyboard Service.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (activeToken != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Active Device Token", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Status: Active & Authorized", color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            isLoading = true
                            errorMessage = null
                            scope.launch {
                                withContext(Dispatchers.IO) {
                                    manager.revokeActiveDeviceToken()
                                }
                                activeToken = null
                                newlyCreatedToken = null
                                isLoading = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        enabled = !isLoading
                    ) {
                        Text("Revoke Device Token")
                    }
                }
            }
        } else {
            OutlinedTextField(
                value = deviceNameInput,
                onValueChange = { deviceNameInput = it },
                label = { Text("Device Name") },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = {
                    if (deviceNameInput.isBlank()) {
                        errorMessage = "Device name cannot be empty."
                        return@Button
                    }
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        val created = withContext(Dispatchers.IO) {
                            manager.createRealDeviceToken(deviceNameInput.trim(), null)
                        }
                        if (created != null) {
                            activeToken = created.token
                            newlyCreatedToken = created.token
                        } else {
                            errorMessage = "Failed to register device token on server."
                        }
                        isLoading = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                Text("Generate New Device Token")
            }
        }

        errorMessage?.let { err ->
            Spacer(modifier = Modifier.height(12.dp))
            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        newlyCreatedToken?.let { token ->
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Save Device Token (One-time view)", style = MaterialTheme.typography.titleSmall)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(token, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

