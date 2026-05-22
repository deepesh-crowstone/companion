import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../models/voice_upload.dart';

RecordConfig voiceRecordConfig() =>
    const RecordConfig(encoder: AudioEncoder.aacLc);

Future<String> createVoiceRecordingPath() async {
  final dir = await getTemporaryDirectory();
  return '${dir.path}/note_${DateTime.now().millisecondsSinceEpoch}.m4a';
}

Future<VoiceUpload> voiceUploadFromRecordingOutput(String output) async {
  final filename = output.split(Platform.pathSeparator).last;
  return VoiceUpload(
    filename: filename,
    mimeType: 'audio/mp4',
    localPlaybackUrl: Uri.file(output).toString(),
    filePath: output,
  );
}

Future<void> discardVoiceRecordingOutput(String? output) async {
  if (output == null) return;
  try {
    final file = File(output);
    if (file.existsSync()) file.deleteSync();
  } catch (_) {
    // Temp cleanup should never block the chat flow.
  }
}
