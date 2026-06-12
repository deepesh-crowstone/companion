package com.mia.companion.mia_companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Edge-to-edge (Android 15+): draw behind system bars; Flutter handles insets.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        createNotificationChannel()
        super.onCreate(savedInstanceState)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            "zara_messages",
            "Messages from Zara",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "New messages from Zara"
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(channel)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.mia.companion.mia_companion/pip",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "enter" -> result.success(enterPip())
                else -> result.notImplemented()
            }
        }
    }

    private fun enterPip(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        if (isInPictureInPictureMode) return true
        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(9, 16))
            .build()
        return enterPictureInPictureMode(params)
    }
}
