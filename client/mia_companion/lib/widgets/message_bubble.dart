import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/chat_message.dart';
import '../theme/mia_theme.dart';
import 'voice_note_bubble.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    this.onPlayAudio,
    this.isPlaying = false,
    this.showTimestamp = false,
    this.audioDurationSec,
    this.compactTop = false,
    this.receiptStatus,
  });

  final ChatMessage message;
  final VoidCallback? onPlayAudio;
  final bool isPlaying;
  final bool showTimestamp;
  final int? audioDurationSec;
  final MessageReceiptStatus? receiptStatus;

  /// Tighter gap when the previous message is from the same sender.
  final bool compactTop;

  static const double gapSameSender = 4;
  static const double gapNewSender = 16;

  EdgeInsets get _bubbleMargin => EdgeInsets.only(
    top: compactTop ? gapSameSender : gapNewSender,
    bottom: 2,
  );

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;

    if (message.isAudio) {
      return _buildAudioMessage(context, isUser);
    }

    final time = DateFormat('h:mm a').format(message.createdAt).toLowerCase();

    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Align(
            alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.sizeOf(context).width * 0.76,
              ),
              margin: _bubbleMargin,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isUser ? MiaColors.userBubble : MiaColors.miaBubble,
                borderRadius: MiaTheme.bubbleShape(isUser: isUser),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isUser ? 0.08 : 0.04),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: isUser
                    ? CrossAxisAlignment.end
                    : CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _displayText(message.content, isUser: isUser),
                    style: MiaTheme.chatBody(isUser: isUser),
                  ),
                  if (isUser && receiptStatus != null) ...[
                    const SizedBox(height: 4),
                    _ReceiptTicks(status: receiptStatus!),
                  ],
                ],
              ),
            ),
          ),
          if (showTimestamp)
            Padding(
              padding: EdgeInsets.only(
                left: isUser ? 0 : 8,
                right: isUser ? 8 : 0,
                bottom: 6,
              ),
              child: Text(time, style: MiaTheme.caption()),
            ),
        ],
      ),
    );
  }

  Widget _buildAudioMessage(BuildContext context, bool isUser) {
    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Align(
            alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              margin: _bubbleMargin,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isUser ? MiaColors.userBubble : MiaColors.miaBubble,
                borderRadius: MiaTheme.bubbleShape(isUser: isUser),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isUser ? 0.08 : 0.04),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: VoiceNoteBubble(
                isUser: isUser,
                isPlaying: isPlaying,
                seed: message.id,
                audioUrl: message.audioUrl,
                onPlay: onPlayAudio,
                fallbackDurationSec:
                    audioDurationSec ?? message.audioDurationSec,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _displayText(String text, {required bool isUser}) {
    if (isUser) return text;
    return text.toLowerCase();
  }
}

class _ReceiptTicks extends StatelessWidget {
  const _ReceiptTicks({required this.status});

  final MessageReceiptStatus status;

  @override
  Widget build(BuildContext context) {
    final isRead = status == MessageReceiptStatus.read;
    final color = isRead
        ? MiaColors.online
        : Colors.white.withValues(alpha: 0.68);
    final icon = status == MessageReceiptStatus.sent
        ? Icons.done
        : Icons.done_all;

    return Icon(icon, size: 15, color: color);
  }
}
