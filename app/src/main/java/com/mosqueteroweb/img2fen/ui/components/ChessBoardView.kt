package com.mosqueteroweb.img2fen.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.model.ChessPiece

private val LightSquareColor = Color(0xFFF0D9B5)
private val DarkSquareColor = Color(0xFFB58863)
private val SelectedSquareColor = Color(0x66FFEB3B)

@Composable
fun ChessBoardView(
    board: BoardPosition,
    selectedSquare: Pair<Int, Int>? = null,
    onSquareClick: (row: Int, col: Int) -> Unit,
    modifier: Modifier = Modifier
) {
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .border(3.dp, Color(0xFF4A3525), RoundedCornerShape(8.dp))
    ) {
        val tileSize = maxWidth / 8

        Column(modifier = Modifier.fillMaxSize()) {
            for (row in 0 until 8) {
                Row(modifier = Modifier.fillMaxWidth().weight(1f)) {
                    for (col in 0 until 8) {
                        val isLight = (row + col) % 2 == 0
                        val isSelected = selectedSquare?.first == row && selectedSquare?.second == col
                        val piece = board.getPiece(row, col)

                        SquareCell(
                            row = row,
                            col = col,
                            piece = piece,
                            isLight = isLight,
                            isSelected = isSelected,
                            onClick = { onSquareClick(row, col) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SquareCell(
    row: Int,
    col: Int,
    piece: ChessPiece,
    isLight: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bgColor = if (isLight) LightSquareColor else DarkSquareColor
    val textColor = if (isLight) DarkSquareColor else LightSquareColor

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(bgColor)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        // Selection highlight
        if (isSelected) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(SelectedSquareColor)
                    .border(2.dp, Color(0xFFFF9800))
            )
        }

        // Rank label (on file a, left col)
        if (col == 0) {
            Text(
                text = "${8 - row}",
                color = textColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 2.dp, top = 1.dp)
            )
        }

        // File label (on rank 1, bottom row)
        if (row == 7) {
            Text(
                text = "${('a' + col)}",
                color = textColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 2.dp, bottom = 1.dp)
            )
        }

        // Piece Icon
        val drawableRes = piece.getDrawableRes()
        if (drawableRes != null) {
            Image(
                painter = painterResource(id = drawableRes),
                contentDescription = piece.type.name,
                modifier = Modifier
                    .fillMaxSize(0.85f)
                    .align(Alignment.Center)
            )
        }
    }
}
