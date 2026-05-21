package com.mia.companion.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.bubbleShape
import kotlin.math.sin

enum class MiaPresenceKind { Typing, Recording }

@Composable
fun MiaPresenceRow(
    kind: MiaPresenceKind,
    compactTop: Boolean,
    modifier: Modifier = Modifier,
) {
    val topPad = if (compactTop) 4.dp else 16.dp
    Row(
        modifier = modifier
            .padding(top = topPad, bottom = 2.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        MiaAvatar(size = 28.dp)
        Box(Modifier.width(8.dp))
        PresenceBubble(kind)
    }
}

@Composable
private fun PresenceBubble(kind: MiaPresenceKind) {
    val shape = bubbleShape(isUser = false)
    Box(
        modifier = Modifier
            .height(36.dp)
            .shadow(2.dp, shape)
            .background(MiaColors.MiaBubble, shape)
            .padding(
                horizontal = if (kind == MiaPresenceKind.Typing) 14.dp else 16.dp,
                vertical = if (kind == MiaPresenceKind.Typing) 10.dp else 9.dp,
            ),
        contentAlignment = Alignment.Center,
    ) {
        when (kind) {
            MiaPresenceKind.Typing -> TypingDots()
            MiaPresenceKind.Recording -> RecordingMicPulse()
        }
    }
}

@Composable
private fun TypingDots() {
    val anim = rememberInfiniteTransition(label = "typing")
    val t by anim.animateFloat(
        0f,
        1f,
        infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "t",
    )
    Row(verticalAlignment = Alignment.Bottom) {
        repeat(3) { i ->
            val phase = t * 2f * Math.PI.toFloat() - i * 0.75f
            val y = sin(phase) * 4f
            val alpha = 0.55f + 0.35f * ((sin(phase) + 1f) / 2f)
            if (i > 0) Box(Modifier.width(4.dp))
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(MiaColors.TextMuted.copy(alpha = alpha)),
            )
        }
    }
}

@Composable
private fun RecordingMicPulse() {
    val anim = rememberInfiniteTransition(label = "mic")
    val pulse by anim.animateFloat(
        0.75f,
        1f,
        infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "pulse",
    )
    Icon(
        Icons.Rounded.Mic,
        contentDescription = null,
        tint = Color(0xFFE54D42),
        modifier = Modifier
            .size(18.dp)
            .alpha(pulse)
            .scale(0.92f + pulse * 0.08f),
    )
}
