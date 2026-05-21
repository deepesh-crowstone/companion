package com.mia.companion.ui.screens

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.outlined.Hearing
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.SignalWifiOff
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mia.companion.data.ApiClient
import com.mia.companion.ui.components.MiaAvatar
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import com.mia.companion.voice.CallConnectionState
import com.mia.companion.voice.RealtimeVoiceEngine
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.sin

@Composable
fun VoiceCallScreen(onEnd: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val engine = remember { RealtimeVoiceEngine(context) }

    var seconds by remember { mutableIntStateOf(0) }
    var transcript by remember { mutableStateOf("connecting…") }
    var error by remember { mutableStateOf<String?>(null) }
    var starting by remember { mutableStateOf(true) }
    var connected by remember { mutableStateOf(false) }
    var muted by remember { mutableStateOf(false) }
    var speaker by remember { mutableStateOf(false) }
    var bars by remember { mutableStateOf(List(28) { 10 }) }

    val connection by engine.connection.collectAsState()

    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (!granted) {
            starting = false
            error = "microphone permission is required for calls"
            transcript = "permission denied"
        } else {
            scope.launch {
                connectCall(engine) { starting = it }
            }
        }
    }

    LaunchedEffect(Unit) { micPermission.launch(Manifest.permission.RECORD_AUDIO) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            seconds++
        }
    }

    LaunchedEffect(Unit) {
        engine.transcript.collect { t ->
            if (t.contains("error", true) || t.contains("failed", true) ||
                t.contains("denied", true) || t.contains("disconnect", true)
            ) error = t
            transcript = if (t.startsWith("…")) t else "…$t"
        }
    }

    LaunchedEffect(Unit) {
        engine.level.collect { level ->
            bars = List(28) { i ->
                val wobble = (sin(seconds * 0.4 + i * 0.5) * 8).toInt()
                (level + wobble).coerceIn(6, 56)
            }
        }
    }

    LaunchedEffect(connection) {
        when (connection) {
            CallConnectionState.READY -> {
                starting = false
                connected = true
                error = null
                transcript = "…say something — i'm listening"
            }
            CallConnectionState.ERROR -> {
                starting = false
                connected = false
            }
            else -> Unit
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            scope.launch { engine.hangUp() }
            engine.release()
        }
    }

    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        0f, 1f, infiniteRepeatable(tween(2200), RepeatMode.Reverse), label = "p",
    )
    val scale = 1f + pulse * 0.06f

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to MiaColors.CallGradientTop,
                    0.45f to MiaColors.CallGradientMid,
                    1f to MiaColors.CallGradientBottom,
                ),
            ),
    ) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GlassButton(Icons.AutoMirrored.Filled.ArrowBack) {
                    scope.launch { engine.hangUp(); onEnd() }
                }
                Text(
                    "VOICE CALL",
                    style = MiaTypography.inter(11f, FontWeight.SemiBold, Color.White.copy(0.54f), letterSpacing = 2f),
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.width(44.dp))
            }
            Spacer(Modifier.height(32.dp))
            Box(
                modifier = Modifier
                    .size(168.dp)
                    .scale(scale)
                    .align(Alignment.CenterHorizontally)
                    .border(2.dp, Color.White.copy(alpha = 0.35f), CircleShape)
                    .shadow(48.dp, CircleShape, spotColor = MiaColors.Accent.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                MiaAvatar(size = 168.dp)
                if (starting) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .clip(CircleShape)
                            .background(Color.Black.copy(0.45f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = Color.White.copy(0.7f), strokeWidth = 2.dp)
                    }
                } else if (!connected) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .clip(CircleShape)
                            .background(Color.Black.copy(0.35f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.SignalWifiOff, null, tint = Color.White.copy(0.85f), modifier = Modifier.size(40.dp))
                    }
                }
            }
            Spacer(Modifier.height(28.dp))
            Text("Mia", style = MiaTypography.serifTitle(38f).copy(color = Color.White), modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.align(Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (connected) MiaColors.Online else Color(0xFFFF9800)),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    when {
                        connected -> "on the line · ${formatDuration(seconds)}"
                        starting -> "connecting…"
                        else -> "not connected"
                    },
                    style = MiaTypography.inter(13f, color = Color.White.copy(0.7f)),
                )
            }
            Spacer(Modifier.height(32.dp))
            Row(
                Modifier
                    .height(52.dp)
                    .align(Alignment.CenterHorizontally),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.Bottom,
            ) {
                bars.forEach { h ->
                    Box(
                        Modifier
                            .padding(horizontal = 2.dp)
                            .width(3.dp)
                            .height(h.dp)
                            .background(Color.White.copy(0.9f), RoundedCornerShape(2.dp)),
                    )
                }
            }
            Spacer(Modifier.height(28.dp))
            Text(
                error ?: transcript,
                style = MiaTypography.inter(15f, color = Color.White.copy(0.95f), lineHeight = 21.75f)
                    .copy(fontStyle = FontStyle.Italic),
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(horizontal = 24.dp)
                    .fillMaxWidth()
                    .background(Color.Black.copy(0.28f), RoundedCornerShape(22.dp))
                    .border(1.dp, Color.White.copy(0.08f), RoundedCornerShape(22.dp))
                    .padding(horizontal = 20.dp, vertical = 18.dp),
            )
            Spacer(Modifier.weight(1f))
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp, vertical = 28.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.Top,
            ) {
                CallAction(
                    if (muted) Icons.Outlined.MicOff else Icons.Outlined.Mic,
                    "MUTE",
                    muted,
                ) { muted = !muted; engine.setMuted(muted) }
                Box(
                    Modifier
                        .size(68.dp)
                        .shadow(20.dp, CircleShape, spotColor = Color(0xFFE53935).copy(0.55f))
                        .clip(CircleShape)
                        .background(Color(0xFFE53935))
                        .clickable {
                            scope.launch { engine.hangUp(); onEnd() }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.CallEnd, null, tint = Color.White, modifier = Modifier.size(30.dp))
                }
                CallAction(
                    if (speaker) Icons.Outlined.VolumeUp else Icons.Outlined.Hearing,
                    if (speaker) "SPEAKER" else "EARPIECE",
                    speaker,
                ) { speaker = !speaker; engine.setSpeaker(speaker) }
            }
        }
    }
}

@Composable
private fun GlassButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White.copy(0.14f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun CallAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Box(
            Modifier
                .size(54.dp)
                .clip(CircleShape)
                .background(if (active) Color.White.copy(0.22f) else Color.White.copy(0.1f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = Color.White.copy(0.85f))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = MiaTypography.inter(10f, FontWeight.SemiBold, Color.White.copy(0.54f), letterSpacing = 1.2f))
    }
}

private suspend fun connectCall(engine: RealtimeVoiceEngine, onStarting: (Boolean) -> Unit) {
    try {
        val session = ApiClient.createRealtimeSession()
        engine.connect(
            wsUrl = session.wsUrl,
            token = session.token,
            sessionConfig = session.sessionConfig ?: emptyMap(),
            sessionPreconfigured = session.sessionPreconfigured,
        )
        onStarting(false)
    } catch (_: Exception) {
        onStarting(false)
    }
}

private fun formatDuration(seconds: Int): String {
    val m = (seconds / 60).toString().padStart(2, '0')
    val s = (seconds % 60).toString().padStart(2, '0')
    return "$m:$s"
}
