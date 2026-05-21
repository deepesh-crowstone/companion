package com.mia.companion.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import kotlin.math.sin

private const val BAR_COUNT = 12

/**
 * Live mic waveform driven by [micLevel] (0–1). Falls back to a soft idle pulse when quiet.
 */
@Composable
fun RecordingWaveform(
    micLevel: Float,
    modifier: Modifier = Modifier,
    width: Dp = 72.dp,
    height: Dp = 26.dp,
    compact: Boolean = false,
) {
    val barCount = if (compact) 8 else BAR_COUNT
    val samples = remember { mutableStateListOf<Float>() }

    LaunchedEffect(micLevel) {
        if (micLevel <= 0f) {
            samples.clear()
            return@LaunchedEffect
        }
        samples.add(micLevel.coerceIn(0f, 1f))
        while (samples.size > barCount) {
            samples.removeAt(0)
        }
    }

    val anim = rememberInfiniteTransition(label = "recordingWave")
    val phase by anim.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(if (compact) 500 else 420, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "phase",
    )

    val barWidth = if (compact) 2.5.dp else 3.dp
    val gap = if (compact) 1.5.dp else 2.dp
    val maxBar = if (compact) 18.dp else 24.dp
    val minBar = if (compact) 3.dp else 4.dp
    val alpha = if (compact) 0.7f else 0.82f

    Row(
        modifier = modifier
            .width(width)
            .height(height),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (i in 0 until barCount) {
            val historyIndex = samples.size - barCount + i
            val sample = samples.getOrNull(historyIndex)?.coerceIn(0f, 1f)
            val idle = 0.14f + sin(phase * 2f * Math.PI.toFloat() + i * 0.62f).let { (it + 1f) * 0.5f } * 0.1f
            val level = sample ?: idle
            val wobble = sin(phase * 2f * Math.PI.toFloat() + i * 0.48f) * 0.12f
            val shaped = (level * (0.78f + wobble)).coerceIn(0.08f, 1f)
            val barHeight = minBar + (maxBar - minBar) * shaped

            Box(
                modifier = Modifier
                    .padding(start = if (i == 0) 0.dp else gap)
                    .width(barWidth)
                    .height(barHeight)
                    .background(
                        MiaColors.AccentDeep.copy(alpha = alpha),
                        RoundedCornerShape(2.dp),
                    ),
            )
        }
    }
}
