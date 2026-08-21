package com.factory.lingualearn.queue

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.factory.lingualearn.auth.AuthManager
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue
import com.factory.lingualearn.ime.queue.QueueItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun UnsentEventsScreen(context: Context) {
    val scope = rememberCoroutineScope()
    val authManager = remember { AuthManager(context) }
    val syncQueue = remember { BackgroundSyncQueue(context) }

    var queueItems by remember { mutableStateOf(syncQueue.getQueueItems()) }
    var lastError by remember { mutableStateOf(syncQueue.getLastGlobalError()) }
    var isSyncing by remember { mutableStateOf(false) }
    var syncResultMsg by remember { mutableStateOf<String?>(null) }
    var showDeleteConfirmDialog by remember { mutableStateOf(false) }

    fun refreshQueue() {
        queueItems = syncQueue.getQueueItems()
        lastError = syncQueue.getLastGlobalError()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Unsent Events Queue", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            "Encrypted offline queue for writing analysis. Raw text is never exposed in diagnostics.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Summary Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Queue Status", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(6.dp))
                Text("Pending events: ${queueItems.size}", style = MaterialTheme.typography.bodyMedium)

                if (!lastError.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Last error: $lastError",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                syncResultMsg?.let { msg ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        msg,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            isSyncing = true
                            syncResultMsg = null
                            scope.launch {
                                val syncedCount = withContext(Dispatchers.IO) {
                                    val client = ApiClient(baseUrl = authManager.getApiBaseUrl())
                                    val token = authManager.getDeviceToken() ?: syncQueue.getDeviceToken()
                                    if (!token.isNullOrEmpty()) {
                                        syncQueue.setDeviceToken(token)
                                    }
                                    syncQueue.sync(client)
                                }
                                refreshQueue()
                                syncResultMsg = if (syncedCount > 0) {
                                    "Successfully synchronized $syncedCount event(s)."
                                } else {
                                    "Sync completed (0 delivered)."
                                }
                                isSyncing = false
                            }
                        },
                        enabled = !isSyncing,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (isSyncing) "Syncing..." else "Retry Now")
                    }

                    OutlinedButton(
                        onClick = { showDeleteConfirmDialog = true },
                        enabled = !isSyncing && queueItems.isNotEmpty(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Delete All")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (queueItems.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "Queue is empty. All writing events have been delivered.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Text("Pending Event Items (${queueItems.size})", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(queueItems, key = { it.eventId }) { item ->
                    QueueItemRow(item = item)
                }
            }
        }
    }

    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            title = { Text("Delete All Unsent Events?") },
            text = {
                Text("Are you sure you want to permanently clear the unsent events queue? Any unsent writing samples will be discarded.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        syncQueue.clearAll()
                        refreshQueue()
                        showDeleteConfirmDialog = false
                        syncResultMsg = "Queue cleared successfully."
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete All")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun QueueItemRow(item: QueueItem) {
    val maskedEventId = if (item.eventId.length > 12) {
        item.eventId.take(8) + "…" + item.eventId.takeLast(4)
    } else {
        item.eventId
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    "Event: $maskedEventId",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    if (item.isTerminal) "Terminal Error" else "Retries: ${item.retryCount}/${BackgroundSyncQueue.MAX_RETRIES}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (item.isTerminal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(4.dp))
            Text("Source: ${item.sourceApp}", style = MaterialTheme.typography.bodySmall)
            Text("Timestamp: ${item.sentAt}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            if (!item.lastError.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    "Status: ${item.lastError}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (item.isTerminal) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.error.copy(alpha = 0.8f)
                )
            }
        }
    }
}
