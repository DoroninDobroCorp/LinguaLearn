package com.factory.lingualearn.devices

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun DeviceTokenScreen(context: Context) {
    val manager = remember { DeviceTokenManager(context) }
    var activeToken by remember { mutableStateOf(manager.getActiveDeviceToken()) }
    var deviceNameInput by remember { mutableStateOf("Android Pixel IME") }
    var newlyCreatedToken by remember { mutableStateOf<String?>(null) }

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
                            manager.revokeActiveDeviceToken()
                            activeToken = null
                            newlyCreatedToken = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
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
                    val created = manager.generateDeviceToken(deviceNameInput)
                    activeToken = created.token
                    newlyCreatedToken = created.token
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Generate New Device Token")
            }
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
