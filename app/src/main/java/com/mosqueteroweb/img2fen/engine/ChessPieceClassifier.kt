package com.mosqueteroweb.img2fen.engine

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.common.model.LocalModel
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeler
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.custom.CustomImageLabelerOptions
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.ChessPiece
import com.mosqueteroweb.img2fen.model.PieceColor
import com.mosqueteroweb.img2fen.model.PieceType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

class ChessPieceClassifier(private val context: Context) {

    private val imageLabeler: ImageLabeler by lazy {
        val localModel = LocalModel.Builder()
            .setAssetFilePath("chess-piece-recognizer.tflite")
            .build()

        val options = CustomImageLabelerOptions.Builder(localModel)
            .setConfidenceThreshold(0.005f)
            .setMaxResultCount(13)
            .build()
        ImageLabeling.getClient(options)
    }

    /**
     * Recognizes an 8x8 chessboard from a cropped square bitmap.
     * @param boardBitmap Top-down square image of the board.
     * @param activeColor Whose turn it is (White or Black).
     */
    suspend fun classifyBoard(boardBitmap: Bitmap, activeColor: PieceColor = PieceColor.WHITE): BoardPosition = withContext(Dispatchers.Default) {
        val tiles = BoardCropper.sliceIntoSquares(boardBitmap)
        val recognizedGrid = Array(8) { Array(8) { ChessPiece.EMPTY } }
        val confidenceGrid = Array(8) { Array(8) { 0f } }

        for (row in 0 until 8) {
            for (col in 0 until 8) {
                val tile = tiles[row][col]
                val (piece, confidence) = classifySingleTile(tile)
                recognizedGrid[row][col] = piece
                confidenceGrid[row][col] = confidence
            }
        }

        sanitizeBoard(recognizedGrid, confidenceGrid, activeColor)
    }

    private suspend fun classifySingleTile(tile: Bitmap): Pair<ChessPiece, Float> = suspendCancellableCoroutine { cont ->
        try {
            val inputImage = InputImage.fromBitmap(tile, 0)
            imageLabeler.process(inputImage)
                .addOnSuccessListener { labels ->
                    if (labels.isEmpty()) {
                        cont.resume(Pair(ChessPiece.EMPTY, 0f))
                        return@addOnSuccessListener
                    }

                    // Look for best match among the labels
                    var bestPiece = ChessPiece.EMPTY
                    var bestConfidence = 0f

                    for (label in labels) {
                        val text = label.text.trim().lowercase()
                        val conf = label.confidence

                        // The model labels are typically "em", "wr", "wn", "wb", "wk", "wq", "wp", "br", "bn", "bb", "bk", "bq", "bp"
                        val piece = ChessPiece.fromLabel(text)
                        if (conf > bestConfidence) {
                            bestConfidence = conf
                            bestPiece = piece
                        }
                    }

                    cont.resume(Pair(bestPiece, bestConfidence))
                }
                .addOnFailureListener { e ->
                    Log.w("ChessClassifier", "Tile recognition failed, falling back to empty", e)
                    cont.resume(Pair(ChessPiece.EMPTY, 0f))
                }
        } catch (e: Exception) {
            Log.e("ChessClassifier", "Error processing tile", e)
            cont.resume(Pair(ChessPiece.EMPTY, 0f))
        }
    }

    /**
     * Validates and applies chess rules to eliminate false positives:
     * - Pawns cannot be on Rank 8 (row 0) or Rank 1 (row 7).
     * - Ensures exactly 1 White King and 1 Black King if detected.
     */
    private fun sanitizeBoard(
        grid: Array<Array<ChessPiece>>,
        confidences: Array<Array<Float>>,
        activeColor: PieceColor
    ): BoardPosition {
        val sanitized = Array(8) { r ->
            Array(8) { c ->
                var piece = grid[r][c]

                // Rule 1: No pawns on first and last rank
                if (piece.type == PieceType.PAWN && (r == 0 || r == 7)) {
                    piece = ChessPiece(PieceType.QUEEN, piece.color)
                }

                piece
            }
        }

        // Rule 2: Keep only the single most confident King for each color if multiple detected
        keepSingleKing(sanitized, confidences, PieceColor.WHITE)
        keepSingleKing(sanitized, confidences, PieceColor.BLACK)

        return BoardPosition(
            squares = sanitized,
            activeColor = activeColor
        )
    }

    private fun keepSingleKing(
        grid: Array<Array<ChessPiece>>,
        confidences: Array<Array<Float>>,
        color: PieceColor
    ) {
        val kingPositions = mutableListOf<Pair<Int, Int>>()
        for (r in 0 until 8) {
            for (c in 0 until 8) {
                if (grid[r][c] == ChessPiece(PieceType.KING, color)) {
                    kingPositions.add(Pair(r, c))
                }
            }
        }

        if (kingPositions.size > 1) {
            // Find the one with highest confidence
            val best = kingPositions.maxByOrNull { confidences[it.first][it.second] }
            for (pos in kingPositions) {
                if (pos != best) {
                    grid[pos.first][pos.second] = ChessPiece.EMPTY
                }
            }
        }
    }
}
