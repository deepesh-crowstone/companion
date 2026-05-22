import 'dart:js_interop';

import 'package:record/record.dart';
import 'package:web/web.dart' as web;

import '../models/voice_upload.dart';

RecordConfig voiceRecordConfig() =>
    const RecordConfig(encoder: AudioEncoder.opus);

Future<String> createVoiceRecordingPath() async {
  // The record web backend ignores this path and returns a blob URL on stop.
  return 'note_${DateTime.now().millisecondsSinceEpoch}.webm';
}

Future<VoiceUpload> voiceUploadFromRecordingOutput(String output) async {
  final response = await web.window.fetch(output.toJS).toDart;
  final buffer = await response.arrayBuffer().toDart;
  final bytes = buffer.toDart.asUint8List();
  return VoiceUpload(
    filename: 'note_${DateTime.now().millisecondsSinceEpoch}.webm',
    mimeType: 'audio/webm',
    localPlaybackUrl: output,
    bytes: bytes,
  );
}

Future<void> discardVoiceRecordingOutput(String? output) async {
  if (output == null || !output.startsWith('blob:')) return;
  web.URL.revokeObjectURL(output);
}
