package com.factory.lingualearn.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(
    authManager: AuthManager,
    onLoginSuccess: () -> Unit
) {
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
                // Mock authentication success for container app setup
                authManager.saveSession(email, "ll_session_mock_token")
                authManager.saveDeviceToken("ll_dev_android_mock_token")
                isLoading = false
                onLoginSuccess()
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            Text(if (isSignUp) "Sign Up with Invite" else "Log In")
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
