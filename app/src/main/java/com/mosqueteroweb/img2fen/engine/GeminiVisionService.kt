package com.mosqueteroweb.img2fen.engine

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.PieceColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

class GeminiVisionService(private val context: Context) {
    private val prefs = context.getSharedPreferences("img2fen_gemini", Context.MODE_PRIVATE)

    fun getApiKey(): String {
        return prefs.getString(KEY_API_KEY, "") ?: ""
    }

    fun setApiKey(key: String) {
        prefs.edit().putString(KEY_API_KEY, key.trim()).apply()
    }

    fun hasApiKey(): Boolean {
        return getApiKey().isNotBlank()
    }

    suspend fun recognizeFenFromImage(bitmap: Bitmap, preferredTurn: PieceColor? = null): BoardPosition = withContext(Dispatchers.IO) {
        val apiKey = getApiKey()
        if (apiKey.isBlank()) {
            throw IllegalStateException("No hay clave de API de Gemini configurada.")
        }

        val base64Image = bitmapToBase64(bitmap)
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey"

        val promptText = buildString {
            append("You are an expert chess grandmaster and computer vision specialist. ")
            append("Look at this chess board diagram and output ONLY the valid Forsyth-Edwards Notation (FEN) string for the position. ")
            append("Rules: ")
            append("1. Read rank by rank from 8 down to 1. ")
            append("2. Output ONLY the FEN string (e.g. 'r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 1'). ")
            append("3. Do NOT include markdown code blocks, backticks, or any explanation text. Just the single FEN line.")
            if (preferredTurn != null) {
                append(" 4. Active color is ${if (preferredTurn == PieceColor.BLACK) "black ('b')" else "white ('w')"}.")
            }
        }

        val requestBody = JSONObject().apply {
            val contents = JSONArray().apply {
                val contentObj = JSONObject().apply {
                    val parts = JSONArray().apply {
                        put(JSONObject().apply { put("text", promptText) })
                        put(JSONObject().apply {
                            put("inlineData", JSONObject().apply {
                                put("mimeType", "image/jpeg")
                                put("data", base64Image)
                            })
                        })
                    }
                    put("parts", parts)
                }
                put(contentObj)
            }
            put("contents", contents)
            put("generationConfig", JSONObject().apply {
                put("temperature", 0.0)
                put("maxOutputTokens", 256)
            })
        }

        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20000
            readTimeout = 20000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }

        connection.outputStream.use { os ->
            os.write(requestBody.toString().toByteArray(Charsets.UTF_8))
            os.flush()
        }

        val responseCode = connection.responseCode
        if (responseCode != HttpURLConnection.HTTP_OK) {
            val errorStream = connection.errorStream?.bufferedReader()?.readText() ?: "HTTP $responseCode"
            Log.e("GeminiVision", "Gemini API error: $errorStream")
            throw RuntimeException("Error de Gemini API ($responseCode): $errorStream")
        }

        val responseText = connection.inputStream.bufferedReader().readText()
        val json = JSONObject(responseText)
        val candidates = json.optJSONArray("candidates")
        val content = candidates?.optJSONObject(0)?.optJSONObject("content")
        val parts = content?.optJSONArray("parts")
        val rawFen = parts?.optJSONObject(0)?.optString("text")?.trim()
            ?.replace("`", "")
            ?.lines()?.firstOrNull { it.contains('/') }
            ?: throw RuntimeException("Respuesta no válida de Gemini: $responseText")

        Log.i("GeminiVision", "Recognized FEN: $rawFen")
        BoardPosition.fromFen(rawFen)
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val stream = ByteArrayOutputStream()
        // Resize if excessively large to keep payload small and fast
        val scaled = if (bitmap.width > 1024 || bitmap.height > 1024) {
            val max = maxOf(bitmap.width, bitmap.height)
            val scale = 1024f / max
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
        } else {
            bitmap
        }
        scaled.compress(Bitmap.CompressFormat.JPEG, 85, stream)
        val byteArray = stream.toByteArray()
        return Base64.encodeToString(byteArray, Base64.NO_WRAP)
    }

    companion object {
        private const val KEY_API_KEY = "gemini_api_key"
    }
}
