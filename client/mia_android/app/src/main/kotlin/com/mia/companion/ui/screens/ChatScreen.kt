package com.mia.companion.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import com.mia.companion.ui.components.ChatMenuSheet
import com.mia.companion.voice.VoiceNoteRecorder
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.mia.companion.data.ApiClient
import com.mia.companion.data.MiaProfile
import com.mia.companion.data.SessionExpiredException
import com.mia.companion.data.model.ChatMessage
import com.mia.companion.ui.components.ChatInputBar
import com.mia.companion.ui.components.ChatMessageTile
import com.mia.companion.ui.components.EmptyChat
import com.mia.companion.ui.components.MiaChatHeader
import com.mia.companion.ui.components.MiaPresenceKind
import com.mia.companion.ui.components.MiaPresenceRow
import com.mia.companion.ui.components.ScrollToBottomButton
import com.mia.companion.ui.theme.MiaColors
import com.mia.companion.utils.ChatDates
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.max

private enum class MiaActivity { None, Typing, Recording }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    snackbar: SnackbarHostState,
    onLogout: () -> Unit,
    onProfile: () -> Unit,
    onVoiceCall: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    val messages = remember { mutableStateListOf<ChatMessage>() }
    var loading by remember { mutableStateOf(true) }
    var input by remember { mutableStateOf("") }
    var statusText by remember { mutableStateOf("offline") }
    var miaOnline by remember { mutableStateOf(false) }
    var miaActivity by remember { mutableStateOf(MiaActivity.None) }
    var playingId by remember { mutableStateOf<Int?>(null) }
    var showMenu by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var pinnedToBottom by remember { mutableStateOf(true) }

    val textOutbox = remember { mutableStateListOf<String>() }
    val pendingOptimisticIds = remember { mutableStateListOf<Int>() }
    var replyGeneration by remember { mutableIntStateOf(0) }
    var replyJob by remember { mutableStateOf<Job?>(null) }

    var recording by remember { mutableStateOf(false) }
    var recordingLocked by remember { mutableStateOf(false) }
    var recordingDurationSec by remember { mutableIntStateOf(0) }
    var recordingMicLevel by remember { mutableStateOf(0f) }
    var recordPath by remember { mutableStateOf<String?>(null) }
    var recordJob by remember { mutableStateOf<Job?>(null) }
    var pendingRecordLock by remember { mutableStateOf(true) }
    val voiceRecorder = remember { VoiceNoteRecorder(context) }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().also { p ->
            p.addListener(object : androidx.media3.common.Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == androidx.media3.common.Player.STATE_ENDED) playingId = null
                }
            })
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            replyJob?.cancel()
            recordJob?.cancel()
            voiceRecorder.stop(deleteFile = true)
            exoPlayer.release()
        }
    }

    fun statusWhenIdle() = if (miaOnline) "online now" else "offline"

    fun cancelRecording() {
        recordJob?.cancel()
        voiceRecorder.stop(deleteFile = true)
        recordPath = null
        recording = false
        recordingLocked = false
        recordingDurationSec = 0
        recordingMicLevel = 0f
        statusText = statusWhenIdle()
    }

    fun beginRecording(lock: Boolean) {
        try {
            val path = voiceRecorder.start()
            recordPath = path
            recording = true
            recordingLocked = lock
            recordingDurationSec = 0
            recordingMicLevel = 0.12f
            statusText = "listening…"
            recordJob?.cancel()
            val startedAt = System.currentTimeMillis()
            var smoothLevel = 0.12f
            recordJob = scope.launch {
                while (voiceRecorder.isRecording) {
                    delay(80)
                    recordingDurationSec =
                        ((System.currentTimeMillis() - startedAt) / 1000L).toInt()
                    val amp = voiceRecorder.pollAmplitude()
                    val raw = (amp / 1600f).coerceIn(0f, 1f)
                    smoothLevel = smoothLevel * 0.62f + raw * 0.38f
                    recordingMicLevel = smoothLevel.coerceIn(0.1f, 1f)
                }
            }
        } catch (e: Exception) {
            scope.launch {
                snackbar.showSnackbar(
                    e.message ?: "couldn't start recording",
                )
            }
            cancelRecording()
        }
    }

    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            beginRecording(pendingRecordLock)
        } else {
            scope.launch {
                snackbar.showSnackbar("microphone permission is needed for voice notes")
            }
        }
    }

    fun requestRecording(lock: Boolean) {
        if (recording || voiceRecorder.isRecording) return
        pendingRecordLock = lock
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            beginRecording(lock)
        } else {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun showError(e: Throwable) {
        scope.launch {
            when (e) {
                is SessionExpiredException -> {
                    ApiClient.logout()
                    snackbar.showSnackbar("please log in again.")
                    onLogout()
                }
                else -> {
                    val msg = e.message?.replace("Exception: ", "") ?: "error"
                    snackbar.showSnackbar(
                        if (msg.contains("Cannot reach server", true)) "can't reach ${MiaProfile.name.lowercase()}'s server" else msg,
                    )
                }
            }
        }
    }

    fun scrollToBottom() {
        scope.launch {
            if (messages.isNotEmpty()) listState.animateScrollToItem(0)
        }
    }

    fun scheduleMiaReply() {
        replyJob?.cancel()
        replyJob = scope.launch {
            delay(2500)
            if (input.isNotBlank() || textOutbox.isEmpty() || recording) return@launch
            flushTextOutbox(
                messages, textOutbox, pendingOptimisticIds,
                generation = ++replyGeneration,
                currentGeneration = { replyGeneration },
                setActivity = { miaActivity = it },
                setStatus = { statusText = it },
                onError = ::showError,
                scrollToBottom = ::scrollToBottom,
            )
        }
    }

    LaunchedEffect(listState.firstVisibleItemIndex) {
        pinnedToBottom = listState.firstVisibleItemIndex <= 1
    }

    LaunchedEffect(Unit) {
        try {
            messages.clear()
            messages.addAll(ApiClient.fetchMessages())
            loading = false
            scrollToBottom()
        } catch (e: Exception) {
            loading = false
            showError(e)
        }
    }

    suspend fun sendRecording() {
        recordJob?.cancel()
        val durationSec = recordingDurationSec
        val path = voiceRecorder.stop(deleteFile = false)
        recording = false
        recordingLocked = false
        recordingDurationSec = 0
        recordingMicLevel = 0f
        statusText = statusWhenIdle()
        recordPath = null
        if (path == null) return
        if (durationSec < 1) {
            File(path).delete()
            snackbar.showSnackbar("hold longer to record a voice note")
            return
        }
        replyJob?.cancel()
        if (textOutbox.isNotEmpty()) {
            flushTextOutbox(
                messages, textOutbox, pendingOptimisticIds,
                generation = ++replyGeneration,
                currentGeneration = { replyGeneration },
                setActivity = { miaActivity = it },
                setStatus = { statusText = it },
                onError = ::showError,
                scrollToBottom = ::scrollToBottom,
            )
        }
        val optId = -System.currentTimeMillis().toInt()
        messages.add(ChatMessage.optimisticVoice(optId, path, durationSec.coerceIn(1, 599)))
        scrollToBottom()
        scope.launch {
            delay(2000)
            miaOnline = true
            if (miaActivity == MiaActivity.None) statusText = "online now"
        }
        miaActivity = MiaActivity.Recording
        statusText = "recording audio..."
        val gen = ++replyGeneration
        val t0 = System.currentTimeMillis()
        try {
            val result = ApiClient.sendVoice(File(path))
            if (gen != replyGeneration) return
            delay(max(0, max(1200L, result.assistantMessage.content.length * 45L) - (System.currentTimeMillis() - t0)))
            messages.removeAll { it.id == optId }
            messages.add(result.userMessage)
            messages.add(result.assistantMessage)
            miaActivity = MiaActivity.None
            statusText = statusWhenIdle()
            scrollToBottom()
        } catch (e: Exception) {
            messages.removeAll { it.id == optId }
            miaActivity = MiaActivity.None
            statusText = statusWhenIdle()
            showError(e)
        } finally {
            File(path).delete()
        }
    }

    val showMiaActivity = miaActivity != MiaActivity.None
    val listItems = buildList {
        if (showMiaActivity) add(null as ChatMessage?)
        addAll(messages.asReversed())
    }
    val showScrollBtn = !loading && !pinnedToBottom && (messages.isNotEmpty() || showMiaActivity)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MiaColors.ChatBackground)
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        MiaChatHeader(
            statusText = statusText,
            onProfile = onProfile,
            onCall = onVoiceCall,
            onMenu = { showMenu = true },
        )

        Box(Modifier.weight(1f)) {
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MiaColors.Accent, strokeWidth = 2.5.dp)
                }
                messages.isEmpty() && !showMiaActivity -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    EmptyChat()
                }
                else -> PullToRefreshBox(
                    isRefreshing = refreshing,
                    onRefresh = {
                        scope.launch {
                            refreshing = true
                            try {
                                messages.clear()
                                messages.addAll(ApiClient.fetchMessages())
                            } catch (e: Exception) {
                                showError(e)
                            } finally {
                                refreshing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        state = listState,
                        reverseLayout = true,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = 16.dp,
                            end = 16.dp,
                            top = 4.dp,
                            // reverseLayout: bottom padding = visual top (below header)
                            bottom = 20.dp,
                        ),
                    ) {
                        itemsIndexed(listItems, key = { _, m -> m?.id ?: -999 }) { index, msg ->
                            if (msg == null) {
                                val compact = messages.isNotEmpty() && messages.last().role == "assistant"
                                MiaPresenceRow(
                                    kind = if (miaActivity == MiaActivity.Recording) {
                                        MiaPresenceKind.Recording
                                    } else {
                                        MiaPresenceKind.Typing
                                    },
                                    compactTop = compact,
                                )
                            } else {
                                val msgIndex = messages.indexOf(msg)
                                val showDate = ChatDates.isFirstMessageOfDay(
                                    messages.map { ChatDates.parseCreatedAt(it.createdAt) },
                                    msgIndex,
                                )
                                val compactTop = !showDate && msgIndex > 0 &&
                                    messages[msgIndex - 1].role == msg.role
                                ChatMessageTile(
                                    message = msg,
                                    showDateHeader = showDate,
                                    compactTop = compactTop,
                                    isPlaying = playingId == msg.id,
                                    onPlayAudio = if (msg.isAudio) {
                                        {
                                            val url = msg.audioUrl ?: return@ChatMessageTile
                                            if (playingId == msg.id) {
                                                exoPlayer.stop()
                                                playingId = null
                                            } else {
                                                val uri = if (url.startsWith("http")) url else Uri.fromFile(File(url)).toString()
                                                exoPlayer.setMediaItem(MediaItem.fromUri(uri))
                                                exoPlayer.prepare()
                                                exoPlayer.play()
                                                playingId = msg.id
                                            }
                                        }
                                    } else null,
                                )
                            }
                        }
                    }
                }
            }
            if (showScrollBtn) {
                ScrollToBottomButton(
                    onClick = {
                        pinnedToBottom = true
                        scrollToBottom()
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 12.dp, bottom = 10.dp),
                )
            }
        }

        ChatInputBar(
            text = input,
            onTextChange = {
                input = it
                if (it.isNotEmpty()) {
                    replyJob?.cancel()
                    miaActivity = MiaActivity.None
                    statusText = statusWhenIdle()
                } else if (textOutbox.isNotEmpty()) {
                    scheduleMiaReply()
                }
            },
            recording = recording,
            recordingLocked = recordingLocked,
            recordingDurationSec = recordingDurationSec,
            recordingMicLevel = if (recording) recordingMicLevel else 0f,
            enabled = !loading,
            onSend = {
                val text = input.trim()
                if (text.isEmpty()) return@ChatInputBar
                input = ""
                replyJob?.cancel()
                val optId = -System.currentTimeMillis().toInt()
                textOutbox.add(text)
                pendingOptimisticIds.add(optId)
                messages.add(ChatMessage.optimisticText(optId, text))
                scope.launch {
                    delay(2000)
                    miaOnline = true
                    if (miaActivity == MiaActivity.None) statusText = "online now"
                }
                scrollToBottom()
                scheduleMiaReply()
            },
            onMicTapLock = { requestRecording(lock = true) },
            onMicHoldStart = { requestRecording(lock = false) },
            onMicHoldSend = { scope.launch { sendRecording() } },
            onMicHoldCancel = { cancelRecording() },
            onRecordingCancel = { cancelRecording() },
        )
    }

    if (showMenu) {
        val sheetState = rememberModalBottomSheetState()
        ChatMenuSheet(
            sheetState = sheetState,
            onDismiss = { showMenu = false },
            onRefresh = {
                scope.launch {
                    try {
                        messages.clear()
                        messages.addAll(ApiClient.fetchMessages())
                    } catch (e: Exception) {
                        showError(e)
                    }
                }
            },
            onLogout = { showLogoutDialog = true },
        )
    }

    if (showLogoutDialog) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("log out?", style = com.mia.companion.ui.theme.MiaTypography.serifTitle(22f)) },
            text = { Text("you'll need to sign in again to message ${MiaProfile.name}.") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    showLogoutDialog = false
                    scope.launch { ApiClient.logout(); onLogout() }
                }) { Text("log out") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showLogoutDialog = false }) {
                    Text("cancel")
                }
            },
            containerColor = MiaColors.Surface,
            shape = RoundedCornerShape(20.dp),
        )
    }
}

private suspend fun flushTextOutbox(
    messages: MutableList<ChatMessage>,
    textOutbox: MutableList<String>,
    pendingOptimisticIds: MutableList<Int>,
    generation: Int,
    currentGeneration: () -> Int,
    setActivity: (MiaActivity) -> Unit,
    setStatus: (String) -> Unit,
    onError: (Throwable) -> Unit,
    scrollToBottom: () -> Unit,
) {
    if (textOutbox.isEmpty()) return
    val texts = textOutbox.toList()
    val optIds = pendingOptimisticIds.toList()
    textOutbox.clear()
    pendingOptimisticIds.clear()
    setActivity(MiaActivity.Typing)
    setStatus("typing...")
    val t0 = System.currentTimeMillis()
    try {
        val result = ApiClient.sendTextBatch(texts)
        if (currentGeneration() != generation) return
        val assistants = result.assistantMessages?.takeIf { it.isNotEmpty() }
            ?: listOf(result.assistantMessage)
        delay(max(0, initialAssistantChunkDelayMs(assistants) - (System.currentTimeMillis() - t0)))
        if (currentGeneration() != generation) return
        optIds.forEachIndexed { i, id ->
            val idx = messages.indexOfFirst { it.id == id }
            if (idx >= 0 && i < result.userMessages.size) messages[idx] = result.userMessages[i]
        }
        assistants.forEachIndexed { i, assistant ->
            if (i > 0) {
                delay(betweenAssistantChunksDelayMs(assistant))
                if (currentGeneration() != generation) return
            }
            messages.add(assistant)
            val isLast = i == assistants.lastIndex
            setActivity(if (isLast) MiaActivity.None else MiaActivity.Typing)
            setStatus(if (isLast) "offline" else "typing...")
            scrollToBottom()
        }
    } catch (e: Exception) {
        if (currentGeneration() != generation) return
        messages.removeAll { optIds.contains(it.id) }
        textOutbox.addAll(0, texts)
        pendingOptimisticIds.addAll(0, optIds)
        setActivity(MiaActivity.None)
        setStatus("offline")
        onError(e)
    }
}

private fun initialAssistantChunkDelayMs(assistants: List<ChatMessage>): Long {
    val chars = assistants.firstOrNull()?.content?.trim()?.length ?: 0
    val natural = (550L + chars * 36L).coerceIn(1100L, 16000L)
    return (natural * 0.65).toLong().coerceIn(650L, 2500L)
}

private fun betweenAssistantChunksDelayMs(message: ChatMessage): Long {
    val chars = message.content.trim().length
    return (1100L + chars * 55L).coerceIn(1400L, 4200L)
}
