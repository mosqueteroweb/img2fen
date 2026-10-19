package com.mosqueteroweb.img2fen.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint

object BoardCropper {

    /**
     * Extracts exactly the contents visible within the square viewport based on pan, zoom and rotation.
     */
    fun extractViewportSquare(
        source: Bitmap,
        viewportSizePx: Float,
        scale: Float,
        offsetX: Float,
        offsetY: Float,
        rotation: Float
    ): Bitmap {
        val targetSize = 800
        val output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)

        // Fit source inside viewport initially
        val baseScale = maxOf(viewportSizePx / source.width, viewportSizePx / source.height)
        val baseLeft = (viewportSizePx - source.width * baseScale) / 2f
        val baseTop = (viewportSizePx - source.height * baseScale) / 2f

        val matrix = Matrix()
        matrix.postScale(baseScale, baseScale)
        matrix.postTranslate(baseLeft, baseTop)

        // User transforms centered on viewport
        val centerX = viewportSizePx / 2f
        val centerY = viewportSizePx / 2f
        matrix.postScale(scale, scale, centerX, centerY)
        matrix.postRotate(rotation, centerX, centerY)
        matrix.postTranslate(offsetX, offsetY)

        // Scale to target output bitmap
        val scaleToOutput = targetSize / viewportSizePx
        matrix.postScale(scaleToOutput, scaleToOutput)

        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        canvas.drawBitmap(source, matrix, paint)

        return output
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
     * Rotates a bitmap by a given number of degrees.
     */
    fun rotate(source: Bitmap, degrees: Float): Bitmap {
        if (degrees % 360f == 0f) return source
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
    }
}
