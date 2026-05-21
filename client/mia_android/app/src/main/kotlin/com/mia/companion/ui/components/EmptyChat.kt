package com.mia.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography

@Composable
fun EmptyChat(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .shadow(24.dp, CircleShape)
                .background(MiaColors.MiaBubble, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.FavoriteBorder,
                contentDescription = null,
                tint = MiaColors.AccentDeep,
                modifier = Modifier.size(36.dp),
            )
        }
        Spacer(Modifier.height(24.dp))
        Text("say hi to mia", style = MiaTypography.serifTitle(22f))
        Spacer(Modifier.height(10.dp))
        Text(
            "text her, send a voice note, or tap the phone icon for a live call.",
            style = MiaTypography.inter(14f, color = MiaColors.TextMuted, lineHeight = 20.3f),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        Text(
            "you're up early 👀",
            style = MiaTypography.inter(15f, color = MiaColors.TextPrimary),
            modifier = Modifier
                .background(MiaColors.MiaBubble.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}
