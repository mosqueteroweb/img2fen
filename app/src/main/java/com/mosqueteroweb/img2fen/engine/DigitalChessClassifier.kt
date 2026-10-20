package com.mosqueteroweb.img2fen.engine

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.ChessPiece
import com.mosqueteroweb.img2fen.model.PieceColor
import com.mosqueteroweb.img2fen.model.PieceType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.FloatBuffer
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * DigitalChessClassifier: 100% offline chess tile recognition engine.
 *
 * Uses Microsoft ONNX Runtime with the neural model 'chess-tiles-v2.onnx' (MIT License,
 * Copyright (c) 2026 SORTINO LABS S.R.L. / kibitzo.com / fenshot).
 * See ATTRIBUTION.md for complete third-party licensing notices.
 */
class DigitalChessClassifier(private val context: Context) : AutoCloseable {

    companion object {
        private const val TAG = "DigitalChessClassifier"
        private const val MODEL_ASSET = "chess-tiles-v2.onnx"
        private const val BOARD_PX = 256
        private const val TILE_PX = 32
        private const val TILE_SIZE = TILE_PX * TILE_PX // 1024
        private const val LABELS = "1KQRBNPkqrbnp"
    }

    private val ortEnv: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private var ortSession: OrtSession? = null

    @Synchronized
    private fun getSession(): OrtSession {
        if (ortSession == null) {
            val modelBytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
            val options = OrtSession.SessionOptions()
            ortSession = ortEnv.createSession(modelBytes, options)
            Log.d(TAG, "Loaded ONNX model successfully from assets ($MODEL_ASSET, ${modelBytes.size} bytes)")
        }
        return ortSession!!
    }

    /**
     * Recognizes an 8x8 chessboard position from a square board bitmap.
     * @param boardBitmap Square cropped image of the board.
     * @param activeColor Player turn to set on the resulting FEN.
     * @param autoOrient If true, uses pawn distribution to auto-detect whether Black is at the bottom.
     */
    suspend fun classifyBoard(
        boardBitmap: Bitmap,
        activeColor: PieceColor = PieceColor.WHITE,
        autoOrient: Boolean = true
    ): BoardPosition = withContext(Dispatchers.Default) {
        val session = getSession()

        // 1. Convert boardBitmap to 256x256 grayscale float array in [0, 1]
        val boardGray = extractBoardGrayscale(boardBitmap)

        // 2. Slice 256x256 into 64 tiles in model order: tile k = rank*8 + file
        val tilesInput = boardToTiles(boardGray)

        // 3. Run ONNX Inference
        val inputBuffer = FloatBuffer.wrap(tilesInput)
        val tensor = OnnxTensor.createTensor(ortEnv, inputBuffer, longArrayOf(64, TILE_SIZE.toLong()))

        val (rawGrid, rawConfidences) = tensor.use { inputTensor ->
            val results = session.run(mapOf("tiles" to inputTensor))
            results.use { outputMap ->
                val outputTensor = outputMap.get("probs").get() as OnnxTensor
                val rawProbs = outputTensor.value as Array<FloatArray> // [64, 13]
                parseOutputToGrid(rawProbs)
            }
        }

        // 4. Orientation check (White at bottom vs Black at bottom)
        val finalGrid = if (autoOrient && shouldFlipBoard(rawGrid)) {
            Log.d(TAG, "Auto-orient detected Black at bottom. Flipping board 180 degrees.")
            flipGrid180(rawGrid)
        } else {
            rawGrid
        }

        // 5. Ensure King validity
        val sanitized = sanitizeBoard(finalGrid)

        BoardPosition(
            squares = sanitized,
            activeColor = activeColor
        )
    }

    /**
     * Extracts a 256x256 grayscale float array [0..1] using bilinear resampling.
     */
    private fun extractBoardGrayscale(bitmap: Bitmap): FloatArray {
        val scaled = Bitmap.createScaledBitmap(bitmap, BOARD_PX, BOARD_PX, true)
        val pixels = IntArray(BOARD_PX * BOARD_PX)
        scaled.getPixels(pixels, 0, BOARD_PX, 0, 0, BOARD_PX, BOARD_PX)

        val out = FloatArray(BOARD_PX * BOARD_PX)
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            // ITU-R 601 luma normalized to [0, 1]
            out[i] = (0.299f * r + 0.587f * g + 0.114f * b) / 255f
        }

        if (scaled !== bitmap && !scaled.isRecycled) {
            scaled.recycle()
        }
        return out
    }

    /**
     * Slices the 256x256 board into [64, 1024] model input.
     * Tile k = rank * 8 + file where rank 0 is the bottom rank and file 0 is file a.
     */
    private fun boardToTiles(board: FloatArray): FloatArray {
        val out = FloatArray(64 * TILE_SIZE)
        for (rank in 0 until 8) {
            for (file in 0 until 8) {
                val tile = rank * 8 + file
                val srcY0 = (7 - rank) * TILE_PX
                val srcX0 = file * TILE_PX
                for (y in 0 until TILE_PX) {
                    val srcRow = (srcY0 + y) * BOARD_PX + srcX0
                    val dstRow = tile * TILE_SIZE + y * TILE_PX
                    for (x in 0 until TILE_PX) {
                        out[dstRow + x] = board[srcRow + x]
                    }
                }
            }
        }
        return out
    }

    /**
     * Parses the 64x13 probabilities into an 8x8 ChessPiece grid and confidence scores.
     */
    private fun parseOutputToGrid(probs: Array<FloatArray>): Pair<Array<Array<ChessPiece>>, Array<Array<Float>>> {
        val grid = Array(8) { Array(8) { ChessPiece.EMPTY } }
        val confidences = Array(8) { Array(8) { 0f } }

        for (row in 0 until 8) {
            val rank = 7 - row
            for (col in 0 until 8) {
                val file = col
                val tileIdx = rank * 8 + file
                val tileProbs = probs[tileIdx]

                var bestClass = 0
                var bestProb = -1f
                for (c in 0 until 13) {
                    if (tileProbs[c] > bestProb) {
                        bestProb = tileProbs[c]
                        bestClass = c
                    }
                }

                val char = LABELS[bestClass]
                val piece = pieceFromChar(char)

                grid[row][col] = piece
                confidences[row][col] = bestProb
            }
        }

        return Pair(grid, confidences)
    }

    private fun pieceFromChar(char: Char): ChessPiece {
        return when (char) {
            'P' -> ChessPiece(PieceType.PAWN, PieceColor.WHITE)
            'N' -> ChessPiece(PieceType.KNIGHT, PieceColor.WHITE)
            'B' -> ChessPiece(PieceType.BISHOP, PieceColor.WHITE)
            'R' -> ChessPiece(PieceType.ROOK, PieceColor.WHITE)
            'Q' -> ChessPiece(PieceType.QUEEN, PieceColor.WHITE)
            'K' -> ChessPiece(PieceType.KING, PieceColor.WHITE)
            'p' -> ChessPiece(PieceType.PAWN, PieceColor.BLACK)
            'n' -> ChessPiece(PieceType.KNIGHT, PieceColor.BLACK)
            'b' -> ChessPiece(PieceType.BISHOP, PieceColor.BLACK)
            'r' -> ChessPiece(PieceType.ROOK, PieceColor.BLACK)
            'q' -> ChessPiece(PieceType.QUEEN, PieceColor.BLACK)
            'k' -> ChessPiece(PieceType.KING, PieceColor.BLACK)
            else -> ChessPiece.EMPTY
        }
    }

    /**
     * Heuristic: In standard chess, White pawns advance upwards (lower ranks)
     * and Black pawns downwards (higher ranks).
     * If Black pawns have a strictly lower mean rank than White pawns, the board is inverted.
     */
    private fun shouldFlipBoard(grid: Array<Array<ChessPiece>>): Boolean {
        val whitePawnRanks = mutableListOf<Int>()
        val blackPawnRanks = mutableListOf<Int>()

        for (row in 0 until 8) {
            val rank = 8 - row
            for (col in 0 until 8) {
                val piece = grid[row][col]
                if (piece.type == PieceType.PAWN) {
                    if (piece.color == PieceColor.WHITE) {
                        whitePawnRanks.add(rank)
                    } else {
                        blackPawnRanks.add(rank)
                    }
                }
            }
        }

        if (whitePawnRanks.isEmpty() || blackPawnRanks.isEmpty()) return false
        val meanWhite = whitePawnRanks.average()
        val meanBlack = blackPawnRanks.average()

        // Standard: meanBlack > meanWhite.
        // Inverted: meanWhite > meanBlack.
        return meanWhite > meanBlack
    }

    private fun flipGrid180(grid: Array<Array<ChessPiece>>): Array<Array<ChessPiece>> {
        val flipped = Array(8) { Array(8) { ChessPiece.EMPTY } }
        for (r in 0 until 8) {
            for (c in 0 until 8) {
                flipped[r][c] = grid[7 - r][7 - c]
            }
        }
        return flipped
    }

    private fun sanitizeBoard(grid: Array<Array<ChessPiece>>): Array<Array<ChessPiece>> {
        val sanitized = Array(8) { r ->
            Array(8) { c ->
                var piece = grid[r][c]
                // Pawns cannot be on row 0 (rank 8) or row 7 (rank 1)
                if (piece.type == PieceType.PAWN && (r == 0 || r == 7)) {
                    piece = ChessPiece(PieceType.QUEEN, piece.color)
                }
                piece
            }
        }
        return sanitized
    }

    override fun close() {
        try {
            ortSession?.close()
            ortSession = null
        } catch (e: Exception) {
            Log.w(TAG, "Error closing ORT session", e)
        }
    }
}
