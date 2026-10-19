package com.mosqueteroweb.img2fen.data

import android.content.Context
import android.content.SharedPreferences
import com.mosqueteroweb.img2fen.model.FenHistoryItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

class FenHistoryRepository(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("img2fen_history", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private val _historyFlow = MutableStateFlow<List<FenHistoryItem>>(emptyList())
    val historyFlow: StateFlow<List<FenHistoryItem>> = _historyFlow.asStateFlow()

    init {
        loadHistory()
    }

    private fun loadHistory() {
        val raw = prefs.getString(KEY_HISTORY, null)
        if (raw.isNullOrBlank()) {
            _historyFlow.value = emptyList()
            return
        }
        try {
            val list = json.decodeFromString<List<FenHistoryItem>>(raw)
            _historyFlow.value = list.take(MAX_ITEMS)
        } catch (e: Exception) {
            _historyFlow.value = emptyList()
        }
    }

    fun addFen(fen: String, turn: String = "w", title: String = "") {
        val current = _historyFlow.value.toMutableList()
        // Remove if duplicate fen already exists to bump it to top
        current.removeAll { it.fen.trim() == fen.trim() }

        val newItem = FenHistoryItem(
            id = UUID.randomUUID().toString(),
            fen = fen.trim(),
            timestamp = System.currentTimeMillis(),
            turn = turn,
            title = title
        )
        current.add(0, newItem)
        val trimmed = current.take(MAX_ITEMS)

        prefs.edit().putString(KEY_HISTORY, json.encodeToString(trimmed)).apply()
        _historyFlow.value = trimmed
    }

    fun deleteItem(id: String) {
        val current = _historyFlow.value.filter { it.id != id }
        prefs.edit().putString(KEY_HISTORY, json.encodeToString(current)).apply()
        _historyFlow.value = current
    }

    fun clearAll() {
        prefs.edit().remove(KEY_HISTORY).apply()
        _historyFlow.value = emptyList()
    }

    companion object {
        private const val KEY_HISTORY = "recent_fen_items"
        const val MAX_ITEMS = 10
    }
}
