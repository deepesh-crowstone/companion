package com.mia.companion.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.mia.companion.R
import com.mia.companion.data.MiaProfile
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography

@Composable
fun MiaAvatar(
    size: Dp,
    modifier: Modifier = Modifier,
    onTap: (() -> Unit)? = null,
    showBorder: Boolean = false,
    borderWidth: Dp = 0.dp,
) {
    var mod = modifier.size(size)
    if (onTap != null) mod = mod.clickable(onClick = onTap)

    val borderColor = if (showBorder) MiaColors.MiaBubble else MiaColors.Surface

    Box(
        modifier = mod
            .clip(CircleShape)
            .then(
                if (showBorder && borderWidth > 0.dp) {
                    Modifier.border(borderWidth, borderColor, CircleShape)
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.mia_profile),
            contentDescription = MiaProfile.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
    }
}

@Composable
fun MiaAvatarFallback(size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(listOf(MiaColors.MiaBubble, MiaColors.Accent)),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(MiaProfile.name.first().toString(), style = MiaTypography.serifTitle(size.value * 0.42f))
    }
}
