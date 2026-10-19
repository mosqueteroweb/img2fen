package com.mosqueteroweb.img2fen.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.ChessPiece
import com.mosqueteroweb.img2fen.model.PieceColor
import com.mosqueteroweb.img2fen.ui.components.ChessBoardView
import com.mosqueteroweb.img2fen.ui.components.PiecePickerDialog
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultScreen(
    initialBoard: BoardPosition,
    onSaveToHistory: (fen: String, turn: String) -> Unit,
    onNewScan: () -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var board by remember { mutableStateOf(initialBoard) }
    var selectedSquareForEdit by remember { mutableStateOf<Pair<Int, Int>?>(null) }

    val currentFen = remember(board) { board.toFen() }

    // Auto-save initial or modified FEN to history
    LaunchedEffect(currentFen) {
        val turnStr = if (board.activeColor == PieceColor.BLACK) "b" else "w"
        onSaveToHistory(currentFen, turnStr)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Posición FEN") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Atrás")
                    }
                },
                actions = {
                    IconButton(onClick = onNewScan) {
                        Icon(Icons.Default.Refresh, contentDescription = "Nuevo Escaneo")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {

            // Turn selection section
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "¿Quién tiene el turno?",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val isWhiteTurn = board.activeColor == PieceColor.WHITE
                        FilterChip(
                            selected = isWhiteTurn,
                            onClick = {
                                board = board.withActiveColor(PieceColor.WHITE)
                            },
                            label = { Text("⚪ Blancas juegan (w)", fontWeight = FontWeight.SemiBold) },
                            modifier = Modifier.weight(1f),
                            leadingIcon = if (isWhiteTurn) {
                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                            } else null
                        )

                        FilterChip(
                            selected = !isWhiteTurn,
                            onClick = {
                                board = board.withActiveColor(PieceColor.BLACK)
                            },
                            label = { Text("⚫ Negras juegan (b)", fontWeight = FontWeight.SemiBold) },
                            modifier = Modifier.weight(1f),
                            leadingIcon = if (!isWhiteTurn) {
                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                            } else null
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Interactive Chess Board View
            ChessBoardView(
                board = board,
                selectedSquare = selectedSquareForEdit,
                onSquareClick = { r, c ->
                    selectedSquareForEdit = Pair(r, c)
                }
            )

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "💡 Toca cualquier casilla del tablero para corregir una pieza.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(16.dp))

            // FEN String Output Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "NOTACIÓN FEN",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Row {
                            IconButton(
                                onClick = {
                                    copyToClipboard(context, currentFen)
                                    scope.launch {
                                        snackbarHostState.showSnackbar("¡FEN copiado al portapapeles!")
                                    }
                                }
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = "Copiar FEN")
                            }
                            IconButton(
                                onClick = {
                                    shareFen(context, currentFen)
                                }
                            ) {
                                Icon(Icons.Default.Share, contentDescription = "Compartir FEN")
                            }
                        }
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(10.dp)
                    ) {
                        Text(
                            text = currentFen,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Primary Copy Button
            Button(
                onClick = {
                    copyToClipboard(context, currentFen)
                    scope.launch {
                        snackbarHostState.showSnackbar("¡FEN copiado al portapapeles!")
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Icon(Icons.Default.ContentCopy, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Copiar FEN", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }

            Spacer(modifier = Modifier.height(10.dp))

            // External App Export Buttons (Lichess & Chess.com)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { openInLichess(context, currentFen) },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Lichess", fontWeight = FontWeight.SemiBold)
                }

                OutlinedButton(
                    onClick = { openInChessCom(context, currentFen) },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Chess.com", fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = onNewScan,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Escanear otro diagrama")
            }
        }
    }

    // Piece picker dialog when editing a square
    selectedSquareForEdit?.let { (row, col) ->
        val piece = board.getPiece(row, col)
        PiecePickerDialog(
            row = row,
            col = col,
            currentPiece = piece,
            onPieceSelected = { newPiece ->
                board = board.setPiece(row, col, newPiece)
                selectedSquareForEdit = null
            },
            onDismiss = {
                selectedSquareForEdit = null
            }
        )
    }
}

private fun copyToClipboard(context: Context, fen: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText("Chess FEN", fen)
    clipboard.setPrimaryClip(clip)
    Toast.makeText(context, "FEN copiado al portapapeles", Toast.LENGTH_SHORT).show()
}

private fun shareFen(context: Context, fen: String) {
    val sendIntent = Intent().apply {
        action = Intent.ACTION_SEND
        putExtra(Intent.EXTRA_TEXT, fen)
        type = "text/plain"
    }
    val shareIntent = Intent.createChooser(sendIntent, "Compartir posición FEN")
    context.startActivity(shareIntent)
}

private fun openInLichess(context: Context, fen: String) {
    try {
        val encodedFen = URLEncoder.encode(fen, StandardCharsets.UTF_8.toString())
        val url = "https://lichess.org/analysis/$encodedFen"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        context.startActivity(intent)
    } catch (e: Exception) {
        Toast.makeText(context, "No se pudo abrir Lichess", Toast.LENGTH_SHORT).show()
    }
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
