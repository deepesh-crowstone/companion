package com.mia.companion.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.mia.companion.data.ApiClient
import com.mia.companion.data.SessionStore
import com.mia.companion.ui.screens.AuthScreen
import com.mia.companion.ui.screens.ChatScreen
import com.mia.companion.ui.screens.ProfileScreen
import com.mia.companion.ui.screens.VoiceCallScreen
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.ui.theme.rememberSnackbar

object Routes {
    const val Bootstrap = "bootstrap"
    const val Auth = "auth"
    const val Chat = "chat"
    const val Profile = "profile"
    const val VoiceCall = "voice_call"
}

@Composable
fun MiaApp() {
    val nav = rememberNavController()
    val snackbar = rememberSnackbar()

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        snackbarHost = {
            SnackbarHost(snackbar) { data ->
                Snackbar(
                    snackbarData = data,
                    containerColor = MiaColors.ErrorBg,
                    contentColor = androidx.compose.ui.graphics.Color.White,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                )
            }
        },
        containerColor = MiaColors.Background,
    ) { innerPadding ->
        NavHost(
            navController = nav,
            startDestination = Routes.Bootstrap,
            modifier = Modifier
                .fillMaxSize()
                // Top inset only — chat screen handles keyboard + nav bar locally
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top)),
        ) {
            composable(Routes.Bootstrap) {
                BootstrapRoute(
                    onReady = { loggedIn ->
                        nav.navigate(if (loggedIn) Routes.Chat else Routes.Auth) {
                            popUpTo(Routes.Bootstrap) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.Auth) {
                AuthScreen(
                    onLoggedIn = {
                        nav.navigate(Routes.Chat) {
                            popUpTo(Routes.Auth) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.Chat) {
                ChatScreen(
                    snackbar = snackbar,
                    onLogout = {
                        nav.navigate(Routes.Auth) {
                            popUpTo(Routes.Chat) { inclusive = true }
                        }
                    },
                    onProfile = { nav.navigate(Routes.Profile) },
                    onVoiceCall = { nav.navigate(Routes.VoiceCall) },
                )
            }
            composable(Routes.Profile) {
                ProfileScreen(onBack = { nav.popBackStack() })
            }
            composable(Routes.VoiceCall) {
                VoiceCallScreen(onEnd = { nav.popBackStack() })
            }
        }
    }
}

@Composable
private fun BootstrapRoute(onReady: (Boolean) -> Unit) {
    var done by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        ApiClient.loadSession()
        var loggedIn = false
        if (SessionStore.isLoggedIn) {
            val reachable = ApiClient.checkHealth()
            loggedIn = reachable && ApiClient.validateSession()
        }
        done = true
        onReady(loggedIn)
    }
    if (!done) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = MiaColors.Accent)
        }
    }
}
