import '../utils/chat_dates.dart';

class ChatMessage {
  final int id;
  final String role;
  final String content;
  final String messageType;
  final String? audioUrl;
  final DateTime createdAt;
  final int? audioDurationSec;

  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.messageType,
    this.audioUrl,
    required this.createdAt,
    this.audioDurationSec,
  });

  bool get isUser => role == 'user';
  bool get isAudio => messageType == 'audio';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as int,
      role: json['role'] as String,
      content: json['content'] as String,
      messageType: json['messageType'] as String? ?? 'text',
      audioUrl: json['audioUrl'] as String?,
      createdAt: ChatDates.parseCreatedAt(json['createdAt'] as String),
    );
  }
}
