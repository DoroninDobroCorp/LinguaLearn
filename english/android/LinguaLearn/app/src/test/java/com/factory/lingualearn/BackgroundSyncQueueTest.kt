package com.factory.lingualearn

import com.factory.lingualearn.ime.queue.QueueItem
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class BackgroundSyncQueueTest {

    @Test
    fun testQueueItemCreationAndFields() {
        val eventId = UUID.randomUUID().toString()
        val item = QueueItem(
            eventId = eventId,
            sourceApp = "com.telegram.messenger",
            originalText = "She don't know the answer.",
            sentAt = "2026-08-12T12:00:00Z",
            previewOnly = false,
            retryCount = 0
        )

        assertEquals(eventId, item.eventId)
        assertEquals("com.telegram.messenger", item.sourceApp)
        assertEquals("She don't know the answer.", item.originalText)
        assertFalse(item.previewOnly)
        assertEquals(0, item.retryCount)
    }

    @Test
    fun testIncrementRetryCount() {
        val item = QueueItem(
            eventId = "evt-123",
            sourceApp = "com.whatsapp",
            originalText = "Testing retry queue logic.",
            sentAt = "2026-08-12T12:00:00Z",
            previewOnly = false,
            retryCount = 1
        )

        val updated = item.copy(retryCount = item.retryCount + 1)
        assertEquals(2, updated.retryCount)
    }
}
