package com.mia.companion.data.model

import com.squareup.moshi.Json
import java.time.Instant
import java.time.format.DateTimeFormatter

data class ChatMessage(
    val id: Int,
    val role: String,
    val content: String,
    @Json(name = "messageType") val messageType: String = "text",
    @Json(name = "audioUrl") val audioUrl: String? = null,
    @Json(name = "createdAt") val createdAt: String,
    @Json(name = "audioDurationSec") val audioDurationSec: Int? = null,
) {
    val isUser: Boolean get() = role == "user"
    val isAudio: Boolean get() = messageType == "audio"

    fun createdInstant(): Instant = Instant.parse(createdAt)

    companion object {
        fun optimisticText(id: Int, text: String): ChatMessage =
            ChatMessage(
                id = id,
                role = "user",
                content = text,
                messageType = "text",
                createdAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
            )

        fun optimisticVoice(id: Int, localPath: String, durationSec: Int): ChatMessage =
            ChatMessage(
                id = id,
                role = "user",
                content = "voice note",
                messageType = "audio",
                audioUrl = localPath,
                createdAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
                audioDurationSec = durationSec,
            )
    }
}

data class MessagesResponse(val messages: List<ChatMessage>)

data class AuthRequest(val username: String, val password: String)

data class AuthUser(val username: String)

data class AuthResponse(
    val token: String,
    val user: AuthUser,
    val error: String? = null,
)

data class TextBatchRequest(val texts: List<String>)

data class TextBatchResponse(
    @Json(name = "userMessages") val userMessages: List<ChatMessage>,
    @Json(name = "assistantMessage") val assistantMessage: ChatMessage,
)

data class VoiceMessageResponse(
    @Json(name = "userMessage") val userMessage: ChatMessage,
    @Json(name = "assistantMessage") val assistantMessage: ChatMessage,
)

data class RealtimeSessionResponse(
    val token: String,
    @Json(name = "wsUrl") val wsUrl: String,
    @Json(name = "sessionConfig") val sessionConfig: Map<String, Any?>? = null,
    @Json(name = "sessionPreconfigured") val sessionPreconfigured: Boolean = false,
)

data class ErrorBody(val error: String?)
