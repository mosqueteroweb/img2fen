package com.mosqueteroweb.img2fen.engine

import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.RectF

object BoardCropper {

    /**
     * Crops a square region from the source bitmap based on normalized coordinates (0.0 .. 1.0).
     */
    fun cropNormalized(source: Bitmap, rectNorm: RectF): Bitmap {
        val left = (rectNorm.left * source.width).coerceIn(0f, source.width.toFloat()).toInt()
        val top = (rectNorm.top * source.height).coerceIn(0f, source.height.toFloat()).toInt()
        val right = (rectNorm.right * source.width).coerceIn(0f, source.width.toFloat()).toInt()
        val bottom = (rectNorm.bottom * source.height).coerceIn(0f, source.height.toFloat()).toInt()

        val width = (right - left).coerceAtLeast(1)
        val height = (bottom - top).coerceAtLeast(1)

        return Bitmap.createBitmap(source, left, top, width, height)
    }

    /**
     * Crops the center square from an image if no manual rect is specified.
     */
    fun cropCenterSquare(source: Bitmap): Bitmap {
        val minDim = minOf(source.width, source.height)
        val xOffset = (source.width - minDim) / 2
        val yOffset = (source.height - minDim) / 2
        return Bitmap.createBitmap(source, xOffset, yOffset, minDim, minDim)
    }

    /**
     * Slices a square chessboard bitmap into an 8x8 matrix of tile bitmaps.
     */
    fun sliceIntoSquares(boardBitmap: Bitmap): Array<Array<Bitmap>> {
        val size = minOf(boardBitmap.width, boardBitmap.height)
        val tileSize = size / 8

        val tiles = Array(8) { row ->
            Array(8) { col ->
                val x = col * tileSize
                val y = row * tileSize
                Bitmap.createBitmap(boardBitmap, x, y, tileSize, tileSize)
            }
        }
        return tiles
    }

    /**
     * Rotates a bitmap by a given number of degrees (e.g. 90, 180, 270).
     */
    fun rotate(source: Bitmap, degrees: Float): Bitmap {
        if (degrees % 360f == 0f) return source
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }
}
