package com.mosqueteroweb.img2fen.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mosqueteroweb.img2fen.model.ChessPiece
import com.mosqueteroweb.img2fen.model.PieceColor
import com.mosqueteroweb.img2fen.model.PieceType

@Composable
fun PiecePickerDialog(
    row: Int,
    col: Int,
    currentPiece: ChessPiece,
    onPieceSelected: (ChessPiece) -> Unit,
    onDismiss: () -> Unit
) {
    val fileChar = ('a' + col)
    val rankNum = 8 - row
    val squareName = "$fileChar$rankNum"

    val whitePieces = listOf(
        ChessPiece(PieceType.KING, PieceColor.WHITE),
        ChessPiece(PieceType.QUEEN, PieceColor.WHITE),
        ChessPiece(PieceType.ROOK, PieceColor.WHITE),
        ChessPiece(PieceType.BISHOP, PieceColor.WHITE),
        ChessPiece(PieceType.KNIGHT, PieceColor.WHITE),
        ChessPiece(PieceType.PAWN, PieceColor.WHITE),
    )

    val blackPieces = listOf(
        ChessPiece(PieceType.KING, PieceColor.BLACK),
        ChessPiece(PieceType.QUEEN, PieceColor.BLACK),
        ChessPiece(PieceType.ROOK, PieceColor.BLACK),
        ChessPiece(PieceType.BISHOP, PieceColor.BLACK),
        ChessPiece(PieceType.KNIGHT, PieceColor.BLACK),
        ChessPiece(PieceType.PAWN, PieceColor.BLACK),
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Casilla $squareName",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Cerrar")
                }
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Piezas Blancas",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    whitePieces.forEach { piece ->
                        PieceTile(piece = piece, onClick = { onPieceSelected(piece) })
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Piezas Negras",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    blackPieces.forEach { piece ->
                        PieceTile(piece = piece, onClick = { onPieceSelected(piece) })
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                OutlinedButton(
                    onClick = { onPieceSelected(ChessPiece.EMPTY) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Dejar casilla vacía")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}

@Composable
private fun PieceTile(
    piece: ChessPiece,
    onClick: () -> Unit
) {
    val resId = piece.getDrawableRes() ?: return
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFFE0E0E0))
            .clickable(onClick = onClick)
            .padding(4.dp),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = resId),
            contentDescription = piece.type.name,
            modifier = Modifier.size(36.dp)
        )
    }
}
