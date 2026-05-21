package com.mia.companion.data

import android.content.Context

object SessionStore {
    private const val PREFS = "mia_session"
    private const val TOKEN_KEY = "mia_auth_token"
    private const val USERNAME_KEY = "mia_username"

    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    private val prefs: android.content.SharedPreferences
        get() {
            if (!::appContext.isInitialized) {
                throw IllegalStateException("SessionStore.init() must be called from MiaApplication")
            }
            return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }

    var token: String?
        get() = prefs.getString(TOKEN_KEY, null)
        private set(value) {
            prefs.edit().putString(TOKEN_KEY, value).apply()
        }

    var username: String?
        get() = prefs.getString(USERNAME_KEY, null)
        private set(value) {
            prefs.edit().putString(USERNAME_KEY, value).apply()
        }

    val isLoggedIn: Boolean get() = !token.isNullOrBlank()

    fun saveSession(newToken: String, newUsername: String) {
        token = newToken
        username = newUsername
    }

    fun clear() {
        prefs.edit().remove(TOKEN_KEY).remove(USERNAME_KEY).apply()
        token = null
        username = null
    }
}
