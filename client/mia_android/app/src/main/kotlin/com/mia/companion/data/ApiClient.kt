package com.mia.companion.data

import android.content.Context
import com.mia.companion.BuildConfig
import com.mia.companion.data.model.AuthRequest
import com.mia.companion.data.model.AuthResponse
import com.mia.companion.data.model.ChatMessage
import com.mia.companion.data.model.ErrorBody
import com.mia.companion.data.model.MessagesResponse
import com.mia.companion.data.model.RealtimeSessionResponse
import com.mia.companion.data.model.TextBatchRequest
import com.mia.companion.data.model.TextBatchResponse
import com.mia.companion.data.model.VoiceMessageResponse
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import java.io.File
import java.util.concurrent.TimeUnit

object ApiClient {
    private val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')
    private val jsonMedia = "application/json".toMediaType()

    private lateinit var api: MiaApi
    private lateinit var http: OkHttpClient
    private lateinit var moshi: Moshi

    fun init(@Suppress("UNUSED_PARAMETER") context: Context) {
        moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        http = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()

        api = Retrofit.Builder()
            .baseUrl("$baseUrl/")
            .client(http)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(MiaApi::class.java)
    }

    val apiBaseUrl: String get() = baseUrl

    private fun authHeader(): String {
        val token = SessionStore.token ?: throw SessionExpiredException()
        return "Bearer $token"
    }

    suspend fun loadSession() {
        // SessionStore reads prefs on access — nothing async required.
    }

    suspend fun checkHealth(): Boolean = withContext(Dispatchers.IO) {
        repeat(2) { attempt ->
            try {
                val req = Request.Builder().url("$baseUrl/health").get().build()
                http.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) return@withContext true
                }
            } catch (_: Exception) {
                if (attempt == 0) delay(800)
            }
        }
        false
    }

    suspend fun validateSession(): Boolean = withContext(Dispatchers.IO) {
        if (!SessionStore.isLoggedIn) return@withContext false
        try {
            val res = api.me(authHeader())
            if (res.code() == 401) {
                SessionStore.clear()
                return@withContext false
            }
            res.isSuccessful
        } catch (_: SessionExpiredException) {
            false
        } catch (_: Exception) {
            checkHealth()
        }
    }

    suspend fun register(username: String, password: String): AuthResponse =
        auth { api.register(AuthRequest(username, password)) }

    suspend fun login(username: String, password: String): AuthResponse =
        auth { api.login(AuthRequest(username, password)) }

    suspend fun logout() {
        SessionStore.clear()
    }

    suspend fun fetchMessages(): List<ChatMessage> = withContext(Dispatchers.IO) {
        val res = guard(api.getMessages(authHeader()))
        res.messages
    }

    suspend fun sendTextBatch(texts: List<String>): TextBatchResponse =
        withContext(Dispatchers.IO) {
            guard(api.sendTextBatch(authHeader(), TextBatchRequest(texts)))
        }

    suspend fun sendVoice(audioFile: File): VoiceMessageResponse =
        withContext(Dispatchers.IO) {
            val part = MultipartBody.Part.createFormData(
                "audio",
                audioFile.name,
                audioFile.asRequestBody("audio/*".toMediaType()),
            )
            guard(api.sendVoice(authHeader(), part))
        }

    suspend fun createRealtimeSession(): RealtimeSessionResponse =
        withContext(Dispatchers.IO) {
            val body = "{}".toRequestBody(jsonMedia)
            guard(api.createRealtimeSession(authHeader(), body))
        }

    private suspend fun auth(block: suspend () -> retrofit2.Response<AuthResponse>): AuthResponse {
        val res = withContext(Dispatchers.IO) { block() }
        if (!res.isSuccessful) {
            val err = res.errorBody()?.string()?.let { parseError(it) }
            throw Exception(err ?: "Authentication failed")
        }
        val body = res.body() ?: throw Exception("Authentication failed")
        SessionStore.saveSession(body.token, body.user.username)
        return body
    }

    private fun <T> guard(response: retrofit2.Response<T>): T {
        if (response.code() == 401) {
            SessionStore.clear()
            throw SessionExpiredException()
        }
        if (!response.isSuccessful) {
            val err = response.errorBody()?.string()?.let { parseError(it) }
            throw Exception(err ?: "Request failed (${response.code()})")
        }
        return response.body() ?: throw Exception("Empty response")
    }

    private fun parseError(raw: String): String? {
        return try {
            moshi.adapter(ErrorBody::class.java).fromJson(raw)?.error
        } catch (_: Exception) {
            null
        }
    }

    fun connectionError(detail: String? = null): String {
        val extra = detail?.let { "\n$it" } ?: ""
        return "Cannot reach server at $baseUrl.$extra\n" +
            "1. On your phone browser open: $baseUrl/health\n" +
            "2. Rebuild the APK if you changed the API URL."
    }
}

private interface MiaApi {
    @GET("health")
    suspend fun health(): retrofit2.Response<Map<String, Boolean>>

    @GET("auth/me")
    suspend fun me(@Header("Authorization") auth: String): retrofit2.Response<Map<String, Any>>

    @POST("auth/register")
    suspend fun register(@Body body: AuthRequest): retrofit2.Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: AuthRequest): retrofit2.Response<AuthResponse>

    @GET("messages")
    suspend fun getMessages(
        @Header("Authorization") auth: String,
    ): retrofit2.Response<MessagesResponse>

    @POST("messages/text/batch")
    suspend fun sendTextBatch(
        @Header("Authorization") auth: String,
        @Body body: TextBatchRequest,
    ): retrofit2.Response<TextBatchResponse>

    @Multipart
    @POST("messages/voice")
    suspend fun sendVoice(
        @Header("Authorization") auth: String,
        @Part audio: MultipartBody.Part,
    ): retrofit2.Response<VoiceMessageResponse>

    @POST("realtime/session")
    suspend fun createRealtimeSession(
        @Header("Authorization") auth: String,
        @Body body: okhttp3.RequestBody,
    ): retrofit2.Response<RealtimeSessionResponse>
}
