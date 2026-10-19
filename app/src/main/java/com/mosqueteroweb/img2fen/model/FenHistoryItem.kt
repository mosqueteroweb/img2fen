package com.mosqueteroweb.img2fen.model

import kotlinx.serialization.Serializable

@Serializable
data class FenHistoryItem(
    val id: String,
    val fen: String,
    val timestamp: Long,
    val turn: String = "w",
    val title: String = ""
)
