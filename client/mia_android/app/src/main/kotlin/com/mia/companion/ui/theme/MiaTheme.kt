package com.mia.companion.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mia.companion.R

object MiaFontFamilies {
    /** Bundled variable fonts — avoids crash from Google downloadable-font XML in Compose. */
    val Inter = FontFamily(
        Font(R.font.inter, FontWeight.Normal),
        Font(R.font.inter, FontWeight.Medium),
        Font(R.font.inter, FontWeight.SemiBold),
        Font(R.font.inter, FontWeight.Bold),
    )
    val Playfair = FontFamily(
        Font(R.font.playfair_display, FontWeight.SemiBold, FontStyle.Normal),
    )
}

@Composable
fun MiaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = MiaColors.Accent,
            surface = MiaColors.Background,
            background = MiaColors.Background,
            onBackground = MiaColors.TextPrimary,
            onSurface = MiaColors.TextPrimary,
        ),
        content = content,
    )
}

object MiaTypography {
    fun serifTitle(size: Float = 28f) = TextStyle(
        fontFamily = MiaFontFamilies.Playfair,
        fontSize = size.sp,
        fontWeight = FontWeight.SemiBold,
        color = MiaColors.MiaText,
        lineHeight = (size * 1.1f).sp,
    )

    fun inter(
        size: Float = 15f,
        weight: FontWeight = FontWeight.Normal,
        color: androidx.compose.ui.graphics.Color = MiaColors.MiaText,
        lineHeight: Float? = null,
        letterSpacing: Float = 0f,
    ): TextStyle = TextStyle(
        fontFamily = MiaFontFamilies.Inter,
        fontSize = size.sp,
        fontWeight = weight,
        color = color,
        lineHeight = (lineHeight ?: size * 1.4f).sp,
        letterSpacing = letterSpacing.sp,
    )

    fun chatBody(isUser: Boolean) = inter(
        size = 15f,
        lineHeight = 21f,
        color = if (isUser) MiaColors.Surface else MiaColors.MiaText,
    )

    fun caption() = inter(
        size = 11f,
        color = MiaColors.TextMuted,
        letterSpacing = 0.3f,
    )
}

@Composable
fun rememberSnackbar(): SnackbarHostState = remember { SnackbarHostState() }

fun bubbleShape(isUser: Boolean) = if (isUser) {
    RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 6.dp)
} else {
    RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 6.dp, bottomEnd = 22.dp)
}
