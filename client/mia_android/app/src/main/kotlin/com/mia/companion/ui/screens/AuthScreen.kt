package com.mia.companion.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.mia.companion.data.ApiClient
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.MiaTypography
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(onLoggedIn: () -> Unit) {
    var isRegister by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var serverReachable by remember { mutableStateOf<Boolean?>(null) }
    var showPassword by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        serverReachable = ApiClient.checkHealth()
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MiaColors.Accent,
        unfocusedBorderColor = MiaColors.MiaBubble,
        focusedContainerColor = MiaColors.Surface,
        unfocusedContainerColor = MiaColors.Surface,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MiaColors.Background),
    ) {
        if (serverReachable == false) {
            OfflineBanner(onRetry = { scope.launch { serverReachable = ApiClient.checkHealth() } })
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp, vertical = 28.dp),
        ) {
            Spacer(Modifier.height(48.dp))
            Text("mia", style = MiaTypography.serifTitle(44f))
            Spacer(Modifier.height(8.dp))
            Text(
                if (isRegister) "create your account" else "welcome back",
                style = MiaTypography.inter(15f, FontWeight.Medium, MiaColors.StatusPink),
            )
            Spacer(Modifier.height(40.dp))

            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                placeholder = { Text("username") },
                leadingIcon = { Icon(Icons.Outlined.Person, null, Modifier.size(22.dp)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = fieldColors,
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                placeholder = { Text("password") },
                leadingIcon = { Icon(Icons.Outlined.Lock, null, Modifier.size(22.dp)) },
                trailingIcon = {
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                            null,
                            Modifier.size(22.dp),
                        )
                    }
                },
                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                colors = fieldColors,
            )

            error?.let { msg ->
                Spacer(Modifier.height(16.dp))
                Text(
                    msg,
                    style = MiaTypography.inter(13f, color = MiaColors.AccentDeep, lineHeight = 17.55f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MiaColors.AccentDeep.copy(alpha = 0.08f), RoundedCornerShape(16.dp))
                        .border(1.dp, MiaColors.AccentDeep.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(14.dp),
                )
            }

            Spacer(Modifier.height(28.dp))
            Button(
                onClick = {
                    val u = username.trim()
                    if (u.length < 3 || !Regex("^[a-zA-Z0-9_]+$").matches(u)) {
                        error = "at least 3 characters, letters/numbers/underscore only"
                        return@Button
                    }
                    if (password.length < 6) {
                        error = "at least 6 characters"
                        return@Button
                    }
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            if (isRegister) ApiClient.register(u, password)
                            else ApiClient.login(u, password)
                            onLoggedIn()
                        } catch (e: Exception) {
                            error = friendlyAuthError(e)
                        } finally {
                            loading = false
                        }
                    }
                },
                enabled = !loading && serverReachable != false,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MiaColors.Accent,
                    disabledContainerColor = MiaColors.Accent.copy(alpha = 0.45f),
                ),
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = MiaColors.Surface,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(if (isRegister) "sign up" else "log in")
                }
            }
            TextButton(
                onClick = {
                    isRegister = !isRegister
                    error = null
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    if (isRegister) "already have an account? log in" else "new here? create account",
                    style = MiaTypography.inter(15f, FontWeight.Medium, MiaColors.AccentDeep),
                )
            }
        }
    }
}

@Composable
private fun OfflineBanner(onRetry: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MiaColors.AccentDeep.copy(alpha = 0.12f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Icon(Icons.Outlined.WifiOff, null, tint = MiaColors.AccentDeep, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            "can't reach server at ${ApiClient.apiBaseUrl}",
            style = MiaTypography.inter(12f, color = MiaColors.AccentDeep, lineHeight = 15.6f),
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRetry) {
            Text("retry", style = MiaTypography.inter(14f, FontWeight.SemiBold, MiaColors.AccentDeep))
        }
    }
}

private fun friendlyAuthError(e: Exception): String {
    val raw = e.message?.replace("Exception: ", "") ?: "something went wrong"
    if (raw.contains("Cannot reach server", ignoreCase = true)) {
        return "can't reach mia's server. on your phone open ${ApiClient.apiBaseUrl}/health — if that fails, set private DNS to automatic or dns.google, then try again."
    }
    if (raw.contains("Username already taken", ignoreCase = true)) return "that username is taken — try another."
    if (raw.contains("Invalid username or password", ignoreCase = true)) return "wrong username or password."
    return raw
}
