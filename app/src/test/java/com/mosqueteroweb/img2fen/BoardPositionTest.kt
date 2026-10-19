package com.mosqueteroweb.img2fen

import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.ChessPiece
import com.mosqueteroweb.img2fen.model.PieceColor
import com.mosqueteroweb.img2fen.model.PieceType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BoardPositionTest {

    @Test
    fun testInitialPositionFen() {
        val initial = BoardPosition.initial()
        val fen = initial.toFen()
        assertEquals("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", fen)
    }

    @Test
    fun testRoundTripParsing() {
        val originalFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4"
        val position = BoardPosition.fromFen(originalFen)
        assertNotNull(position)
        assertEquals(PieceColor.WHITE, position.activeColor)

        // Square e4 is row 4, col 4 -> white pawn
        val e4Piece = position.getPiece(4, 4)
        assertEquals(PieceType.PAWN, e4Piece.type)
        assertEquals(PieceColor.WHITE, e4Piece.color)

        // Check active color change
        val blackTurnPosition = position.withActiveColor(PieceColor.BLACK)
        assertEquals(PieceColor.BLACK, blackTurnPosition.activeColor)
        assertTrue(blackTurnPosition.toFen().contains(" b "))
    }

    @Test
    fun testSetPieceUpdatesFen() {
        val board = BoardPosition.empty()
        // Place White King on e1 (row 7, col 4) and Black King on e8 (row 0, col 4)
        val withKings = board
            .setPiece(7, 4, ChessPiece(PieceType.KING, PieceColor.WHITE))
            .setPiece(0, 4, ChessPiece(PieceType.KING, PieceColor.BLACK))

        val fen = withKings.toFen()
        assertTrue(fen.startsWith("4k3/8/8/8/8/8/8/4K3"))
    }

    @Test
    fun testPieceFenChars() {
        assertEquals('P', ChessPiece(PieceType.PAWN, PieceColor.WHITE).toFenChar())
        assertEquals('p', ChessPiece(PieceType.PAWN, PieceColor.BLACK).toFenChar())
        assertEquals('N', ChessPiece(PieceType.KNIGHT, PieceColor.WHITE).toFenChar())
        assertEquals('q', ChessPiece(PieceType.QUEEN, PieceColor.BLACK).toFenChar())
        assertEquals(null, ChessPiece.EMPTY.toFenChar())
    }

    @Test
    fun testPieceFromLabel() {
        assertEquals(ChessPiece(PieceType.ROOK, PieceColor.WHITE), ChessPiece.fromLabel("wr"))
        assertEquals(ChessPiece(PieceType.KNIGHT, PieceColor.BLACK), ChessPiece.fromLabel("bn"))
        assertEquals(ChessPiece.EMPTY, ChessPiece.fromLabel("em"))
        assertEquals(ChessPiece.EMPTY, ChessPiece.fromLabel("xyz"))
    }
}
