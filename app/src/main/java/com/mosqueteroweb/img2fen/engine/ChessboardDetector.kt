package com.mosqueteroweb.img2fen.engine

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class BoardCorners(
    val x0: Float,
    val y0: Float,
    val x1: Float,
    val y1: Float
) {
    val width: Float get() = x1 - x0
    val height: Float get() = y1 - y0
}

data class GrayImage(
    val data: FloatArray,
    val width: Int,
    val height: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is GrayImage) return false
        return width == other.width && height == other.height && data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = width
        result = 31 * result + height
        result = 31 * result + data.contentHashCode()
        return result
    }
}

object ChessboardDetector {

    private const val PEAK_KEEP_RATIO = 0.2
    private const val MIN_SEQ_LEN = 7
    private const val ERR_PX = 5
    private const val MAX_DETECT_DIM = 1200

    /**
     * Converts an Android Bitmap into a Grayscale image (downscaling if too large for speed).
     */
    fun bitmapToGray(bitmap: Bitmap): Pair<GrayImage, Float> {
        val w = bitmap.width
        val h = bitmap.height
        val scale = min(1f, MAX_DETECT_DIM.toFloat() / max(w, h))
        val cw = (w * scale).roundToInt()
        val ch = (h * scale).roundToInt()

        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(bitmap, cw, ch, true)
        } else {
            bitmap
        }

        val pixels = IntArray(cw * ch)
        scaled.getPixels(pixels, 0, cw, 0, 0, cw, ch)

        val gray = FloatArray(cw * ch)
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            gray[i] = 0.299f * r + 0.587f * g + 0.114f * b
        }

        if (scaled !== bitmap && !scaled.isRecycled) {
            scaled.recycle()
        }

        return Pair(GrayImage(gray, cw, ch), scale)
    }

    /**
     * Finds chessboard corners in an Android Bitmap.
     * Returns null if no valid chessboard pattern is detected.
     */
    fun findChessboard(bitmap: Bitmap): BoardCorners? {
        val (gray, scale) = bitmapToGray(bitmap)
        val rawCorners = findChessboardCorners(gray) ?: return null
        val snapped = snapCorners(gray, rawCorners)

        // Rescale corners back to original bitmap dimensions
        return BoardCorners(
            x0 = (snapped.x0 / scale).coerceIn(0f, bitmap.width.toFloat()),
            y0 = (snapped.y0 / scale).coerceIn(0f, bitmap.height.toFloat()),
            x1 = (snapped.x1 / scale).coerceIn(0f, bitmap.width.toFloat()),
            y1 = (snapped.y1 / scale).coerceIn(0f, bitmap.height.toFloat())
        )
    }

    fun findChessboardCorners(img: GrayImage): BoardCorners? {
        val gradY = gradientRows(img)
        val gradX = gradientCols(img)
        val houghRows = houghResponse(gradY, img.width, img.height, isRows = true)
        val houghCols = houghResponse(gradX, img.width, img.height, isRows = false)

        val candidatesY = rankedPeakSequences(houghRows)
        val candidatesX = rankedPeakSequences(houghCols)

        val linesY = candidatesY.firstOrNull()?.trimmed
        val linesX = candidatesX.firstOrNull()?.trimmed

        if (linesX != null && linesY == null) {
            val r = reconstructFromCandidates(img, candidatesX, axisIsX = true)
            return r?.let { repairParity(img, it) }
        }
        if (linesY != null && linesX == null) {
            val r = reconstructFromCandidates(img, candidatesY, axisIsX = false)
            return r?.let { repairParity(img, it) }
        }
        if (linesX == null || linesY == null) return null

        val dx = medianDiff(linesX)
        val dy = medianDiff(linesY)

        val subX = mutableListOf<List<Int>>()
        for (k in 0..linesX.size - 7) subX.add(linesX.subList(k, k + 7))

        val subY = mutableListOf<List<Int>>()
        for (k in 0..linesY.size - 7) subY.add(linesY.subList(k, k + 7))

        var best: BoardCorners? = null
        var bestScore = Double.NEGATIVE_INFINITY

        for (sx in subX) {
            for (sy in subY) {
                val x0 = (sx.first() - dx).toFloat()
                val x1 = (sx.last() + dx).toFloat()
                val y0 = (sy.first() - dy).toFloat()
                val y1 = (sy.last() + dy).toFloat()
                val score = checkerboardScore(img, x0.toInt(), y0.toInt(), x1.toInt(), y1.toInt())
                if (score > bestScore) {
                    bestScore = score
                    best = BoardCorners(x0, y0, x1, y1)
                }
            }
        }

        return best?.let { repairParity(img, it) }
    }

    fun snapCorners(img: GrayImage, box: BoardCorners): BoardCorners {
        val tile = (box.x1 - box.x0) / 8f
        val radius = max(2, (tile / 3f).roundToInt())
        var bestDx = 0
        var bestDy = 0
        var bestScore = Double.NEGATIVE_INFINITY

        fun evalAt(dx: Int, dy: Int) {
            val score = checkerboardScore(
                img,
                (box.x0 + dx).roundToInt(),
                (box.y0 + dy).roundToInt(),
                (box.x1 + dx).roundToInt(),
                (box.y1 + dy).roundToInt()
            )
            if (score > bestScore) {
                bestScore = score
                bestDx = dx
                bestDy = dy
            }
        }

        var dy = -radius
        while (dy <= radius) {
            var dx = -radius
            while (dx <= radius) {
                evalAt(dx, dy)
                dx += 2
            }
            dy += 2
        }

        val cx = bestDx
        val cy = bestDy
        for (fdy in (cy - 2)..(cy + 2)) {
            for (fdx in (cx - 2)..(cx + 2)) {
                evalAt(fdx, fdy)
            }
        }

        return BoardCorners(
            box.x0 + bestDx,
            box.y0 + bestDy,
            box.x1 + bestDx,
            box.y1 + bestDy
        )
    }

    private fun gradientRows(img: GrayImage): FloatArray {
        val w = img.width
        val h = img.height
        val out = FloatArray(w * h)
        for (x in 0 until w) {
            out[x] = img.data[w + x] - img.data[x]
            val last = (h - 1) * w
            out[last + x] = img.data[last + x] - img.data[last - w + x]
        }
        for (y in 1 until h - 1) {
            val prevRow = (y - 1) * w
            val nextRow = (y + 1) * w
            val curRow = y * w
            for (x in 0 until w) {
                out[curRow + x] = (img.data[nextRow + x] - img.data[prevRow + x]) / 2f
            }
        }
        return out
    }

    private fun gradientCols(img: GrayImage): FloatArray {
        val w = img.width
        val h = img.height
        val out = FloatArray(w * h)
        for (y in 0 until h) {
            val row = y * w
            out[row] = img.data[row + 1] - img.data[row]
            out[row + w - 1] = img.data[row + w - 1] - img.data[row + w - 2]
            for (x in 1 until w - 1) {
                out[row + x] = (img.data[row + x + 1] - img.data[row + x - 1]) / 2f
            }
        }
        return out
    }

    private fun houghResponse(grad: FloatArray, width: Int, height: Int, isRows: Boolean): DoubleArray {
        val n = if (isRows) height else width
        val pos = DoubleArray(n)
        val neg = DoubleArray(n)

        for (y in 0 until height) {
            for (x in 0 until width) {
                val g = grad[y * width + x]
                val i = if (isRows) y else x
                if (g > 0f) {
                    pos[i] += g.toDouble()
                } else {
                    neg[i] -= g.toDouble()
                }
            }
        }

        val out = DoubleArray(n)
        for (i in 0 until n) {
            out[i] = pos[i] * neg[i]
        }
        return out
    }

    private fun nonmaxSuppress(arr: DoubleArray, winSize: Int = 5): DoubleArray {
        val out = arr.clone()
        val n = arr.size
        for (i in 0 until n) {
            val left = if (i == 0) 0.0 else maxSlice(arr, max(0, i - winSize), i)
            val right = if (i >= n - 2) 0.0 else maxSlice(arr, i + 1, min(n - 1, i + winSize))
            if (arr[i] < left || arr[i] <= right) {
                out[i] = 0.0
            }
        }
        return out
    }

    private fun maxSlice(arr: DoubleArray, from: Int, to: Int): Double {
        var m = Double.NEGATIVE_INFINITY
        for (i in from until to) {
            if (arr[i] > m) m = arr[i]
        }
        return m
    }

    private data class CandidateSeq(val trimmed: List<Int>, val full: List<Int>)

    private fun rankedPeakSequences(hough: DoubleArray): List<CandidateSeq> {
        val suppressed = nonmaxSuppress(hough)
        val peak = maxSlice(suppressed, 0, suppressed.size)
        if (peak <= 0.0) return emptyList()

        val positions = mutableListOf<Int>()
        val values = mutableListOf<Double>()
        for (i in suppressed.indices) {
            val v = suppressed[i] / peak
            if (v >= PEAK_KEEP_RATIO) {
                positions.add(i)
                values.add(v)
            }
        }

        val seqs = getAllSequences(positions)
        if (seqs.isEmpty()) return emptyList()

        val valueMap = positions.indices.associate { positions[it] to values[it] }
        val scored = seqs.map { seq ->
            val vals = seq.map { valueMap[it] ?: 0.0 }
            val trimmed = trimSequence(seq, vals)
            val score = trimmed.second.sum() / trimmed.second.size
            Pair(CandidateSeq(trimmed.first, seq), score)
        }.sortedByDescending { it.second }

        val unique = mutableListOf<CandidateSeq>()
        for ((cand, _) in scored) {
            val isDuplicate = unique.any { u ->
                u.full.size == cand.full.size && u.full == cand.full
            }
            if (!isDuplicate) {
                unique.add(cand)
            }
            if (unique.size >= 5) break
        }
        return unique
    }

    private fun getAllSequences(seq: List<Int>): List<List<Int>> {
        if (seq.size < MIN_SEQ_LEN) return emptyList()
        val seqs = mutableListOf<List<Int>>()

        for (i in 0 until seq.size - 1) {
            for (j in (i + 1) until seq.size) {
                var duplicate = false
                for (prev in seqs) {
                    for (k in 0 until prev.size - 1) {
                        if (seq[i] == prev[k] && seq[j] == prev[k + 1]) {
                            duplicate = true
                            break
                        }
                    }
                    if (duplicate) break
                }
                if (duplicate) continue

                val d = seq[j] - seq[i]
                if (d < ERR_PX) continue

                val s = mutableListOf(seq[i], seq[j])
                var n = s.last() + d
                while (true) {
                    var bestIdx = 0
                    var bestDist = Int.MAX_VALUE
                    for (k in seq.indices) {
                        val dist = abs(seq[k] - n)
                        if (dist < bestDist) {
                            bestDist = dist
                            bestIdx = k
                        }
                    }
                    if (bestDist >= ERR_PX) break
                    n = seq[bestIdx]
                    s.add(n)
                    n = s.last() + d
                }
                if (s.size >= MIN_SEQ_LEN) {
                    seqs.add(s)
                }
            }
        }
        return seqs
    }

    private fun trimSequence(seq: List<Int>, vals: List<Double>): Pair<List<Int>, List<Double>> {
        var s = seq.toMutableList()
        var v = vals.toMutableList()
        if (s.size > 9) {
            while (s.size > 7) {
                if (v.first() > v.last()) {
                    s = s.dropLast(1).toMutableList()
                    v = v.dropLast(1).toMutableList()
                } else {
                    s = s.drop(1).toMutableList()
                    v = v.drop(1).toMutableList()
                }
            }
        }
        return Pair(s, v)
    }

    private fun medianDiff(lines: List<Int>): Double {
        if (lines.size < 2) return 0.0
        val diffs = (1 until lines.size).map { (lines[it] - lines[it - 1]).toDouble() }.sorted()
        val mid = diffs.size / 2
        return if (diffs.size % 2 == 1) diffs[mid] else (diffs[mid - 1] + diffs[mid]) / 2.0
    }

    fun checkerboardScore(img: GrayImage, x0: Int, y0: Int, x1: Int, y1: Int): Double {
        val w = x1 - x0
        val h = y1 - y0
        if (w <= 0 || h <= 0) return 0.0

        var score = 0.0
        for (ty in 0 until 64) {
            val sy = y0 + (ty * h) / 64
            for (tx in 0 until 64) {
                val sx = x0 + (tx * w) / 64
                var px = 0.0
                if (sx in 0 until img.width && sy in 0 until img.height) {
                    px = img.data[sy * img.width + sx].toDouble()
                }
                val parity = if ((tx / 8 + ty / 8) % 2 == 0) 1 else -1
                score += (parity * px) / 64.0
            }
        }
        return score
    }

    private fun reconstructFromCandidates(img: GrayImage, candidates: List<CandidateSeq>, axisIsX: Boolean): BoardCorners? {
        var best: BoardCorners? = null
        var bestScore = Double.NEGATIVE_INFINITY
        for (cand in candidates) {
            val res = reconstructSquareBoard(img, cand.full, axisIsX)
            if (res != null && res.second > bestScore) {
                bestScore = res.second
                best = res.first
            }
        }
        return best
    }

    private fun reconstructSquareBoard(img: GrayImage, good: List<Int>, axisIsX: Boolean): Pair<BoardCorners, Double>? {
        val tile = medianDiff(good)
        if (tile <= 0.0) return null

        val gA = good.first()
        val gB = good.last()
        if (gB - gA <= 0) return null

        val pad = tile.roundToInt()
        val extents = mutableListOf(Pair(gA, gB))
        for (k in 0..good.size - 7) {
            val e = Pair(good[k] - pad, good[k + 6] + pad)
            if (extents.none { abs(it.first - e.first) <= 2 && abs(it.second - e.second) <= 2 }) {
                extents.add(e)
            }
        }

        val limit = if (axisIsX) img.height else img.width
        var best: BoardCorners? = null
        var bestScore = Double.NEGATIVE_INFINITY

        for ((eA, eB) in extents) {
            val span = eB - eA
            val step = max(2, (tile / 8.0).roundToInt())
            var start = -span
            while (start <= limit) {
                val box = if (axisIsX) {
                    BoardCorners(eA.toFloat(), start.toFloat(), eB.toFloat(), (start + span).toFloat())
                } else {
                    BoardCorners(start.toFloat(), eA.toFloat(), (start + span).toFloat(), eB.toFloat())
                }
                val score = checkerboardScore(img, box.x0.toInt(), box.y0.toInt(), box.x1.toInt(), box.y1.toInt())
                if (score > bestScore) {
                    bestScore = score
                    best = box
                }
                start += step
            }
        }

        return if (best != null) Pair(best, bestScore) else null
    }

    private fun repairParity(img: GrayImage, box: BoardCorners): BoardCorners {
        val score = checkerboardScore(img, box.x0.toInt(), box.y0.toInt(), box.x1.toInt(), box.y1.toInt())
        if (score >= 0.0) return box

        val tile = ((box.x1 - box.x0) / 8f).roundToInt()
        var best = box
        var bestScore = score
        val shifts = listOf(
            Pair(tile, 0),
            Pair(-tile, 0),
            Pair(0, tile),
            Pair(0, -tile)
        )
        for ((sx, sy) in shifts) {
            val c = BoardCorners(box.x0 + sx, box.y0 + sy, box.x1 + sx, box.y1 + sy)
            val s = checkerboardScore(img, c.x0.toInt(), c.y0.toInt(), c.x1.toInt(), c.y1.toInt())
            if (s > bestScore) {
                bestScore = s
                best = c
            }
        }
        return best
    }
}
