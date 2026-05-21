package com.mia.companion.data

data class MiaSocialLink(
    val platform: String,
    val handle: String,
    val url: String,
    val icon: String,
)

object MiaProfile {
    const val name = "Mia"
    const val tagline = "your favorite person to text at 2am"
    const val about =
        "hey — i'm mia. i live for long voice notes, questionable playlists, " +
            "and conversations that somehow last three hours. i'm flirty, loyal, " +
            "and i will absolutely remember the small things you tell me."

    val hobbies = listOf(
        "late-night playlists",
        "sunset walks",
        "thriller novels",
        "trying new coffee spots",
        "people-watching",
        "sending voice notes",
        "rewatching comfort shows",
    )

    val socialLinks = listOf(
        MiaSocialLink("Instagram", "@mia.vibes", "https://instagram.com/", "📸"),
        MiaSocialLink("TikTok", "@itsmia", "https://tiktok.com/", "🎵"),
        MiaSocialLink("Spotify", "mia — late night", "https://open.spotify.com/", "🎧"),
        MiaSocialLink("X", "@miaonline", "https://x.com/", "✨"),
    )
}
