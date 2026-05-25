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
    this.audioDurationSec,
    this.compactTop = false,
    this.receiptStatus,
  });

  final ChatMessage message;
  final VoidCallback? onPlayAudio;
  final bool isPlaying;
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

    return Padding(
      padding: EdgeInsets.zero,
      child: Align(
        alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * 0.76,
          ),
          margin: _bubbleMargin,
          padding: const EdgeInsets.fromLTRB(14, 10, 12, 8),
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
          child: _BubbleContent(
            text: _displayText(message.content, isUser: isUser),
            time: _formatTime(message.createdAt),
            isUser: isUser,
            receiptStatus: isUser ? receiptStatus : null,
          ),
        ),
      ),
    );
  }

  static String _formatTime(DateTime dt) {
    return DateFormat('h:mm a').format(dt).toLowerCase();
  }

  Widget _buildAudioMessage(BuildContext context, bool isUser) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: _bubbleMargin,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
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
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            VoiceNoteBubble(
              isUser: isUser,
              isPlaying: isPlaying,
              seed: message.id,
              audioUrl: message.audioUrl,
              onPlay: onPlayAudio,
              fallbackDurationSec:
                  audioDurationSec ??
                  message.audioDurationSec ??
                  _estimatedAssistantAudioDurationSec(message),
            ),
            const SizedBox(height: 2),
            _MetaRow(
              time: _formatTime(message.createdAt),
              receiptStatus: isUser ? receiptStatus : null,
            ),
          ],
        ),
      ),
    );
  }

  String _displayText(String text, {required bool isUser}) {
    if (isUser) return text;
    return text.toLowerCase();
  }

  int? _estimatedAssistantAudioDurationSec(ChatMessage message) {
    if (message.isUser || !message.isAudio) return null;
    final chars = message.content.trim().length;
    if (chars == 0) return 1;
    return ((1.0 + chars * 0.055).round()).clamp(1, 599);
  }
}

class _BubbleContent extends StatelessWidget {
  const _BubbleContent({
    required this.text,
    required this.time,
    required this.isUser,
    required this.receiptStatus,
  });

  final String text;
  final String time;
  final bool isUser;
  final MessageReceiptStatus? receiptStatus;

  @override
  Widget build(BuildContext context) {
    final meta = _MetaRow(time: time, receiptStatus: receiptStatus);

    return IntrinsicWidth(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(text, style: MiaTheme.chatBody(isUser: isUser)),
          const SizedBox(height: 2),
          Align(alignment: Alignment.centerRight, child: meta),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.time, required this.receiptStatus});

  final String time;
  final MessageReceiptStatus? receiptStatus;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          time,
          style: MiaTheme.caption().copyWith(
            fontSize: 10.5,
            color: MiaColors.textMuted,
          ),
        ),
        if (receiptStatus != null) ...[
          const SizedBox(width: 4),
          _ReceiptTicks(status: receiptStatus!),
        ],
      ],
    );
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
        : MiaColors.textMuted.withValues(alpha: 0.7);
    final icon = status == MessageReceiptStatus.sent
        ? Icons.done
        : Icons.done_all;

    return Icon(icon, size: 14, color: color);
  }
}
