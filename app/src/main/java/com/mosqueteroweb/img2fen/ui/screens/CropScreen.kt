package com.mosqueteroweb.img2fen.ui.screens

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.RotateRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mosqueteroweb.img2fen.engine.BoardCropper
import com.mosqueteroweb.img2fen.engine.ChessboardDetector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CropScreen(
    imageBitmap: Bitmap,
    isProcessing: Boolean,
    onConfirmCrop: (croppedBitmap: Bitmap) -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var rotation by remember { mutableFloatStateOf(0f) }
    var viewportPx by remember { mutableFloatStateOf(0f) }
    var hasAutoFitted by remember { mutableStateOf(false) }
    var isDetecting by remember { mutableStateOf(false) }
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current

    fun autoDetectAndFit() {
        if (viewportPx <= 0f) return
        haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
        isDetecting = true
        scope.launch(Dispatchers.Default) {
            val corners = ChessboardDetector.findChessboard(imageBitmap)
            if (corners != null) {
                val bw = corners.width
                val bh = corners.height
                val bcx = (corners.x0 + corners.x1) / 2f
                val bcy = (corners.y0 + corners.y1) / 2f

                val baseScale = minOf(viewportPx / imageBitmap.width, viewportPx / imageBitmap.height)
                val baseLeft = (viewportPx - imageBitmap.width * baseScale) / 2f
                val baseTop = (viewportPx - imageBitmap.height * baseScale) / 2f

                val boardSizeOnScreen = maxOf(bw, bh) * baseScale
                if (boardSizeOnScreen > 10f) {
                    val fitScale = (viewportPx / boardSizeOnScreen).coerceIn(0.5f, 6f)
                    val screenBcx = baseLeft + bcx * baseScale
                    val screenBcy = baseTop + bcy * baseScale

                    val newOffsetX = (viewportPx / 2f - screenBcx) * fitScale
                    val newOffsetY = (viewportPx / 2f - screenBcy) * fitScale

                    withContext(Dispatchers.Main) {
                        scale = fitScale
                        offsetX = newOffsetX
                        offsetY = newOffsetY
                        rotation = 0f
                    }
                }
            }
            withContext(Dispatchers.Main) {
                isDetecting = false
            }
        }
    }

    // Auto-detect chessboard on initial viewport measurement
    LaunchedEffect(viewportPx) {
        if (viewportPx > 0f && !hasAutoFitted) {
            hasAutoFitted = true
            autoDetectAndFit()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ajustar Diagrama") },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !isProcessing) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            rotation = (rotation + 90f) % 360f
                        },
                        enabled = !isProcessing
                    ) {
                        Icon(Icons.AutoMirrored.Filled.RotateRight, contentDescription = "Rotar 90°")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "👉 Mueve y pellizca con dos dedos para hacer zoom y rotar el tablero.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Interactive Viewport Box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black)
                    .onSizeChanged { size ->
                        viewportPx = size.width.toFloat()
                    }
                    .pointerInput(Unit) {
                        // Two-finger gesture allows both pinch-to-zoom and two-finger rotation to straighten tilted photos
                        detectTransformGestures { _, pan, zoom, rotationChange ->
                            scale = (scale * zoom).coerceIn(0.5f, 6f)
                            rotation = (rotation + rotationChange) % 360f
                            offsetX += pan.x
                            offsetY += pan.y
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                // Scaled and transformed image with ContentScale.Fit so nothing gets clipped
                Image(
                    bitmap = imageBitmap.asImageBitmap(),
                    contentDescription = "Diagrama a recortar",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            translationX = offsetX
                            translationY = offsetY
                            rotationZ = rotation
                        }
                )

                // 8x8 Grid overlay with dual-stroke high-contrast for readability on all board colors
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val shadowWidth = 3.dp.toPx()
                    val strokeWidth = 1.5.dp.toPx()
                    val shadowColor = Color.Black.copy(alpha = 0.65f)
                    val gridColor = Color.Yellow

                    // Outer border (shadow + bright line)
                    drawRect(
                        color = shadowColor,
                        size = size,
                        style = Stroke(width = 4.5.dp.toPx())
                    )
                    drawRect(
                        color = gridColor,
                        size = size,
                        style = Stroke(width = 2.5.dp.toPx())
                    )

                    // Internal 8x8 lines with contrasting drop shadow
                    val stepX = size.width / 8f
                    val stepY = size.height / 8f
                    for (i in 1..7) {
                        // Dark shadow line underneath
                        drawLine(
                            color = shadowColor,
                            start = Offset(i * stepX, 0f),
                            end = Offset(i * stepX, size.height),
                            strokeWidth = shadowWidth
                        )
                        drawLine(
                            color = shadowColor,
                            start = Offset(0f, i * stepY),
                            end = Offset(size.width, i * stepY),
                            strokeWidth = shadowWidth
                        )
                        // Bright yellow line on top
                        drawLine(
                            color = gridColor,
                            start = Offset(i * stepX, 0f),
                            end = Offset(i * stepX, size.height),
                            strokeWidth = strokeWidth
                        )
                        drawLine(
                            color = gridColor,
                            start = Offset(0f, i * stepY),
                            end = Offset(size.width, i * stepY),
                            strokeWidth = strokeWidth
                        )
                    }
                }

                // Rotation angle badge (visible when rotated)
                val roundedAngle = kotlin.math.round(rotation % 360f).toInt().let {
                    if (it > 180) it - 360 else if (it < -180) it + 360 else it
                }
                if (roundedAngle != 0) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color.Black.copy(alpha = 0.75f))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "↺ $roundedAngle°",
                            color = Color.Yellow,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // Processing or Detecting overlay
                if (isProcessing || isDetecting) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.7f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Color.Yellow)
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = if (isDetecting)
                                    "Buscando tablero automáticamente..."
                                else
                                    "Reconociendo piezas offline...",
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Zoom and auto controls: "Zoom:" and 4 clean icon buttons without text labels
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Zoom:",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.width(12.dp))
                OutlinedIconButton(
                    onClick = { scale = (scale + 0.15f).coerceAtMost(6f) },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Aumentar zoom")
                }
                Spacer(modifier = Modifier.width(8.dp))
                OutlinedIconButton(
                    onClick = { scale = (scale - 0.15f).coerceAtLeast(0.5f) },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Reducir zoom")
                }
                Spacer(modifier = Modifier.width(8.dp))
                OutlinedIconButton(
                    onClick = {
                        scale = 1f
                        offsetX = 0f
                        offsetY = 0f
                        rotation = 0f
                    },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Restablecer posición y zoom")
                }
                Spacer(modifier = Modifier.width(8.dp))
                // Magic wand icon only (no text) for auto detection
                OutlinedIconButton(
                    onClick = { autoDetectAndFit() },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(
                        Icons.Default.AutoFixHigh,
                        contentDescription = "Auto-encajar tablero",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Submit Button
            Button(
                onClick = {
                    val cropped = BoardCropper.extractViewportSquare(
                        source = imageBitmap,
                        viewportSizePx = if (viewportPx > 0f) viewportPx else 800f,
                        scale = scale,
                        offsetX = offsetX,
                        offsetY = offsetY,
                        rotation = rotation
                    )
                    onConfirmCrop(cropped)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(12.dp),
                enabled = !isProcessing && !isDetecting
            ) {
                Icon(Icons.Default.Check, contentDescription = null)
                Spacer(modifier = Modifier.size(8.dp))
                Text("Analizar Diagrama", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}
