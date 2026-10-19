package com.mosqueteroweb.img2fen.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.mosqueteroweb.img2fen.R
import com.mosqueteroweb.img2fen.data.FenHistoryRepository
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.FenHistoryItem
import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    historyRepository: FenHistoryRepository,
    onImageSelected: (Bitmap) -> Unit,
    onSelectRecentFen: (BoardPosition) -> Unit
) {
    val context = LocalContext.current
    val historyItems by historyRepository.historyFlow.collectAsState()

    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current

    // Temporary URI for camera capture (scoped to camera/ subfolder and cleaned up)
    val tempCameraUri = remember {
        val cameraDir = File(context.cacheDir, "camera").apply { mkdirs() }
        cameraDir.listFiles()?.forEach { file ->
            if (file.name.startsWith("temp_capture_") && file.extension == "jpg") {
                file.delete()
            }
        }
        val tempFile = File(cameraDir, "temp_capture_${System.currentTimeMillis()}.jpg")
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", tempFile)
    }

    // Camera launcher
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            val bitmap = loadBitmapFromUri(context, tempCameraUri)
            if (bitmap != null) {
                onImageSelected(bitmap)
            } else {
                Toast.makeText(context, "Error al cargar la foto", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Photo picker launcher (Gallery)
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            val bitmap = loadBitmapFromUri(context, uri)
            if (bitmap != null) {
                onImageSelected(bitmap)
            } else {
                Toast.makeText(context, "Error al abrir la imagen", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Official App Logo (Digital Knight) instead of unicode pawn
                        Image(
                            painter = painterResource(id = R.drawable.ic_app_logo),
                            contentDescription = "Logo Img2FEN",
                            modifier = Modifier
                                .size(30.dp)
                                .clip(RoundedCornerShape(8.dp))
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Img2FEN", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "v1.0.0",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    // Creator avatar on the right side of the top bar
                    Box(
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_creator_logo),
                            contentDescription = "Mosqueteroweb - Creador",
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Hero card
            item {
                ElevatedCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_app_logo),
                            contentDescription = "Logo Img2FEN",
                            modifier = Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(16.dp))
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "Convierte diagramas de ajedrez a FEN",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Fotografía una página de libro, revista o pantalla para extraer la posición al instante.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )

                        Spacer(modifier = Modifier.height(18.dp))

                        // Big Camera Button (properly sized and formatted text)
                        Button(
                            onClick = {
                                try {
                                    cameraLauncher.launch(tempCameraUri)
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Error iniciando la cámara: ${e.message}", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 50.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Hacer Foto",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        // Gallery Button
                        OutlinedButton(
                            onClick = {
                                galleryLauncher.launch("image/*")
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Elegir de la Galería",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            // History Header
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Últimos Diagramas",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Badge {
                            Text("${historyItems.size}/${FenHistoryRepository.MAX_ITEMS}")
                        }
                    }

                    if (historyItems.isNotEmpty()) {
                        IconButton(onClick = { historyRepository.clearAll() }) {
                            Icon(Icons.Default.Delete, contentDescription = "Borrar historial", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            // History List
            if (historyItems.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "No hay posiciones recientes",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "Toma una foto o selecciona una imagen para comenzar.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            } else {
                items(historyItems, key = { it.id }) { item ->
                    HistoryItemCard(
                        item = item,
                        onClick = {
                            val board = BoardPosition.fromFen(item.fen)
                            onSelectRecentFen(board)
                        },
                        onCopy = {
                            haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                            copyToClipboard(context, item.fen)
                        },
                        onOpenChessCom = {
                            openInChessCom(context, item.fen)
                        },
                        onDelete = {
                            historyRepository.deleteItem(item.id)
                        }
                    )
                }
            }

            // Footer branding
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Img2FEN v1.0.0 • por Mosqueteroweb",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Image(
                        painter = painterResource(id = R.drawable.ic_creator_logo),
                        contentDescription = "Mosqueteroweb",
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                    )
                }
            }
        }
    }
}

@Composable
private fun HistoryItemCard(
    item: FenHistoryItem,
    onClick: () -> Unit,
    onCopy: () -> Unit,
    onOpenChessCom: () -> Unit,
    onDelete: () -> Unit
) {
    val formattedDate = remember(item.timestamp) {
        val sdf = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())
        sdf.format(Date(item.timestamp))
    }

    val isWhiteTurn = item.turn == "w"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (isWhiteTurn) Color.White else Color.Black)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isWhiteTurn) "Blancas (w)" else "Negras (b)",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    text = formattedDate,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = item.fen,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                IconButton(onClick = onCopy, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "Copiar FEN", modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(4.dp))
                IconButton(onClick = onOpenChessCom, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Abrir en Chess.com", modifier = Modifier.size(20.dp))
                }
                Spacer(modifier = Modifier.width(4.dp))
                IconButton(onClick = onDelete, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Default.Delete, contentDescription = "Eliminar", modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

private fun loadBitmapFromUri(context: Context, uri: Uri): Bitmap? {
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = true
            }
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
        }
    } catch (e: Exception) {
        null
    }
}

private fun copyToClipboard(context: Context, fen: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText("Chess FEN", fen)
    clipboard.setPrimaryClip(clip)
    Toast.makeText(context, "FEN copiado al portapapeles", Toast.LENGTH_SHORT).show()
}

private fun openInChessCom(context: Context, fen: String) {
    try {
        val encodedFen = URLEncoder.encode(fen, StandardCharsets.UTF_8.toString())
        val url = "https://www.chess.com/analysis?fen=$encodedFen"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        context.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(context, "No se pudo abrir Chess.com", Toast.LENGTH_SHORT).show()
    }
}
