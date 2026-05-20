import 'package:flutter/material.dart';

import '../models/chat_message.dart';
import 'date_separator.dart';
import 'message_bubble.dart';

/// One row in the chat list (date header + bubble). Kept separate for repaint isolation.
class ChatMessageTile extends StatelessWidget {
  const ChatMessageTile({
    super.key,
    required this.message,
    required this.showDateHeader,
    required this.compactTop,
    required this.isPlaying,
    this.onPlayAudio,
  });

  final ChatMessage message;
  final bool showDateHeader;
  final bool compactTop;
  final bool isPlaying;
  final VoidCallback? onPlayAudio;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showDateHeader) DateSeparator(date: message.createdAt),
        MessageBubble(
          message: message,
          compactTop: compactTop,
          isPlaying: isPlaying,
          onPlayAudio: onPlayAudio,
        ),
      ],
    );
  }
}
