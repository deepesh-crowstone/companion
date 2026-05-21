package com.mia.companion.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBackIos
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mia.companion.data.MiaProfile
import com.mia.companion.data.MiaSocialLink
import com.mia.companion.ui.components.MiaAvatar
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography

@Composable
fun ProfileScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MiaColors.Background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBackIos, null, tint = MiaColors.TextPrimary, modifier = Modifier.size(20.dp))
            }
            Text(
                "profile",
                style = MiaTypography.inter(16f, FontWeight.SemiBold, MiaColors.TextPrimary),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(48.dp))
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MiaAvatar(size = 108.dp, showBorder = true, borderWidth = 3.dp)
            Spacer(Modifier.height(16.dp))
            Text("Mia", style = MiaTypography.serifTitle(32f))
            Spacer(Modifier.height(6.dp))
            Text(MiaProfile.tagline, style = MiaTypography.inter(14f, FontWeight.Medium, MiaColors.StatusPink))
            Spacer(Modifier.height(24.dp))
            ProfileSectionCard("about me") {
                Text(MiaProfile.about, style = MiaTypography.inter(15f, lineHeight = 22.5f))
            }
            Spacer(Modifier.height(16.dp))
            ProfileSectionCard("hobbies") { HobbiesWrap() }
            Spacer(Modifier.height(16.dp))
            ProfileSectionCard("social") {
                MiaProfile.socialLinks.forEach { link ->
                    SocialTile(link)
                    Spacer(Modifier.height(8.dp))
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HobbiesWrap() {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        MiaProfile.hobbies.forEach { hobby ->
            Text(
                hobby,
                style = MiaTypography.inter(13f, FontWeight.Medium, MiaColors.MiaText),
                modifier = Modifier
                    .background(MiaColors.MiaBubble.copy(alpha = 0.65f), RoundedCornerShape(20.dp))
                    .border(1.dp, MiaColors.Accent.copy(alpha = 0.2f), RoundedCornerShape(20.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun ProfileSectionCard(title: String, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(12.dp, RoundedCornerShape(22.dp))
            .background(MiaColors.Surface, RoundedCornerShape(22.dp))
            .border(1.dp, MiaColors.MiaBubble, RoundedCornerShape(22.dp))
            .padding(18.dp),
    ) {
        Text(
            title,
            style = MiaTypography.inter(13f, FontWeight.Bold, MiaColors.AccentDeep, letterSpacing = 0.6f),
        )
        Spacer(Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun SocialTile(link: MiaSocialLink) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MiaColors.Background, RoundedCornerShape(16.dp))
            .clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link.url)))
            }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(link.icon, style = MiaTypography.inter(22f))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(link.platform, style = MiaTypography.inter(14f, FontWeight.SemiBold, MiaColors.MiaText))
            Text(link.handle, style = MiaTypography.inter(13f, color = MiaColors.TextMuted))
        }
        Icon(Icons.Outlined.OpenInNew, null, tint = MiaColors.TextMuted.copy(alpha = 0.8f), modifier = Modifier.size(18.dp))
    }
}
