package com.mosqueteroweb.img2fen.model

import androidx.annotation.DrawableRes
import com.mosqueteroweb.img2fen.R

enum class PieceColor {
    WHITE,
    BLACK,
    NONE
}

enum class PieceType {
    EMPTY,
    PAWN,
    KNIGHT,
    BISHOP,
    ROOK,
    QUEEN,
    KING
}

data class ChessPiece(
    val type: PieceType = PieceType.EMPTY,
    val color: PieceColor = PieceColor.NONE
) {
    val isEmpty: Boolean get() = type == PieceType.EMPTY || color == PieceColor.NONE

    fun toFenChar(): Char? {
        if (isEmpty) return null
        val baseChar = when (type) {
            PieceType.PAWN -> 'P'
            PieceType.KNIGHT -> 'N'
            PieceType.BISHOP -> 'B'
            PieceType.ROOK -> 'R'
            PieceType.QUEEN -> 'Q'
            PieceType.KING -> 'K'
            PieceType.EMPTY -> return null
        }
        return if (color == PieceColor.WHITE) baseChar else baseChar.lowercaseChar()
    }

    @DrawableRes
    fun getDrawableRes(): Int? {
        return when (color) {
            PieceColor.WHITE -> when (type) {
                PieceType.PAWN -> R.drawable.white_pawn
                PieceType.KNIGHT -> R.drawable.white_knight
                PieceType.BISHOP -> R.drawable.white_bishop
                PieceType.ROOK -> R.drawable.white_rook
                PieceType.QUEEN -> R.drawable.white_queen
                PieceType.KING -> R.drawable.white_king
                PieceType.EMPTY -> null
            }
            PieceColor.BLACK -> when (type) {
                PieceType.PAWN -> R.drawable.black_pawn
                PieceType.KNIGHT -> R.drawable.black_knight
                PieceType.BISHOP -> R.drawable.black_bishop
                PieceType.ROOK -> R.drawable.black_rook
                PieceType.QUEEN -> R.drawable.black_queen
                PieceType.KING -> R.drawable.black_king
                PieceType.EMPTY -> null
            }
            PieceColor.NONE -> null
        }
    }

    fun toUnicodeSymbol(): String {
        return when (color) {
            PieceColor.WHITE -> when (type) {
                PieceType.KING -> "♔"
                PieceType.QUEEN -> "♕"
                PieceType.ROOK -> "♖"
                PieceType.BISHOP -> "♗"
                PieceType.KNIGHT -> "♘"
                PieceType.PAWN -> "♙"
                PieceType.EMPTY -> ""
            }
            PieceColor.BLACK -> when (type) {
                PieceType.KING -> "♚"
                PieceType.QUEEN -> "♛"
                PieceType.ROOK -> "♜"
                PieceType.BISHOP -> "♝"
                PieceType.KNIGHT -> "♞"
                PieceType.PAWN -> "♟"
                PieceType.EMPTY -> ""
            }
            PieceColor.NONE -> ""
        }
    }

    companion object {
        val EMPTY = ChessPiece(PieceType.EMPTY, PieceColor.NONE)

        fun fromFenChar(c: Char): ChessPiece {
            val color = if (c.isUpperCase()) PieceColor.WHITE else PieceColor.BLACK
            val type = when (c.uppercaseChar()) {
                'P' -> PieceType.PAWN
                'N' -> PieceType.KNIGHT
                'B' -> PieceType.BISHOP
                'R' -> PieceType.ROOK
                'Q' -> PieceType.QUEEN
                'K' -> PieceType.KING
                else -> PieceType.EMPTY
            }
            return if (type == PieceType.EMPTY) EMPTY else ChessPiece(type, color)
        }

        fun fromLabel(label: String): ChessPiece {
            // Label can be "wr", "bn", "em", "wp", etc.
            if (label.length < 2 || label.startsWith("em", ignoreCase = true)) {
                return EMPTY
            }
            val color = when (label[0].lowercaseChar()) {
                'w' -> PieceColor.WHITE
                'b' -> PieceColor.BLACK
                else -> PieceColor.NONE
            }
            val type = when (label[1].lowercaseChar()) {
                'p' -> PieceType.PAWN
                'n' -> PieceType.KNIGHT
                'b' -> PieceType.BISHOP
                'r' -> PieceType.ROOK
                'q' -> PieceType.QUEEN
                'k' -> PieceType.KING
                else -> PieceType.EMPTY
            }
            return if (color == PieceColor.NONE || type == PieceType.EMPTY) EMPTY else ChessPiece(type, color)
        }
    }
}
