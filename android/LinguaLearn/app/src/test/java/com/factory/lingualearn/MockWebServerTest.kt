package com.factory.lingualearn

import com.factory.lingualearn.devices.EncryptedTokenStorage
import com.factory.lingualearn.ime.net.ApiClient
import com.factory.lingualearn.ime.queue.BackgroundSyncQueue
import com.factory.lingualearn.ime.queue.QueueItem
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.UUID

class MockWebServerTest {

    private lateinit var mockWebServer: MockWebServer
    private lateinit var baseUrl: String

    @Before
    fun setUp() {
        mockWebServer = MockWebServer()
        mockWebServer.start()
        baseUrl = mockWebServer.url("/").toString().removeSuffix("/")
    }

    @After
    fun tearDown() {
        mockWebServer.shutdown()
        EncryptedTokenStorage.setTestOverride(null)
    }

    @Test
    fun testLoginFlow200OK() {
        val jsonResponse = """
            {
                "user": {
                    "id": 10,
                    "email": "user@example.com",
                    "role": "user"
                }
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Set-Cookie", "lingua_session=sess-mock-cookie-123; Path=/; HttpOnly")
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val res = client.login("user@example.com", "secret123")

        assertTrue(res.success)
        assertEquals("sess-mock-cookie-123", res.sessionToken)
        assertEquals("user@example.com", res.userEmail)
        assertEquals(10, res.userId)

        val request = mockWebServer.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/auth/login", request.path)
    }

    @Test
    fun testLoginFlow401Unauthorized() {
        val jsonResponse = """{"error": "Invalid credentials"}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val res = client.login("user@example.com", "wrongpassword")

        assertFalse(res.success)
        assertEquals("Invalid credentials", res.error)
    }

    @Test
    fun testLoginFlow429RateLimited() {
        val jsonResponse = """{"error": "Too many failed login attempts. Try again in 15 minutes."}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(429)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val res = client.login("user@example.com", "wrongpassword")

        assertFalse(res.success)
        assertTrue(res.error?.contains("Too many failed login attempts") == true)
    }

    @Test
    fun testCreateDeviceTokenFlow201Created() {
        val jsonResponse = """
            {
                "id": "dev-tok-99",
                "token": "token_placeholder_123",
                "device_name": "Pixel 8 Pro",
                "created_at": "2026-08-13T12:00:00Z"
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val res = client.createDeviceToken("sess-mock-cookie-123", "Pixel 8 Pro")

        assertTrue(res.success)
        assertEquals("token_placeholder_123", res.token)
        assertEquals("dev-tok-99", res.tokenId)
        assertEquals("Pixel 8 Pro", res.deviceName)

        val request = mockWebServer.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/devices/tokens", request.path)
        assertEquals("lingua_session=sess-mock-cookie-123", request.getHeader("Cookie"))
    }

    @Test
    fun testCreateDeviceTokenFlow401Unauthorized() {
        val jsonResponse = """{"error": "Unauthorized session"}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val res = client.createDeviceToken("invalid-sess", "Pixel 8")

        assertFalse(res.success)
        assertEquals("Unauthorized session", res.error)
    }

    @Test
    fun testAnalyzeWriting200OKClearError() {
        val jsonResponse = """
            {
                "schemaVersion": 1,
                "eventId": "evt-mock-001",
                "sampleId": 100,
                "previewOnly": false,
                "accepted": true,
                "rejectionReason": null,
                "sourceApp": "com.slack",
                "originalText": "She don't know the answer.",
                "correctedText": "She doesn't know the answer.",
                "recommendedText": "She doesn't know the answer.",
                "assessment": "clear_error",
                "hasClearError": true,
                "changed": true,
                "summaryRu": "Ошибка согласовании подлежащего.",
                "errors": [
                    {
                        "original": "don't",
                        "correction": "doesn't",
                        "explanationRu": "Используйте doesn't для 3-го лица.",
                        "topic": "Subject-verb agreement",
                        "confidence": 0.95,
                        "kind": "grammar",
                        "category": "subject_verb_agreement"
                    }
                ],
                "topicEvidence": []
            }
        """.trimIndent()

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val response = client.analyzeWriting(
            deviceToken = "token_placeholder_123",
            eventId = "evt-mock-001",
            sourceApp = "com.slack",
            originalText = "She don't know the answer.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertTrue(response.accepted)
        assertTrue(response.hasClearError)
        assertEquals("clear_error", response.assessment)
        assertEquals("She doesn't know the answer.", response.recommendedText)

        val request = mockWebServer.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/writing/analyze", request.path)
        assertEquals("Bearer token_placeholder_123", request.getHeader("Authorization"))
    }

    @Test
    fun testAnalyzeWriting401UnauthorizedReturnsFailWithoutCrashing() {
        val jsonResponse = """{"error": "Device token revoked"}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val response = client.analyzeWriting(
            deviceToken = "revoked_token",
            eventId = "evt-mock-401",
            sourceApp = "com.whatsapp",
            originalText = "Testing 401 error handling.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertFalse("HTTP 401 response must set accepted=false", response.accepted)
        assertFalse("HTTP 401 response must not claim clear_error", response.hasClearError)
        assertEquals("HTTP 401: Device token revoked", response.rejectionReason)
    }

    @Test
    fun testAnalyzeWriting403ForbiddenHandling() {
        val jsonResponse = """{"error": "Account deactivated"}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val response = client.analyzeWriting(
            deviceToken = "dev_tok",
            eventId = "evt-mock-403",
            sourceApp = "com.slack",
            originalText = "Testing 403 error.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertFalse(response.accepted)
        assertEquals("HTTP 403: Account deactivated", response.rejectionReason)
    }

    @Test
    fun testAnalyzeWriting500ServerErrorHandling() {
        val jsonResponse = """{"error": "Internal database error"}"""

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setBody(jsonResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val response = client.analyzeWriting(
            deviceToken = "dev_tok",
            eventId = "evt-mock-500",
            sourceApp = "com.slack",
            originalText = "Testing 500 error.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertFalse(response.accepted)
        assertEquals("HTTP 500: Internal database error", response.rejectionReason)
    }

    @Test
    fun testAnalyzeWriting502HtmlNonJsonResponse() {
        val htmlResponse = "<html><body>502 Bad Gateway</body></html>"

        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(502)
                .setBody(htmlResponse)
        )

        val client = ApiClient(baseUrl = baseUrl)
        val response = client.analyzeWriting(
            deviceToken = "dev_tok",
            eventId = "evt-mock-502",
            sourceApp = "com.slack",
            originalText = "Testing HTML 502 error.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertFalse(response.accepted)
        assertEquals("HTTP 502", response.rejectionReason)
    }

    @Test
    fun testRevokeDeviceTokenServerFlow() {
        mockWebServer.enqueue(MockResponse().setResponseCode(200).setBody("""{"success": true}"""))

        val client = ApiClient(baseUrl = baseUrl)
        val success = client.revokeDeviceToken("sess-cookie", "dev-tok-1")

        assertTrue(success)

        val request = mockWebServer.takeRequest()
        assertEquals("/api/devices/tokens/dev-tok-1/revoke", request.path)
    }

    @Test
    fun testRevokeDeviceTokenServerFailure() {
        mockWebServer.enqueue(MockResponse().setResponseCode(500).setBody("""{"error": "Server error"}"""))

        val client = ApiClient(baseUrl = baseUrl)
        val success = client.revokeDeviceToken("sess-cookie", "dev-tok-1")

        assertFalse("Server 500 failure during token revocation must return false", success)
    }

    @Test
    fun testTokenRefreshAndAnalysisFullFlow() {
        // Step 1: Login -> get session cookie
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .addHeader("Set-Cookie", "lingua_session=sess-full-flow; Path=/; HttpOnly")
                .setBody("""{"user": {"id": 1, "email": "test@domain.com"}}""")
        )

        // Step 2: Create device token using session cookie
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody("""{"id": "tok-100", "token": "token_placeholder_999"}""")
        )

        // Step 3: Analyze writing using created device token
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"schemaVersion": 1, "eventId": "evt-full-001", "accepted": true, "originalText": "Hello world.", "correctedText": "Hello world.", "changed": false}""")
        )

        val client = ApiClient(baseUrl = baseUrl)

        val loginRes = client.login("test@domain.com", "password123")
        assertTrue(loginRes.success)
        val sessionToken = loginRes.sessionToken!!

        val devRes = client.createDeviceToken(sessionToken, "MacBook Test")
        assertTrue(devRes.success)
        val deviceToken = devRes.token!!

        val analysisRes = client.analyzeWriting(
            deviceToken = deviceToken,
            eventId = "evt-full-001",
            sourceApp = "com.test",
            originalText = "Hello world.",
            sentAt = "2026-08-13T12:00:00Z",
            previewOnly = false
        )

        assertTrue(analysisRes.accepted)
        assertEquals(3, mockWebServer.requestCount)
    }

    private fun createDummyContext(): android.content.Context {
        return object : android.content.ContextWrapper(null) {
            override fun getSharedPreferences(name: String?, mode: Int): android.content.SharedPreferences {
                return TestSharedPreferences()
            }
            override fun getApplicationContext(): android.content.Context {
                return this
            }
            override fun getPackageName(): String {
                return "com.factory.lingualearn"
            }
        }
    }

    @Test
    fun testSyncQueueRetryWithMockWebServerPreservesEventIdAndSentAt() {
        val testPrefs = TestSharedPreferences()
        val syncQueue = BackgroundSyncQueue(
            context = createDummyContext(),
            customPrefs = testPrefs
        )

        val eventId = "evt-retry-preservation-777"
        val sentAt = "2026-08-13T11:22:33Z"
        val deviceToken = "dev_sync_token"

        syncQueue.setDeviceToken(deviceToken)
        syncQueue.enqueue(
            sourceApp = "com.whatsapp",
            originalText = "They was going to the park.",
            previewOnly = false,
            eventId = eventId,
            sentAt = sentAt
        )

        // Mock 1st attempt: 500 Internal Server Error (transient)
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setBody("""{"error": "Temporary server error"}""")
        )

        val client = ApiClient(baseUrl = baseUrl)
        val synced1 = syncQueue.sync(client)

        assertEquals(0, synced1)
        val itemsAfter1 = syncQueue.getQueueItems()
        assertEquals(1, itemsAfter1.size)
        assertEquals(eventId, itemsAfter1[0].eventId)
        assertEquals(sentAt, itemsAfter1[0].sentAt)
        assertEquals(1, itemsAfter1[0].retryCount)

        val req1 = mockWebServer.takeRequest()
        assertTrue(req1.body.readUtf8().contains("evt-retry-preservation-777"))

        // Mock 2nd attempt: 200 OK Success
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"schemaVersion": 1, "eventId": "$eventId", "accepted": true, "originalText": "They was going to the park.", "correctedText": "They were going to the park.", "changed": true}""")
        )

        val synced2 = syncQueue.sync(client)

        assertEquals(1, synced2)
        assertTrue(syncQueue.getQueueItems().isEmpty())

        val req2 = mockWebServer.takeRequest()
        assertTrue(req2.body.readUtf8().contains("evt-retry-preservation-777"))
    }

    @Test
    fun testSyncQueueDropsPermanent4xxError() {
        val testPrefs = TestSharedPreferences()
        val syncQueue = BackgroundSyncQueue(
            context = createDummyContext(),
            customPrefs = testPrefs
        )

        val eventId = "evt-permanent-401"
        syncQueue.setDeviceToken("revoked_device_token")
        syncQueue.enqueue(
            sourceApp = "com.slack",
            originalText = "Testing permanent 401 drop.",
            eventId = eventId
        )

        // Mock response: 401 Unauthorized (Permanent client error)
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"error": "Device token revoked"}""")
        )

        val client = ApiClient(baseUrl = baseUrl)
        val synced = syncQueue.sync(client)

        assertEquals(0, synced)
        // Permanent 4xx should drop item to avoid blocking subsequent queue processing
        assertTrue(syncQueue.getQueueItems().isEmpty())
    }

    @Test
    fun testEncryptedTokenStorageFailClosedWithoutPlaintextFallback() {
        val throwingContext = object : android.content.ContextWrapper(null) {
            override fun getSharedPreferences(name: String?, mode: Int): android.content.SharedPreferences {
                throw java.security.KeyStoreException("Android KeyStore unavailable in JVM test")
            }
            override fun getApplicationContext(): android.content.Context = this
            override fun getPackageName(): String = "com.factory.lingualearn"
        }
        try {
            // JVM environment without Android KeyStore must throw IllegalStateException and fail closed
            EncryptedTokenStorage.getEncryptedSharedPreferences(throwingContext, "secret_test_prefs")
            fail("EncryptedTokenStorage must throw exception when encryption fails")
        } catch (e: IllegalStateException) {
            assertTrue("Message must mention fail-closed without plaintext fallback", e.message?.contains("fail-closed without plaintext fallback") == true)
        }
    }

    private class TestSharedPreferences : android.content.SharedPreferences {
        private val map = mutableMapOf<String, Any?>()

        override fun getAll(): MutableMap<String, *> = map
        override fun getString(key: String?, defValue: String?): String? = map[key] as? String ?: defValue
        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? = @Suppress("UNCHECKED_CAST") (map[key] as? MutableSet<String> ?: defValues)
        override fun getInt(key: String?, defValue: Int): Int = map[key] as? Int ?: defValue
        override fun getLong(key: String?, defValue: Long): Long = map[key] as? Long ?: defValue
        override fun getFloat(key: String?, defValue: Float): Float = map[key] as? Float ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean): Boolean = map[key] as? Boolean ?: defValue
        override fun contains(key: String?): Boolean = map.containsKey(key)
        override fun edit(): android.content.SharedPreferences.Editor = TestEditor(map)
        override fun registerOnSharedPreferenceChangeListener(listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?) {}
        override fun unregisterOnSharedPreferenceChangeListener(listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?) {}

        private class TestEditor(private val targetMap: MutableMap<String, Any?>) : android.content.SharedPreferences.Editor {
            private val tempMap = mutableMapOf<String, Any?>()
            private var clear = false

            override fun putString(key: String?, value: String?): android.content.SharedPreferences.Editor { tempMap[key!!] = value; return this }
            override fun putStringSet(key: String?, values: MutableSet<String>?): android.content.SharedPreferences.Editor { tempMap[key!!] = values; return this }
            override fun putInt(key: String?, value: Int): android.content.SharedPreferences.Editor { tempMap[key!!] = value; return this }
            override fun putLong(key: String?, value: Long): android.content.SharedPreferences.Editor { tempMap[key!!] = value; return this }
            override fun putFloat(key: String?, value: Float): android.content.SharedPreferences.Editor { tempMap[key!!] = value; return this }
            override fun putBoolean(key: String?, value: Boolean): android.content.SharedPreferences.Editor { tempMap[key!!] = value; return this }
            override fun remove(key: String?): android.content.SharedPreferences.Editor { tempMap[key!!] = null; return this }
            override fun clear(): android.content.SharedPreferences.Editor { clear = true; return this }
            override fun commit(): Boolean { apply(); return true }
            override fun apply() {
                if (clear) targetMap.clear()
                for ((k, v) in tempMap) {
                    if (v == null) targetMap.remove(k) else targetMap[k] = v
                }
            }
        }
    }
}
