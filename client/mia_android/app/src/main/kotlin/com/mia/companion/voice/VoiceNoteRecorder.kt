package com.mia.companion.voice

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File

/**
 * Short voice-note capture for chat upload (AAC in MPEG_4 / .m4a).
 */
class VoiceNoteRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputPath: String? = null

    val isRecording: Boolean
        get() = recorder != null

    val currentPath: String?
        get() = outputPath

    @Throws(Exception::class)
    fun start(): String {
        stop(deleteFile = true)
        val file = File(context.cacheDir, "note_${System.currentTimeMillis()}.m4a")
        outputPath = file.absolutePath

        val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        try {
            mr.setAudioSource(MediaRecorder.AudioSource.MIC)
            mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            mr.setOutputFile(file.absolutePath)
            mr.prepare()
            mr.start()
            recorder = mr
            return file.absolutePath
        } catch (e: Exception) {
            try {
                mr.release()
            } catch (_: Exception) {
            }
            file.delete()
            outputPath = null
            throw e
        }
    }

    /**
     * Stops recording. Returns the file path, or null if nothing was recorded.
     * @param deleteFile if true, deletes the file after stop (cancel path).
     */
    /** Peak mic level since the last poll; call frequently while recording. */
    fun pollAmplitude(): Int {
        return try {
            recorder?.maxAmplitude ?: 0
        } catch (_: Exception) {
            0
        }
    }

    fun stop(deleteFile: Boolean = false): String? {
        val path = outputPath
        val mr = recorder
        recorder = null
        outputPath = null

        if (mr != null) {
            try {
                mr.stop()
            } catch (_: Exception) {
                // If stop fails the file is usually unusable.
            }
            try {
                mr.release()
            } catch (_: Exception) {
            }
        }

        if (deleteFile && path != null) {
            try {
                File(path).delete()
            } catch (_: Exception) {
            }
            return null
        }
        return path
    }
}
