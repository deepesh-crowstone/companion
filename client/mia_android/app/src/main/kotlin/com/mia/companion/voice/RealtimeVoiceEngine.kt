package com.mia.companion.voice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.sqrt

enum class CallConnectionState { CONNECTING, READY, ERROR, ENDED }

/**
 * xAI Realtime voice — PCM 24 kHz mono over WebSocket.
 * Half-duplex on mobile: mic stops while Mia speaks to avoid speaker echo loops.
 */
class RealtimeVoiceEngine(private val context: Context) {
    companion object {
        private const val SAMPLE_RATE = 24_000
        private const val PCM_BYTES_PER_SECOND = SAMPLE_RATE * 2
        private const val PLAYBACK_DRAIN_PADDING_MS = 900L
        private const val EMERGENCY_FALLBACK_MS = 12_000L
        private const val MIC_CHUNK_MS = 100
        private const val MIC_CHUNK_BYTES = SAMPLE_RATE * 2 * MIC_CHUNK_MS / 1000
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val micMutex = Mutex()

    private val _connection = MutableStateFlow(CallConnectionState.CONNECTING)
    val connection: StateFlow<CallConnectionState> = _connection.asStateFlow()

    private val _transcript = MutableSharedFlow<String>(extraBufferCapacity = 32)
    val transcript: SharedFlow<String> = _transcript.asSharedFlow()

    private val _level = MutableSharedFlow<Int>(extraBufferCapacity = 32)
    val level: SharedFlow<Int> = _level.asSharedFlow()

    private var webSocket: WebSocket? = null
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var micJob: Job? = null
    private val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var connected = false
    private var sessionReady = false
    private var fatalError = false
    private var muted = false
    private var speakerOn = false
    private var assistantSpeaking = false
    private var micRunning = false
    private var wantMicRunning = false
    private var assistantAudioBytes = 0
    private var assistantStartedAtMs = 0L
    private var assistantFinishRunnable: Runnable? = null
    private var sessionReadyDeferred: CompletableDeferred<Unit>? = null

    private val http = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    suspend fun connect(
        wsUrl: String,
        token: String,
        sessionConfig: Map<String, Any?>,
        sessionPreconfigured: Boolean,
    ) = withContext(Dispatchers.IO) {
        fatalError = false
        sessionReady = false
        assistantSpeaking = false
        assistantAudioBytes = 0
        sessionReadyDeferred = CompletableDeferred()
        _connection.value = CallConnectionState.CONNECTING

        configureAudioRoute()
        initPlayback()

        val request = Request.Builder()
            .url(wsUrl)
            .header("Authorization", "Bearer $token")
            .build()

        webSocket = http.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                if (!sessionPreconfigured) {
                    scope.launch {
                        delay(300)
                        val session = JSONObject(sessionConfig).apply {
                            remove("model")
                        }
                        sendJson(
                            JSONObject()
                                .put("type", "session.update")
                                .put("session", session),
                        )
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleEvent(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                emitError("connection lost: ${t.message}")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (connected && !fatalError) {
                    emitError("call disconnected")
                }
                connected = false
            }
        })

        val ready = withTimeoutOrNull(12_000) {
            sessionReadyDeferred?.await()
        }
        if (fatalError || !sessionReady || ready == null) {
            throw Exception(if (fatalError) "voice call failed" else "voice session not ready")
        }

        wantMicRunning = !muted
        applyMicState()
        _connection.value = CallConnectionState.READY
    }

    fun setMuted(value: Boolean) {
        muted = value
        wantMicRunning = connected && sessionReady && !muted && !assistantSpeaking
        scope.launch { applyMicState() }
        if (muted && connected) {
            sendJson(JSONObject().put("type", "input_audio_buffer.clear"))
        }
    }

    fun setSpeaker(on: Boolean) {
        speakerOn = on
        configureAudioRoute()
    }

    suspend fun hangUp() {
        connected = false
        sessionReady = false
        assistantSpeaking = false
        cancelAssistantFinishTimer()
        wantMicRunning = false
        applyMicState()
        webSocket?.close(1000, "hangup")
        webSocket = null
        releasePlayback()
        audioManager.mode = AudioManager.MODE_NORMAL
        _connection.value = CallConnectionState.ENDED
    }

    fun release() {
        scope.cancel()
        mainHandler.removeCallbacksAndMessages(null)
    }

    private fun configureAudioRoute() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = speakerOn
    }

    private fun initPlayback() {
        val minBuf = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(max(minBuf, PCM_BYTES_PER_SECOND))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
        track.play()
        audioTrack = track
    }

    private fun releasePlayback() {
        audioTrack?.let {
            try {
                it.stop()
                it.release()
            } catch (_: Exception) {
            }
        }
        audioTrack = null
    }

    private fun sendJson(obj: JSONObject) {
        webSocket?.send(obj.toString())
    }

    private fun markSessionReady() {
        if (sessionReady) return
        sessionReady = true
        sessionReadyDeferred?.complete(Unit)
    }

    private fun beginAssistantTurn() {
        if (assistantSpeaking) return
        assistantSpeaking = true
        assistantAudioBytes = 0
        assistantStartedAtMs = System.currentTimeMillis()
        cancelAssistantFinishTimer()
        wantMicRunning = false
        scope.launch { applyMicState() }
        sendJson(JSONObject().put("type", "input_audio_buffer.clear"))
        scheduleAssistantFinish(EMERGENCY_FALLBACK_MS)
    }

    private fun scheduleAssistantFinish(delayMs: Long) {
        cancelAssistantFinishTimer()
        val runnable = Runnable { finishAssistantTurn() }
        assistantFinishRunnable = runnable
        mainHandler.postDelayed(runnable, delayMs)
    }

    private fun cancelAssistantFinishTimer() {
        assistantFinishRunnable?.let { mainHandler.removeCallbacks(it) }
        assistantFinishRunnable = null
    }

    private fun finishAssistantTurn() {
        cancelAssistantFinishTimer()
        if (!assistantSpeaking) return
        assistantSpeaking = false
        assistantAudioBytes = 0
        assistantStartedAtMs = 0L
        sendJson(JSONObject().put("type", "input_audio_buffer.clear"))
        wantMicRunning = connected && sessionReady && !muted
        scope.launch { applyMicState() }
        scope.launch { _transcript.emit("…say something — i'm listening") }
    }

    private fun rescheduleFinishFromPlayback() {
        if (!assistantSpeaking) return
        val elapsedMs = if (assistantStartedAtMs == 0L) {
            0L
        } else {
            System.currentTimeMillis() - assistantStartedAtMs
        }
        val audioMs = (assistantAudioBytes.toDouble() / PCM_BYTES_PER_SECOND * 1000).toLong()
        val remainingMs = max(0L, audioMs - elapsedMs)
        scheduleAssistantFinish(remainingMs + PLAYBACK_DRAIN_PADDING_MS)
    }

    private fun emitError(message: String) {
        fatalError = true
        _connection.value = CallConnectionState.ERROR
        scope.launch { _transcript.emit(message) }
        sessionReadyDeferred?.complete(Unit)
    }

    private suspend fun applyMicState() = micMutex.withLock {
        while (micRunning != wantMicRunning) {
            if (wantMicRunning) startMicNow() else stopMicNow()
        }
    }

    private suspend fun startMicNow() {
        if (micRunning) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            throw Exception("Microphone permission denied")
        }

        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            max(minBuf, MIC_CHUNK_BYTES * 2),
        )
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw Exception("AudioRecord failed to initialize")
        }
        record.startRecording()
        audioRecord = record
        micRunning = true

        micJob = scope.launch {
            val buffer = ByteArray(MIC_CHUNK_BYTES)
            while (micRunning && connected && sessionReady && !muted && !assistantSpeaking) {
                val read = record.read(buffer, 0, buffer.size)
                if (read > 0) {
                    val chunk = if (read == buffer.size) buffer else buffer.copyOf(read)
                    _level.emit(rmsLevel(chunk))
                    val b64 = Base64.getEncoder().encodeToString(chunk)
                    sendJson(
                        JSONObject()
                            .put("type", "input_audio_buffer.append")
                            .put("audio", b64),
                    )
                } else if (read < 0) {
                    emitError("mic read error: $read")
                    break
                }
            }
        }
    }

    private suspend fun stopMicNow() {
        micJob?.cancel()
        micJob = null
        audioRecord?.let {
            try {
                if (it.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                    it.stop()
                }
                it.release()
            } catch (_: Exception) {
            }
        }
        audioRecord = null
        micRunning = false
    }

    private fun feedPcm(pcm: ByteArray) {
        if (pcm.isEmpty()) return
        try {
            audioTrack?.write(pcm, 0, pcm.size)
        } catch (_: Exception) {
        }
    }

    private fun handleEvent(raw: String) {
        val event = try {
            JSONObject(raw)
        } catch (_: Exception) {
            return
        }
        when (event.optString("type")) {
            "session.created", "session.updated", "conversation.created" -> markSessionReady()

            "response.output_audio.delta", "response.audio.delta" -> {
                val b64 = event.optString("delta")
                if (b64.isNotEmpty()) {
                    beginAssistantTurn()
                    val pcm = Base64.getDecoder().decode(b64)
                    assistantAudioBytes += pcm.size
                    feedPcm(pcm)
                    rescheduleFinishFromPlayback()
                }
            }

            "response.output_audio_transcript.delta" -> {
                val delta = event.optString("delta")
                if (delta.isNotEmpty()) scope.launch { _transcript.emit(delta) }
            }

            "response.output_audio_transcript.done" -> {
                val done = event.optString("transcript")
                if (done.isNotEmpty()) scope.launch { _transcript.emit(done) }
            }

            "input_audio_buffer.speech_started" -> {
                scope.launch {
                    _level.emit(40)
                    _transcript.emit("…i heard you")
                }
            }

            "input_audio_buffer.speech_stopped" -> {
                scope.launch { _transcript.emit("…one sec, mia is thinking") }
            }

            "response.done", "response.output_audio.done" -> rescheduleFinishFromPlayback()

            "response.cancelled" -> finishAssistantTurn()

            "error" -> {
                val err = event.optJSONObject("error")
                val msg = err?.optString("message") ?: event.toString()
                emitError(msg)
            }
        }
    }

    private fun rmsLevel(bytes: ByteArray): Int {
        if (bytes.size < 2) return 8
        var sum = 0.0
        var i = 0
        while (i < bytes.size - 1) {
            val sample = (bytes[i].toInt() and 0xFF) or (bytes[i + 1].toInt() shl 8)
            val signed = if (sample > 32767) sample - 65536 else sample
            sum += signed * signed
            i += 2
        }
        val rms = sqrt(sum / (bytes.size / 2))
        return rms.toInt().coerceIn(6, 56)
    }
}
