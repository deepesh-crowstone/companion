package com.mia.companion.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalViewConfiguration
import com.mia.companion.ui.util.MiaHaptics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val IconGrey = androidx.compose.ui.graphics.Color(0xFFA89FA3)

@Composable
fun ChatInputBar(
    text: String,
    onTextChange: (String) -> Unit,
    recording: Boolean,
    recordingLocked: Boolean,
    recordingDurationSec: Int,
    recordingMicLevel: Float,
    enabled: Boolean,
    onSend: () -> Unit,
    onMicTapLock: () -> Unit,
    onMicHoldStart: () -> Unit,
    onMicHoldSend: () -> Unit,
    onMicHoldCancel: () -> Unit,
    onRecordingCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasText = text.trim().isNotEmpty()
    val micHoldActive = recording && !recordingLocked
    val showMic = !hasText && enabled && !recordingLocked
    val showLockedSend = recording && recordingLocked
    val showSend = hasText && !recording

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MiaColors.ChatBackground)
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .defaultMinSize(minHeight = if (recording && !recordingLocked) 52.dp else 48.dp)
                .background(MiaColors.Surface, RoundedCornerShape(26.dp))
                .border(
                    width = if (recording) 1.5.dp else 1.dp,
                    color = if (recording) {
                        MiaColors.AccentDeep.copy(alpha = 0.45f)
                    } else {
                        MiaColors.MiaBubble.copy(alpha = 0.55f)
                    },
                    shape = RoundedCornerShape(26.dp),
                )
                .padding(horizontal = 2.dp),
        ) {
            if (recording) {
                if (recordingLocked) {
                    LockedRecordingBar(
                        durationLabel = formatDuration(recordingDurationSec),
                        micLevel = recordingMicLevel,
                        onCancel = onRecordingCancel,
                    )
                } else {
                    HoldRecordingBar(
                        durationLabel = formatDuration(recordingDurationSec),
                        micLevel = recordingMicLevel,
                    )
                }
            } else {
                BasicTextField(
                    value = text,
                    onValueChange = onTextChange,
                    enabled = enabled,
                    textStyle = MiaTypography.inter(15f, color = MiaColors.TextPrimary, lineHeight = 20.25f),
                    cursorBrush = SolidColor(MiaColors.Accent),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                    decorationBox = { inner ->
                        Box {
                            if (text.isEmpty()) {
                                Text(
                                    "message Mia...",
                                    style = MiaTypography.inter(15f, color = IconGrey, lineHeight = 20.25f),
                                )
                            }
                            inner()
                        }
                    },
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        when {
            showLockedSend -> {
                val view = LocalView.current
                SendCircleButton(
                    enabled = true,
                    onClick = {
                        MiaHaptics.medium(view)
                        onMicHoldSend()
                    },
                )
            }
            showMic -> MicCircleButton(
                enabled = enabled,
                holdActive = micHoldActive,
                onTapLock = onMicTapLock,
                onHoldStart = onMicHoldStart,
                onHoldEnd = onMicHoldSend,
                onHoldCancel = onMicHoldCancel,
            )
            else -> SendCircleButton(enabled = showSend, onClick = onSend)
        }
    }
}

@Composable
private fun SendCircleButton(enabled: Boolean, onClick: () -> Unit) {
    val bg = if (enabled) MiaColors.MiaBubble else MiaColors.MiaBubble.copy(alpha = 0.55f)
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(bg, CircleShape)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.Send,
            contentDescription = "Send",
            tint = if (enabled) MiaColors.AccentDeep else MiaColors.AccentDeep.copy(alpha = 0.4f),
            modifier = Modifier
                .size(21.dp)
                .rotate(-20f),
        )
    }
}

/**
 * Tap = lock recording; long-press = push-to-talk (release to send).
 * Avoid mixing [detectTapGestures] onPress with onTap — that caused instant send + crashes.
 */
@Composable
private fun MicCircleButton(
    enabled: Boolean,
    holdActive: Boolean,
    onTapLock: () -> Unit,
    onHoldStart: () -> Unit,
    onHoldEnd: () -> Unit,
    onHoldCancel: () -> Unit,
) {
    val view = LocalView.current
    val viewConfiguration = LocalViewConfiguration.current
    val longPressMs = viewConfiguration.longPressTimeoutMillis
    val bg = if (holdActive) MiaColors.AccentDeep else MiaColors.MiaBubble
    val iconTint = if (holdActive) MiaColors.Surface else MiaColors.AccentDeep

    Box(
        modifier = Modifier
            .then(
                if (holdActive) {
                    Modifier.shadow(12.dp, CircleShape, spotColor = MiaColors.AccentDeep.copy(alpha = 0.35f))
                } else {
                    Modifier
                },
            )
            .size(44.dp)
            .background(bg, CircleShape)
            .pointerInput(enabled, holdActive, longPressMs) {
                if (!enabled || holdActive) return@pointerInput
                coroutineScope {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        var longPressTriggered = false
                        val longPressJob = launch {
                            delay(longPressMs)
                            longPressTriggered = true
                            MiaHaptics.medium(view)
                            onHoldStart()
                        }
                        val up = waitForUpOrCancellation()
                        longPressJob.cancel()
                        if (up != null) {
                            if (longPressTriggered) {
                                onHoldEnd()
                            } else {
                                MiaHaptics.medium(view)
                                onTapLock()
                            }
                        } else if (longPressTriggered) {
                            MiaHaptics.reject(view)
                            onHoldCancel()
                        }
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Mic,
            contentDescription = "Voice note",
            tint = iconTint,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun LockedRecordingBar(
    durationLabel: String,
    micLevel: Float,
    onCancel: () -> Unit,
) {
    val view = LocalView.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Outlined.Delete,
            contentDescription = "Cancel",
            tint = MiaColors.AccentDeep,
            modifier = Modifier
                .size(40.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = {
                        MiaHaptics.reject(view)
                        onCancel()
                    },
                )
                .padding(8.dp),
        )
        RecordingDot()
        Spacer(Modifier.width(8.dp))
        Text(durationLabel, style = MiaTypography.inter(15f, FontWeight.SemiBold, MiaColors.TextPrimary))
        Spacer(Modifier.weight(1f))
        RecordingWaveform(micLevel = micLevel)
    }
}

@Composable
private fun HoldRecordingBar(durationLabel: String, micLevel: Float) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "slide to cancel",
            style = MiaTypography.inter(15f, FontWeight.SemiBold, MiaColors.AccentDeep),
            modifier = Modifier
                .weight(1f)
                .background(MiaColors.AccentDeep.copy(alpha = 0.1f), RoundedCornerShape(22.dp))
                .border(1.dp, MiaColors.AccentDeep.copy(alpha = 0.25f), RoundedCornerShape(22.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
        )
        Spacer(Modifier.width(8.dp))
        RecordingDot()
        Spacer(Modifier.width(8.dp))
        Text(durationLabel, style = MiaTypography.inter(16f, FontWeight.Bold, MiaColors.TextPrimary))
        Spacer(Modifier.width(6.dp))
        RecordingWaveform(
            micLevel = micLevel,
            width = 52.dp,
            height = 22.dp,
            compact = true,
        )
    }
}

@Composable
private fun RecordingDot() {
    val anim = rememberInfiniteTransition(label = "dot")
    val alpha by anim.animateFloat(
        0.45f,
        1f,
        infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "a",
    )
    Box(
        Modifier
            .size(10.dp)
            .background(MiaColors.AccentDeep.copy(alpha = alpha), CircleShape),
    )
}

private fun formatDuration(totalSec: Int): String {
    val m = totalSec / 60
    val s = totalSec % 60
    return "$m:${s.toString().padStart(2, '0')}"
}
