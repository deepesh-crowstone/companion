package com.mia.companion.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import com.mia.companion.utils.ChatDates
import java.time.Instant

@Composable
fun DateSeparator(instant: Instant, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            ChatDates.dateLabel(instant),
            style = MiaTypography.inter(
                12f,
                FontWeight.Medium,
                MiaColors.TextMuted,
                letterSpacing = 0.2f,
            ),
            modifier = Modifier
                .shadow(2.dp, RoundedCornerShape(20.dp))
                .background(MiaColors.Surface.copy(alpha = 0.9f), RoundedCornerShape(20.dp))
                .border(1.dp, MiaColors.MiaBubble, RoundedCornerShape(20.dp))
                .padding(horizontal = 16.dp, vertical = 7.dp),
        )
    }
}
