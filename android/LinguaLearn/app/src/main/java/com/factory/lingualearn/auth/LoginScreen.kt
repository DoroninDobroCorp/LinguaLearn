package com.factory.lingualearn.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.factory.lingualearn.ime.net.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun LoginScreen(
    authManager: AuthManager,
    onLoginSuccess: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var isSignUp by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "LinguaLearn English",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = if (isSignUp) "Redeem Invite Code & Join Beta" else "Log in to your account",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )

        if (isSignUp) {
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = inviteCode,
                onValueChange = { inviteCode = it },
                label = { Text("Invite Code") },
                modifier = Modifier.fillMaxWidth()
            )
        }

        errorMessage?.let { error ->
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = {
                if (email.isBlank() || password.isBlank()) {
                    errorMessage = "Please fill in email and password."
                    return@Button
                }
                if (isSignUp && inviteCode.isBlank()) {
                    errorMessage = "Invite code is required."
                    return@Button
                }
                isLoading = true
                errorMessage = null

                scope.launch {
                    val apiClient = ApiClient(baseUrl = authManager.getApiBaseUrl())
                    val cleanEmail = email.trim()
                    val authRes = withContext(Dispatchers.IO) {
                        if (isSignUp) {
                            apiClient.signup(cleanEmail, password, inviteCode.trim())
                        } else {
                            apiClient.login(cleanEmail, password)
                        }
                    }

                    if (!authRes.success || authRes.sessionToken.isNullOrEmpty()) {
                        isLoading = false
                        errorMessage = authRes.error ?: "Authentication failed."
                        return@launch
                    }

                    authManager.saveSession(authRes.userEmail ?: cleanEmail, authRes.sessionToken)

                    // Register real device token via POST /api/devices/tokens
                    val devRes = withContext(Dispatchers.IO) {
                        apiClient.createDeviceToken(authRes.sessionToken, "Android Client IME")
                    }

                    if (devRes.success && !devRes.token.isNullOrEmpty()) {
                        authManager.saveDeviceToken(devRes.token, devRes.tokenId)
                    }

                    isLoading = false
                    onLoginSuccess()
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp
                )
            } else {
                Text(if (isSignUp) "Sign Up with Invite" else "Log In")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        TextButton(onClick = {
            isSignUp = !isSignUp
            errorMessage = null
        }) {
            Text(
                if (isSignUp) "Already have an account? Log In"
                else "Have an invite code? Redeem & Sign Up"
            )
        }
    }
}

