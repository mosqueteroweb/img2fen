package com.mosqueteroweb.img2fen.model

data class BoardPosition(
    val squares: Array<Array<ChessPiece>> = Array(8) { Array(8) { ChessPiece.EMPTY } },
    val activeColor: PieceColor = PieceColor.WHITE,
    val castlingRights: String = "KQkq",
    val enPassant: String = "-",
    val halfmoveClock: Int = 0,
    val fullmoveNumber: Int = 1
) {
    fun getPiece(row: Int, col: Int): ChessPiece {
        if (row !in 0..7 || col !in 0..7) return ChessPiece.EMPTY
        return squares[row][col]
    }

    fun setPiece(row: Int, col: Int, piece: ChessPiece): BoardPosition {
        if (row !in 0..7 || col !in 0..7) return this
        val newSquares = Array(8) { r ->
            Array(8) { c ->
                if (r == row && c == col) piece else squares[r][c]
            }
        }
        return copy(squares = newSquares)
    }

    fun withActiveColor(color: PieceColor): BoardPosition {
        return copy(activeColor = color)
    }

    fun toFen(): String {
        val fenBoard = StringBuilder()
        for (row in 0 until 8) {
            var emptyCount = 0
            for (col in 0 until 8) {
                val piece = squares[row][col]
                val fenChar = piece.toFenChar()
                if (fenChar == null) {
                    emptyCount++
                } else {
                    if (emptyCount > 0) {
                        fenBoard.append(emptyCount)
                        emptyCount = 0
                    }
                    fenBoard.append(fenChar)
                }
            }
            if (emptyCount > 0) {
                fenBoard.append(emptyCount)
            }
            if (row < 7) {
                fenBoard.append('/')
            }
        }

        val turnStr = if (activeColor == PieceColor.BLACK) "b" else "w"
        val validCastling = computeSafeCastling()
        return "$fenBoard $turnStr $validCastling $enPassant $halfmoveClock $fullmoveNumber"
    }

    private fun computeSafeCastling(): String {
        // Simple sanity check for castling: if king is not on e1/e8 or rooks are missing, adjust
        val wkOnE1 = squares[7][4] == ChessPiece(PieceType.KING, PieceColor.WHITE)
        val wrOnA1 = squares[7][0] == ChessPiece(PieceType.ROOK, PieceColor.WHITE)
        val wrOnH1 = squares[7][7] == ChessPiece(PieceType.ROOK, PieceColor.WHITE)

        val bkOnE8 = squares[0][4] == ChessPiece(PieceType.KING, PieceColor.BLACK)
        val brOnA8 = squares[0][0] == ChessPiece(PieceType.ROOK, PieceColor.BLACK)
        val brOnH8 = squares[0][7] == ChessPiece(PieceType.ROOK, PieceColor.BLACK)

        val sb = StringBuilder()
        if (wkOnE1 && wrOnH1 && castlingRights.contains('K')) sb.append('K')
        if (wkOnE1 && wrOnA1 && castlingRights.contains('Q')) sb.append('Q')
        if (bkOnE8 && brOnH8 && castlingRights.contains('k')) sb.append('k')
        if (bkOnE8 && brOnA8 && castlingRights.contains('q')) sb.append('q')

        return if (sb.isEmpty()) "-" else sb.toString()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as BoardPosition
        if (activeColor != other.activeColor) return false
        if (castlingRights != other.castlingRights) return false
        if (enPassant != other.enPassant) return false
        if (halfmoveClock != other.halfmoveClock) return false
        if (fullmoveNumber != other.fullmoveNumber) return false

        for (r in 0 until 8) {
            for (c in 0 until 8) {
                if (squares[r][c] != other.squares[r][c]) return false
            }
        }
        return true
    }

    override fun hashCode(): Int {
        var result = squares.contentDeepHashCode()
        result = 31 * result + activeColor.hashCode()
        result = 31 * result + castlingRights.hashCode()
        result = 31 * result + enPassant.hashCode()
        result = 31 * result + halfmoveClock
        result = 31 * result + fullmoveNumber
        return result
    }

    companion object {
        fun initial(): BoardPosition {
            return fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        }

        fun empty(): BoardPosition {
            return BoardPosition()
        }

        fun fromFen(fen: String): BoardPosition {
            val parts = fen.trim().split("\\s+".toRegex())
            if (parts.isEmpty()) return empty()

            val boardStr = parts[0]
            val rows = boardStr.split('/')
            val squares = Array(8) { Array(8) { ChessPiece.EMPTY } }

            for (r in 0 until minOf(8, rows.size)) {
                val rowStr = rows[r]
                var col = 0
                for (ch in rowStr) {
                    if (col >= 8) break
                    if (ch.isDigit()) {
                        val emptyCount = ch.digitToInt()
                        for (k in 0 until emptyCount) {
                            if (col < 8) {
                                squares[r][col] = ChessPiece.EMPTY
                                col++
                            }
                        }
                    } else {
                        squares[r][col] = ChessPiece.fromFenChar(ch)
                        col++
                    }
                }
            }

            val activeColor = if (parts.size > 1 && parts[1].equals("b", ignoreCase = true)) {
                PieceColor.BLACK
            } else {
                PieceColor.WHITE
            }

            val castling = if (parts.size > 2) parts[2] else "-"
            val ep = if (parts.size > 3) parts[3] else "-"
            val halfmove = if (parts.size > 4) parts[4].toIntOrNull() ?: 0 else 0
            val fullmove = if (parts.size > 5) parts[5].toIntOrNull() ?: 1 else 1

            return BoardPosition(
                squares = squares,
                activeColor = activeColor,
                castlingRights = castling,
                enPassant = ep,
                halfmoveClock = halfmove,
                fullmoveNumber = fullmove
            )
        }
    }
}
