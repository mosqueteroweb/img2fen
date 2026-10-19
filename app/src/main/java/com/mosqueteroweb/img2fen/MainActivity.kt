package com.mosqueteroweb.img2fen

import android.graphics.Bitmap
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.mosqueteroweb.img2fen.data.FenHistoryRepository
import com.mosqueteroweb.img2fen.engine.DigitalChessClassifier
import com.mosqueteroweb.img2fen.model.BoardPosition
import com.mosqueteroweb.img2fen.theme.Img2FENTheme
import com.mosqueteroweb.img2fen.ui.screens.CropScreen
import com.mosqueteroweb.img2fen.ui.screens.HomeScreen
import com.mosqueteroweb.img2fen.ui.screens.ResultScreen
import kotlinx.coroutines.launch

sealed interface AppScreen {
    data object Home : AppScreen
    data class Crop(val bitmap: Bitmap) : AppScreen
    data class Result(val board: BoardPosition) : AppScreen
}

class MainActivity : ComponentActivity() {

    private val historyRepository by lazy { FenHistoryRepository(applicationContext) }
    private val digitalClassifier by lazy { DigitalChessClassifier(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            Img2FENTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppContent(
                        historyRepository = historyRepository,
                        digitalClassifier = digitalClassifier
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        digitalClassifier.close()
    }
}

@Composable
fun AppContent(
    historyRepository: FenHistoryRepository,
    digitalClassifier: DigitalChessClassifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var currentScreen by remember { mutableStateOf<AppScreen>(AppScreen.Home) }
    var isProcessing by remember { mutableStateOf(false) }

    when (val screen = currentScreen) {
        is AppScreen.Home -> {
            HomeScreen(
                historyRepository = historyRepository,
                onImageSelected = { bitmap ->
                    currentScreen = AppScreen.Crop(bitmap)
                },
                onSelectRecentFen = { board ->
                    currentScreen = AppScreen.Result(board)
                }
            )
        }

        is AppScreen.Crop -> {
            BackHandler {
                if (!isProcessing) currentScreen = AppScreen.Home
            }
            CropScreen(
                imageBitmap = screen.bitmap,
                isProcessing = isProcessing,
                onConfirmCrop = { croppedBitmap ->
                    scope.launch {
                        isProcessing = true
                        try {
                            val recognizedBoard = digitalClassifier.classifyBoard(croppedBitmap)
                            currentScreen = AppScreen.Result(recognizedBoard)
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error procesando imagen: ${e.message}", Toast.LENGTH_SHORT).show()
                            currentScreen = AppScreen.Result(BoardPosition.initial())
                        } finally {
                            isProcessing = false
                        }
                    }
                },
                onBack = {
                    currentScreen = AppScreen.Home
                }
            )
        }

        is AppScreen.Result -> {
            BackHandler {
                currentScreen = AppScreen.Home
            }
            ResultScreen(
                initialBoard = screen.board,
                onSaveToHistory = { fen, turn ->
                    historyRepository.addFen(fen = fen, turn = turn)
                },
                onNewScan = {
                    currentScreen = AppScreen.Home
                },
                onBack = {
                    currentScreen = AppScreen.Home
                }
            )
        }
    }
}
