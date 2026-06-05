import '../utils/chat_dates.dart';

enum MessageReceiptStatus { sent, delivered, read }

class ChatMessage {
  final int id;
  final String role;
  final String content;
  final String messageType;
  final String? audioUrl;
  final String? imageUrl;
  final String? imageKey;
  final DateTime createdAt;
  final int? audioDurationSec;

  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.messageType,
    this.audioUrl,
    this.imageUrl,
    this.imageKey,
    required this.createdAt,
    this.audioDurationSec,
  });

  bool get isUser => role == 'user';
  bool get isAudio => messageType == 'audio';
  bool get isImage => messageType == 'image';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as int,
      role: json['role'] as String,
      content: json['content'] as String,
      messageType: json['messageType'] as String? ?? 'text',
      audioUrl: json['audioUrl'] as String?,
      imageUrl: json['imageUrl'] as String?,
      imageKey: json['imageKey'] as String?,
      createdAt: ChatDates.parseCreatedAt(json['createdAt'] as String),
      audioDurationSec: json['audioDurationSec'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role,
    'content': content,
    'messageType': messageType,
    if (audioUrl != null) 'audioUrl': audioUrl,
    if (imageUrl != null) 'imageUrl': imageUrl,
    if (imageKey != null) 'imageKey': imageKey,
    // Stored as UTC so ChatDates.parseCreatedAt round-trips back to local.
    'createdAt': createdAt.toUtc().toIso8601String(),
    if (audioDurationSec != null) 'audioDurationSec': audioDurationSec,
  };

  ChatMessage copyWith({
    int? id,
    String? role,
    String? content,
    String? messageType,
    String? audioUrl,
    String? imageUrl,
    String? imageKey,
    DateTime? createdAt,
    int? audioDurationSec,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      content: content ?? this.content,
      messageType: messageType ?? this.messageType,
      audioUrl: audioUrl ?? this.audioUrl,
      imageUrl: imageUrl ?? this.imageUrl,
      imageKey: imageKey ?? this.imageKey,
      createdAt: createdAt ?? this.createdAt,
      audioDurationSec: audioDurationSec ?? this.audioDurationSec,
    );
  }
}
