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

        // Fit source inside viewport initially (letterboxed/pillarboxed like ContentScale.Fit)
        val baseScale = minOf(viewportSizePx / source.width, viewportSizePx / source.height)
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
     * Crops a specific sub-rectangle defined by corners from the source bitmap and scales it to targetSize.
     */
    fun cropCorners(source: Bitmap, corners: BoardCorners, targetSize: Int = 800): Bitmap {
        val x0 = corners.x0.coerceIn(0f, source.width.toFloat()).toInt()
        val y0 = corners.y0.coerceIn(0f, source.height.toFloat()).toInt()
        val x1 = corners.x1.coerceIn(0f, source.width.toFloat()).toInt()
        val y1 = corners.y1.coerceIn(0f, source.height.toFloat()).toInt()

        val w = maxOf(1, x1 - x0)
        val h = maxOf(1, y1 - y0)
        val cropped = Bitmap.createBitmap(source, x0, y0, w, h)
        return if (w == targetSize && h == targetSize) cropped else Bitmap.createScaledBitmap(cropped, targetSize, targetSize, true)
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
