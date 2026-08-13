package com.factory.lingualearn.ime.net

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class AuthResult(
    val success: Boolean,
    val sessionToken: String? = null,
    val userEmail: String? = null,
    val userId: Int? = null,
    val error: String? = null
)

data class DeviceTokenResult(
    val success: Boolean,
    val tokenId: String? = null,
    val token: String? = null,
    val deviceName: String? = null,
    val createdAt: String? = null,
    val error: String? = null
)

data class MechanicalCorrection(
    val original: String,
    val correction: String,
    val explanationRu: String,
    val kind: String = "mechanical",
    val category: String = "spelling"
)

data class OptionalSuggestion(
    val original: String,
    val suggestion: String,
    val explanationRu: String,
    val kind: String = "style",
    val category: String = "style"
)

data class AnalysisResponse(
    val schemaVersion: Int,
    val eventId: String,
    val sampleId: Int?,
    val previewOnly: Boolean,
    val accepted: Boolean,
    val rejectionReason: String?,
    val sourceApp: String,
    val originalText: String,
    val correctedText: String?,
    val recommendedText: String? = null,
    val assessment: String? = null,
    val hasClearError: Boolean = false,
    val changed: Boolean,
    val summaryRu: String?,
    val errors: List<AnalysisError> = emptyList(),
    val mechanicalCorrections: List<MechanicalCorrection> = emptyList(),
    val optionalSuggestions: List<OptionalSuggestion> = emptyList(),
    val topicEvidence: List<TopicEvidence> = emptyList()
)

data class AnalysisError(
    val original: String,
    val correction: String,
    val explanationRu: String,
    val topic: String,
    val confidence: Double,
    val kind: String? = null,
    val category: String? = null
)

data class TopicEvidence(
    val topic: String,
    val outcome: String,
    val confidence: Double,
    val explanationRu: String
)

class ApiClient(val baseUrl: String = DEFAULT_BASE_URL) {

    companion object {
        const val DEFAULT_BASE_URL = "https://145.239.82.124.sslip.io/english"
        private const val CONNECT_TIMEOUT_MS = 10000
        private const val READ_TIMEOUT_MS = 15000
    }

    fun testConnection(): Pair<Boolean, String> {
        return try {
            val endpoint = if (baseUrl.endsWith("/")) "${baseUrl}health" else "$baseUrl/health"
            val url = URL(endpoint)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            val statusCode = conn.responseCode
            val inputStream = if (statusCode in 200..299) conn.inputStream else conn.errorStream
            val responseStr = BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { it.readText() }
            if (statusCode in 200..299) {
                val json = JSONObject(responseStr)
                val gitCommit = json.optString("gitCommit", "unknown")
                Pair(true, gitCommit)
            } else {
                Pair(false, "HTTP $statusCode")
            }
        } catch (e: Exception) {
            Pair(false, e.message ?: "Connection failed")
        }
    }

    fun login(email: String, password: String): AuthResult {
        return try {
            val url = URL("$baseUrl/api/auth/login")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            conn.doInput = true

            val payload = JSONObject().apply {
                put("email", email)
                put("password", password)
            }

            OutputStreamWriter(conn.outputStream, "UTF-8").use { os ->
                os.write(payload.toString())
                os.flush()
            }

            val statusCode = conn.responseCode
            val inputStream = if (statusCode in 200..299) conn.inputStream else conn.errorStream
            val responseStr = BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { it.readText() }

            if (statusCode in 200..299) {
                val json = JSONObject(responseStr)
                val sessionToken = extractSessionCookie(conn)
                val userObj = json.optJSONObject("user")
                val userEmail = userObj?.optString("email") ?: email
                val userId = userObj?.optInt("id")

                AuthResult(
                    success = true,
                    sessionToken = sessionToken,
                    userEmail = userEmail,
                    userId = userId
                )
            } else {
                val errorMsg = try {
                    JSONObject(responseStr).optString("error", "Login failed (status $statusCode)")
                } catch (e: Exception) {
                    "Login failed (status $statusCode)"
                }
                AuthResult(success = false, error = errorMsg)
            }
        } catch (e: Exception) {
            AuthResult(success = false, error = e.message ?: "Network connection error")
        }
    }

    fun signup(email: String, password: String, inviteCode: String): AuthResult {
        return try {
            val url = URL("$baseUrl/api/auth/signup")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            conn.doInput = true

            val payload = JSONObject().apply {
                put("email", email)
                put("password", password)
                put("inviteCode", inviteCode)
            }

            OutputStreamWriter(conn.outputStream, "UTF-8").use { os ->
                os.write(payload.toString())
                os.flush()
            }

            val statusCode = conn.responseCode
            val inputStream = if (statusCode in 200..299) conn.inputStream else conn.errorStream
            val responseStr = BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { it.readText() }

            if (statusCode in 200..299) {
                val json = JSONObject(responseStr)
                val sessionToken = extractSessionCookie(conn)
                val userObj = json.optJSONObject("user")
                val userEmail = userObj?.optString("email") ?: email
                val userId = userObj?.optInt("id")

                AuthResult(
                    success = true,
                    sessionToken = sessionToken,
                    userEmail = userEmail,
                    userId = userId
                )
            } else {
                val errorMsg = try {
                    JSONObject(responseStr).optString("error", "Signup failed (status $statusCode)")
                } catch (e: Exception) {
                    "Signup failed (status $statusCode)"
                }
                AuthResult(success = false, error = errorMsg)
            }
        } catch (e: Exception) {
            AuthResult(success = false, error = e.message ?: "Network connection error")
        }
    }

    fun createDeviceToken(sessionToken: String, deviceName: String): DeviceTokenResult {
        return try {
            val url = URL("$baseUrl/api/devices/tokens")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (sessionToken.isNotEmpty()) {
                conn.setRequestProperty("Cookie", "lingua_session=$sessionToken")
            }
            conn.doOutput = true
            conn.doInput = true

            val payload = JSONObject().apply {
                put("device_name", deviceName)
            }

            OutputStreamWriter(conn.outputStream, "UTF-8").use { os ->
                os.write(payload.toString())
                os.flush()
            }

            val statusCode = conn.responseCode
            val inputStream = if (statusCode in 200..299) conn.inputStream else conn.errorStream
            val responseStr = BufferedReader(InputStreamReader(inputStream, "UTF-8")).use { it.readText() }

            if (statusCode in 200..299) {
                val json = JSONObject(responseStr)
                val token = json.optString("token", "")
                val idStr = json.opt("id")?.toString() ?: ""
                val devName = json.optString("device_name", deviceName)
                val createdAt = json.optString("created_at", "")

                DeviceTokenResult(
                    success = true,
                    tokenId = idStr,
                    token = token,
                    deviceName = devName,
                    createdAt = createdAt
                )
            } else {
                val errorMsg = try {
                    JSONObject(responseStr).optString("error", "Failed to create device token (status $statusCode)")
                } catch (e: Exception) {
                    "Failed to create device token (status $statusCode)"
                }
                DeviceTokenResult(success = false, error = errorMsg)
            }
        } catch (e: Exception) {
            DeviceTokenResult(success = false, error = e.message ?: "Network error")
        }
    }

    fun revokeDeviceToken(sessionToken: String, tokenId: String): Boolean {
        return try {
            val url = URL("$baseUrl/api/devices/tokens/$tokenId/revoke")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (sessionToken.isNotEmpty()) {
                conn.setRequestProperty("Cookie", "lingua_session=$sessionToken")
            }
            conn.doInput = true

            val statusCode = conn.responseCode
            statusCode in 200..299
        } catch (e: Exception) {
            false
        }
    }

    fun logout(sessionToken: String): Boolean {
        return try {
            val url = URL("$baseUrl/api/auth/logout")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (sessionToken.isNotEmpty()) {
                conn.setRequestProperty("Cookie", "lingua_session=$sessionToken")
            }
            conn.doInput = true

            val statusCode = conn.responseCode
            statusCode in 200..299
        } catch (e: Exception) {
            false
        }
    }

    private fun extractSessionCookie(conn: HttpURLConnection): String? {
        val cookies = conn.headerFields["Set-Cookie"] ?: return null
        for (cookie in cookies) {
            if (cookie.startsWith("lingua_session=")) {
                return cookie.substringAfter("lingua_session=").substringBefore(";")
            }
        }
        return null
    }

    fun analyzeWriting(
        deviceToken: String,
        eventId: String,
        sourceApp: String,
        originalText: String,
        sentAt: String,
        previewOnly: Boolean
    ): AnalysisResponse {
        val url = URL("$baseUrl/api/writing/analyze")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Authorization", "Bearer $deviceToken")
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.doOutput = true
        conn.doInput = true

        val payload = JSONObject().apply {
            put("schemaVersion", 1)
            put("eventId", eventId)
            put("sourceApp", sourceApp)
            put("originalText", originalText)
            put("text", originalText)
            put("sentAt", sentAt)
            put("previewOnly", previewOnly)
        }

        OutputStreamWriter(conn.outputStream, "UTF-8").use { os ->
            os.write(payload.toString())
            os.flush()
        }

        val statusCode = conn.responseCode
        val inputStream = if (statusCode in 200..299) conn.inputStream else conn.errorStream
        val reader = BufferedReader(InputStreamReader(inputStream, "UTF-8"))
        val responseStr = reader.readText()
        reader.close()

        if (statusCode !in 200..299) {
            val errorMsg = try {
                val json = JSONObject(responseStr)
                val errStr = json.optString("error", "")
                if (errStr.isNotEmpty()) "HTTP $statusCode: $errStr" else "HTTP $statusCode"
            } catch (e: Exception) {
                "HTTP $statusCode"
            }
            return AnalysisResponse(
                schemaVersion = 1,
                eventId = eventId,
                sampleId = null,
                previewOnly = previewOnly,
                accepted = false,
                rejectionReason = errorMsg,
                sourceApp = sourceApp,
                originalText = originalText,
                correctedText = null,
                recommendedText = originalText,
                assessment = null,
                hasClearError = false,
                changed = false,
                summaryRu = null,
                errors = emptyList(),
                mechanicalCorrections = emptyList(),
                optionalSuggestions = emptyList(),
                topicEvidence = emptyList()
            )
        }

        val json = JSONObject(responseStr)

        val errorsList = mutableListOf<AnalysisError>()
        if (json.has("errors")) {
            val arr = json.getJSONArray("errors")
            for (i in 0 until arr.length()) {
                val errObj = arr.getJSONObject(i)
                errorsList.add(
                    AnalysisError(
                        original = errObj.optString("original", ""),
                        correction = errObj.optString("correction", ""),
                        explanationRu = errObj.optString("explanationRu", ""),
                        topic = errObj.optString("topic", ""),
                        confidence = errObj.optDouble("confidence", 1.0),
                        kind = if (errObj.has("kind") && !errObj.isNull("kind")) errObj.getString("kind") else null,
                        category = if (errObj.has("category") && !errObj.isNull("category")) errObj.getString("category") else null
                    )
                )
            }
        }

        val mechList = mutableListOf<MechanicalCorrection>()
        if (json.has("mechanicalCorrections")) {
            val arr = json.getJSONArray("mechanicalCorrections")
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                mechList.add(
                    MechanicalCorrection(
                        original = obj.optString("original", ""),
                        correction = obj.optString("correction", ""),
                        explanationRu = obj.optString("explanationRu", ""),
                        kind = obj.optString("kind", "mechanical"),
                        category = obj.optString("category", "spelling")
                    )
                )
            }
        }

        val optList = mutableListOf<OptionalSuggestion>()
        if (json.has("optionalSuggestions")) {
            val arr = json.getJSONArray("optionalSuggestions")
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                optList.add(
                    OptionalSuggestion(
                        original = obj.optString("original", ""),
                        suggestion = if (obj.has("suggestion")) obj.getString("suggestion") else obj.optString("correction", ""),
                        explanationRu = obj.optString("explanationRu", ""),
                        kind = obj.optString("kind", "style"),
                        category = obj.optString("category", "style")
                    )
                )
            }
        }

        val topicList = mutableListOf<TopicEvidence>()
        if (json.has("topicEvidence")) {
            val arr = json.getJSONArray("topicEvidence")
            for (i in 0 until arr.length()) {
                val topObj = arr.getJSONObject(i)
                topicList.add(
                    TopicEvidence(
                        topic = topObj.optString("topic", ""),
                        outcome = topObj.optString("outcome", ""),
                        confidence = topObj.optDouble("confidence", 1.0),
                        explanationRu = topObj.optString("explanationRu", "")
                    )
                )
            }
        }

        val recText = if (json.has("recommendedText") && !json.isNull("recommendedText")) {
            json.getString("recommendedText")
        } else {
            if (json.has("correctedText") && !json.isNull("correctedText")) json.getString("correctedText") else originalText
        }

        val hasClearErr = json.optBoolean("hasClearError", false) || json.optString("assessment", "") == "clear_error"

        return AnalysisResponse(
            schemaVersion = json.optInt("schemaVersion", 1),
            eventId = json.optString("eventId", eventId),
            sampleId = if (json.has("sampleId")) json.getInt("sampleId") else null,
            previewOnly = json.optBoolean("previewOnly", previewOnly),
            accepted = json.optBoolean("accepted", true),
            rejectionReason = if (json.has("rejectionReason") && !json.isNull("rejectionReason")) json.getString("rejectionReason") else null,
            sourceApp = json.optString("sourceApp", sourceApp),
            originalText = json.optString("originalText", originalText),
            correctedText = if (json.has("correctedText") && !json.isNull("correctedText")) json.getString("correctedText") else null,
            recommendedText = recText,
            assessment = if (json.has("assessment") && !json.isNull("assessment")) json.getString("assessment") else null,
            hasClearError = hasClearErr,
            changed = json.optBoolean("changed", false),
            summaryRu = if (json.has("summaryRu") && !json.isNull("summaryRu")) json.getString("summaryRu") else null,
            errors = errorsList,
            mechanicalCorrections = mechList,
            optionalSuggestions = optList,
            topicEvidence = topicList
        )
    }
}

