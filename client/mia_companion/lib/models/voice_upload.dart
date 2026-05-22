import 'dart:typed_data';

class VoiceUpload {
  const VoiceUpload({
    required this.filename,
    required this.mimeType,
    required this.localPlaybackUrl,
    this.filePath,
    this.bytes,
  }) : assert(filePath != null || bytes != null);

  final String filename;
  final String mimeType;
  final String localPlaybackUrl;
  final String? filePath;
  final Uint8List? bytes;
}
