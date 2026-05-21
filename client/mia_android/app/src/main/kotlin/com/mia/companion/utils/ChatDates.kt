package com.mia.companion.utils

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object ChatDates {
    fun parseCreatedAt(raw: String): Instant {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return Instant.now()
        var normalized = if (trimmed.contains('T')) trimmed else trimmed.replaceFirst(' ', 'T')
        val hasOffset = normalized.endsWith('Z') ||
            Regex("[+-]\\d{2}:\\d{2}$").containsMatchIn(normalized)
        if (!hasOffset) normalized = "${normalized}Z"
        return Instant.parse(normalized)
    }

    fun isToday(instant: Instant): Boolean {
        val local = instant.atZone(ZoneId.systemDefault()).toLocalDate()
        return local == LocalDate.now()
    }

    fun isFirstMessageOfDay(createdAtList: List<Instant>, index: Int): Boolean {
        if (index <= 0 || index >= createdAtList.size) return index == 0
        val a = createdAtList[index].atZone(ZoneId.systemDefault()).toLocalDate()
        val b = createdAtList[index - 1].atZone(ZoneId.systemDefault()).toLocalDate()
        return a != b
    }

    fun dateLabel(instant: Instant): String {
        if (isToday(instant)) return "today"
        val fmt = DateTimeFormatter.ofPattern("EEE, d MMM")
        return fmt.format(instant.atZone(ZoneId.systemDefault())).lowercase()
    }
}
