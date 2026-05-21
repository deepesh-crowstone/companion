package com.mia.companion.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mia.companion.ui.theme.MiaColors

@Composable
fun ScrollToBottomButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.size(44.dp),
        shape = CircleShape,
        colors = CardDefaults.cardColors(containerColor = MiaColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        IconButton(onClick = onClick) {
            Icon(
                Icons.Filled.KeyboardArrowDown,
                contentDescription = "Scroll to bottom",
                tint = MiaColors.AccentDeep,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}
