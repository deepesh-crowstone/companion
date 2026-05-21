package com.mia.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import com.mia.companion.data.model.ChatMessage
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import com.mia.companion.ui.theme.bubbleShape
import com.mia.companion.utils.ChatDates

@Composable
fun ChatMessageTile(
    message: ChatMessage,
    showDateHeader: Boolean,
    compactTop: Boolean,
    isPlaying: Boolean,
    onPlayAudio: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        if (showDateHeader) {
            DateSeparator(ChatDates.parseCreatedAt(message.createdAt))
        }
        MessageBubble(
            message = message,
            compactTop = compactTop,
            isPlaying = isPlaying,
            onPlayAudio = onPlayAudio,
        )
    }
}

@Composable
fun MessageBubble(
    message: ChatMessage,
    compactTop: Boolean,
    isPlaying: Boolean,
    onPlayAudio: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val isUser = message.isUser
    val topPad = if (compactTop) 4.dp else 16.dp
    val maxWidth = LocalConfiguration.current.screenWidthDp.dp * 0.76f
    val bg = if (isUser) MiaColors.UserBubble else MiaColors.MiaBubble
    val shape = bubbleShape(isUser)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = topPad, bottom = 2.dp),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Box(
            modifier = Modifier
                .widthIn(min = 48.dp, max = maxWidth)
                .defaultMinSize(minHeight = 40.dp)
                .shadow(
                    elevation = 4.dp,
                    shape = shape,
                    clip = true,
                    ambientColor = androidx.compose.ui.graphics.Color.Black.copy(
                        alpha = if (isUser) 0.08f else 0.04f,
                    ),
                    spotColor = androidx.compose.ui.graphics.Color.Black.copy(
                        alpha = if (isUser) 0.08f else 0.04f,
                    ),
                )
                .background(bg, shape)
                .padding(
                    horizontal = if (message.isAudio) 12.dp else 16.dp,
                    vertical = if (message.isAudio) 10.dp else 12.dp,
                ),
        ) {
            if (message.isAudio) {
                VoiceNoteBubble(
                    isUser = isUser,
                    isPlaying = isPlaying,
                    seed = message.id,
                    durationSec = message.audioDurationSec,
                    onPlay = onPlayAudio,
                )
            } else {
                Text(
                    displayMessageText(message.content, isUser),
                    style = MiaTypography.chatBody(isUser),
                )
            }
        }
    }
}

private fun displayMessageText(content: String, isUser: Boolean): String {
    if (isUser) return content
    val hasNonLatin = content.any { ch ->
        val code = ch.code
        code > 0x024F && !ch.isWhitespace()
    }
    return if (hasNonLatin) content else content.lowercase()
}
