import 'package:record/record.dart';

import '../models/voice_upload.dart';

RecordConfig voiceRecordConfig() =>
    throw UnsupportedError('voice recording is not supported on this platform');

Future<String> createVoiceRecordingPath() =>
    throw UnsupportedError('voice recording is not supported on this platform');

Future<VoiceUpload> voiceUploadFromRecordingOutput(String output) =>
    throw UnsupportedError('voice upload is not supported on this platform');

Future<void> discardVoiceRecordingOutput(String? output) async {}
