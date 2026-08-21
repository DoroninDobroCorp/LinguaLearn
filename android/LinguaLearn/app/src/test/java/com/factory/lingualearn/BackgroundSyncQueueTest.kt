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

    @Test
    fun testDuplicateEventIdPreservedAcrossRetries() {
        val fixedEventId = "fixed-evt-android-retry-001"
        val item = QueueItem(
            eventId = fixedEventId,
            sourceApp = "com.slack",
            originalText = "They was going to the office.",
            sentAt = "2026-08-13T10:00:00Z",
            previewOnly = false,
            retryCount = 0
        )

        // First retry attempt
        val retry1 = item.copy(retryCount = item.retryCount + 1)
        assertEquals(fixedEventId, retry1.eventId)
        assertEquals(1, retry1.retryCount)

        // Second retry attempt
        val retry2 = retry1.copy(retryCount = retry1.retryCount + 1)
        assertEquals(fixedEventId, retry2.eventId)
        assertEquals(2, retry2.retryCount)
    }

    @Test
    fun testDeduplicateQueueItemsByEventId() {
        val eventId = "dedup-evt-77"
        val list = mutableListOf<QueueItem>()

        val item1 = QueueItem(
            eventId = eventId,
            sourceApp = "com.telegram",
            originalText = "Draft message 1",
            sentAt = "2026-08-13T10:00:00Z",
            previewOnly = false
        )
        list.add(item1)

        val item2 = QueueItem(
            eventId = eventId,
            sourceApp = "com.telegram",
            originalText = "Draft message 1",
            sentAt = "2026-08-13T10:00:00Z",
            previewOnly = false
        )

        // Deduplication logic
        val exists = list.any { it.eventId == item2.eventId }
        if (!exists) {
            list.add(item2)
        }

        assertEquals(1, list.size)
        assertEquals(eventId, list.first().eventId)
    }

    @Test
    fun testTerminalStatusAndErrorTracking() {
        val item = QueueItem(
            eventId = "evt-terminal-001",
            sourceApp = "com.slack",
            originalText = "Testing terminal 400 rejection.",
            sentAt = "2026-08-13T10:00:00Z",
            previewOnly = false,
            retryCount = 1,
            lastError = "HTTP 400 Bad Request",
            isTerminal = true
        )

        assertEquals("HTTP 400 Bad Request", item.lastError)
        assertTrue(item.isTerminal)
        assertEquals(1, item.retryCount)
    }

    @Test
    fun testQueueClearAll() {
        val list = mutableListOf<QueueItem>()
        list.add(QueueItem("e1", "app", "text1", "2026-08-13T10:00:00Z", false))
        list.add(QueueItem("e2", "app", "text2", "2026-08-13T10:00:00Z", false))
        assertEquals(2, list.size)
        list.clear()
        assertEquals(0, list.size)
    }
}
