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
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedIconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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

enum class RecognitionEngine {
    GEMINI_CLOUD,
    LOCAL_OFFLINE
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CropScreen(
    imageBitmap: Bitmap,
    isProcessing: Boolean,
    geminiApiKey: String,
    onSaveGeminiApiKey: (String) -> Unit,
    onConfirmCrop: (croppedBitmap: Bitmap, engine: RecognitionEngine) -> Unit,
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

    // Default to the high-accuracy offline 2D model
    var selectedEngine by remember { mutableStateOf(RecognitionEngine.LOCAL_OFFLINE) }
    var showApiKeyDialog by remember { mutableStateOf(false) }

    fun autoDetectAndFit() {
        if (viewportPx <= 0f) return
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
                        Icon(Icons.AutoMirrored.Filled.RotateRight, contentDescription = "Rotar")
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
                text = "👉 Ajusta el tablero para que las 64 casillas coincidan con las líneas amarillas.",
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
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(0.5f, 6f)
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

                // 8x8 Grid overlay
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val strokeWidth = 1.5.dp.toPx()
                    val gridColor = Color.Yellow.copy(alpha = 0.85f)

                    // Outer border
                    drawRect(
                        color = Color.Yellow,
                        size = size,
                        style = Stroke(width = 3.dp.toPx())
                    )

                    // Internal 8x8 lines
                    val stepX = size.width / 8f
                    val stepY = size.height / 8f
                    for (i in 1..7) {
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
                                else if (selectedEngine == RecognitionEngine.GEMINI_CLOUD)
                                    "Analizando con Gemini Vision AI..."
                                else
                                    "Analizando casillas offline...",
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Zoom controls: "Zoom:" and 3 icon buttons without text labels (User requirement)
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
                Spacer(modifier = Modifier.width(16.dp))
                OutlinedIconButton(
                    onClick = { scale = (scale + 0.15f).coerceAtMost(6f) },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Aumentar zoom")
                }
                Spacer(modifier = Modifier.width(10.dp))
                OutlinedIconButton(
                    onClick = { scale = (scale - 0.15f).coerceAtLeast(0.5f) },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Reducir zoom")
                }
                Spacer(modifier = Modifier.width(10.dp))
                OutlinedIconButton(
                    onClick = {
                        scale = 1f
                        offsetX = 0f
                        offsetY = 0f
                        rotation = 0f
                    },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Restablecer zoom")
                }

                Spacer(modifier = Modifier.width(16.dp))

                FilledTonalButton(
                    onClick = { autoDetectAndFit() },
                    enabled = !isProcessing && !isDetecting
                ) {
                    Icon(Icons.Default.AutoFixHigh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Auto", fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Engine Selection Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "Motor de Reconocimiento",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        FilterChip(
                            selected = selectedEngine == RecognitionEngine.LOCAL_OFFLINE,
                            onClick = { selectedEngine = RecognitionEngine.LOCAL_OFFLINE },
                            label = { Text("📱 Modelo 2D Offline (Recomendado)", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                            modifier = Modifier.weight(1f)
                        )

                        FilterChip(
                            selected = selectedEngine == RecognitionEngine.GEMINI_CLOUD,
                            onClick = {
                                selectedEngine = RecognitionEngine.GEMINI_CLOUD
                                if (geminiApiKey.isBlank()) {
                                    showApiKeyDialog = true
                                }
                            },
                            label = { Text("✨ Gemini Nube", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                            modifier = Modifier.weight(0.6f)
                        )
                    }

                    if (selectedEngine == RecognitionEngine.GEMINI_CLOUD) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (geminiApiKey.isNotBlank()) "Clave API configurada ✓" else "⚠️ Requiere clave API gratuita",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (geminiApiKey.isNotBlank()) Color(0xFF4CAF50) else MaterialTheme.colorScheme.error
                            )
                            TextButton(onClick = { showApiKeyDialog = true }) {
                                Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Ajustar Clave", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

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
                    onConfirmCrop(cropped, selectedEngine)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                enabled = !isProcessing && !isDetecting
            ) {
                Icon(Icons.Default.Check, contentDescription = null)
                Spacer(modifier = Modifier.size(8.dp))
                Text("Analizar Diagrama", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }

    // Gemini API Key Input Dialog
    if (showApiKeyDialog) {
        var keyInput by remember { mutableStateOf(geminiApiKey) }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showApiKeyDialog = false },
            title = { Text("Configurar Gemini API Key") },
            text = {
                Column {
                    Text(
                        text = "Gemini Vision AI analiza el diagrama con modelos en la nube. Es gratuita en Google AI Studio si deseas usarla.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = keyInput,
                        onValueChange = { keyInput = it },
                        label = { Text("Clave API de Gemini") },
                        placeholder = { Text("AIzaSy...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    onSaveGeminiApiKey(keyInput.trim())
                    showApiKeyDialog = false
                }) {
                    Text("Guardar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showApiKeyDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}
