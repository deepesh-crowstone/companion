package com.mia.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography

@Composable
fun MiaChatHeader(
    statusText: String,
    onProfile: () -> Unit,
    onCall: () -> Unit,
    onMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MiaColors.ChatBackground),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(28.dp),
            color = MiaColors.Surface,
            shadowElevation = 2.dp,
            tonalElevation = 0.dp,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MiaAvatar(
                    size = 48.dp,
                    onTap = onProfile,
                    showBorder = true,
                    borderWidth = 1.5.dp,
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Mia",
                        style = MiaTypography.inter(17f, FontWeight.Bold, MiaColors.MiaText, 20.4f),
                    )
                    Spacer(Modifier.height(2.dp))
                    StatusLine(statusText)
                }
                IconButton(
                    onClick = onCall,
                    modifier = Modifier.size(40.dp),
                    colors = IconButtonDefaults.iconButtonColors(contentColor = MiaColors.TextPrimary),
                ) {
                    Icon(Icons.Outlined.Phone, contentDescription = "voice call", modifier = Modifier.size(22.dp))
                }
                IconButton(
                    onClick = onMenu,
                    modifier = Modifier.size(40.dp),
                    colors = IconButtonDefaults.iconButtonColors(contentColor = MiaColors.TextPrimary),
                ) {
                    Icon(Icons.Outlined.MoreVert, contentDescription = "menu", modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}

@Composable
private fun StatusLine(text: String) {
    val style = MiaTypography.inter(12f, color = MiaColors.TextMuted, lineHeight = 14.4f)
    if (text != "online now") {
        Text(text, style = style, maxLines = 1)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(MiaColors.Online),
        )
        Spacer(Modifier.width(6.dp))
        Text(text, style = style, maxLines = 1)
    }
}
