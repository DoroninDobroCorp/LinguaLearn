package com.factory.lingualearn.ime.net

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

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
    val changed: Boolean,
    val summaryRu: String?,
    val errors: List<AnalysisError>,
    val topicEvidence: List<TopicEvidence>
)

data class AnalysisError(
    val original: String,
    val correction: String,
    val explanationRu: String,
    val topic: String,
    val confidence: Double
)

data class TopicEvidence(
    val topic: String,
    val outcome: String,
    val confidence: Double,
    val explanationRu: String
)

class ApiClient(private val baseUrl: String = "http://127.0.0.1:3001") {

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
                        confidence = errObj.optDouble("confidence", 1.0)
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
            changed = json.optBoolean("changed", false),
            summaryRu = if (json.has("summaryRu") && !json.isNull("summaryRu")) json.getString("summaryRu") else null,
            errors = errorsList,
            topicEvidence = topicList
        )
    }
}
