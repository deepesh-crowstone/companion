package com.mia.companion.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import kotlin.math.sin
import kotlin.random.Random

@Composable
fun VoiceNoteBubble(
    isUser: Boolean,
    isPlaying: Boolean,
    seed: Int,
    durationSec: Int?,
    onPlay: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val fg = if (isUser) MiaColors.Surface else MiaColors.AccentDeep
    val fgMuted = if (isUser) MiaColors.Surface.copy(alpha = 0.7f) else MiaColors.TextMuted
    val bars = rememberWaveform(seed)
    val anim = rememberInfiniteTransition(label = "wave")
    val phase by anim.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    val label = durationSec?.let { sec ->
        val m = sec / 60
        val r = sec % 60
        "%02d:%02d".format(m, r)
    } ?: "--:--"
    val maxW = LocalConfiguration.current.screenWidthDp.dp * 0.72f

    Row(
        modifier = modifier
            .widthIn(max = maxW.coerceAtMost(280.dp))
            .clickable(
                enabled = onPlay != null,
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = { onPlay?.invoke() },
            )
            .padding(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.height(28.dp),
        )
        Row(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp)
                .height(28.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            bars.forEachIndexed { i, base ->
                val boost = if (isPlaying) sin(phase * Math.PI.toFloat() * 2 + i * 0.45f) * 6f else 0f
                val h = (base + boost).coerceIn(4f, 28f)
                Box(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 0.8.dp)
                        .height(h.dp)
                        .background(
                            fg.copy(alpha = if (isPlaying) 0.95f else 0.55f),
                            RoundedCornerShape(1.5.dp),
                        ),
                )
            }
        }
        Text(
            label,
            style = MiaTypography.inter(12f, FontWeight.Medium, fgMuted),
            modifier = Modifier.padding(start = 10.dp),
        )
    }
}

@Composable
private fun rememberWaveform(seed: Int): List<Float> {
    val rng = Random(seed)
    return androidx.compose.runtime.remember(seed) {
        List(32) { 6f + rng.nextFloat() * 22f }
    }
}
