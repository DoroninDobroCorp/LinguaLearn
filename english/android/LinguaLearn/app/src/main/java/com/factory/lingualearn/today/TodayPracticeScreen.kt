package com.factory.lingualearn.today

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun TodayPracticeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Today's Practice", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Personalized daily practice generated from your writing history.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Daily Exercise 1 of 3", style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Topic: Past Simple (irregular verbs)")
                Spacer(modifier = Modifier.height(12.dp))
                Text("Complete sentence: Yesterday I ___ (go) to the store.", style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = {}) {
                    Text("Submit Practice Answer")
                }
            }
        }
    }
}
