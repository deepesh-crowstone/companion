package com.mia.companion

import android.app.Application
import com.mia.companion.data.ApiClient
import com.mia.companion.data.SessionStore

class MiaApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionStore.init(this)
        ApiClient.init(this)
    }
}
