import 'dart:async';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:record/record.dart';

import '../config.dart';
import '../data/mia_profile.dart';
import '../models/chat_message.dart';
import '../models/voice_upload.dart';
import '../utils/chat_dates.dart';
import '../utils/human_presence.dart';
import '../services/api_service.dart';
import '../services/session_expired.dart';
import '../services/voice_recording_platform.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_background.dart';
import '../utils/web_keyboard_inset.dart';
import '../widgets/chat_input_bar.dart';
import '../widgets/chat_message_tile.dart';
import '../widgets/empty_chat.dart';
import '../widgets/mia_presence_row.dart';
import '../widgets/mia_chat_header.dart';
import '../widgets/intimacy_unlock_sheet.dart';
import '../widgets/scroll_to_bottom_button.dart';
import '../models/intimacy.dart';
import 'mia_profile_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

enum _MiaActivity { none, typing, recording }

class _ChatScreenState extends State<ChatScreen> {
  /// Wait this long after the last send (and empty input) before Mia replies.
  static const _replyIdlePause = Duration(milliseconds: 2500);
  static const _receiptDeliveredDelay = Duration(milliseconds: 450);
  static const _receiptReadDelay = Duration(milliseconds: 1300);
  static const _postReadBeforeTypingDelay = Duration(milliseconds: 1500);

  final _input = TextEditingController();
  final _inputFocus = FocusNode();
  final _scroll = ScrollController();
  final _recorder = AudioRecorder();
  bool _pinnedToBottom = true;
  final _player = AudioPlayer();

  List<ChatMessage> _messages = [];
  bool _loading = true;
  _MiaActivity _miaActivity = _MiaActivity.none;

  bool get _showMiaActivity => _miaActivity != _MiaActivity.none;
  bool _recording = false;
  bool _recordingLocked = false;
  Duration _recordingDuration = Duration.zero;
  bool _slideCancelActive = false;
  double _voiceSlideOffset = 0;
  Timer? _recordDurationTimer;
  int? _playingId;
  StreamSubscription<PlayerState>? _playerSub;
  String _statusText = 'online now';

  final List<String> _textOutbox = [];
  final List<int> _pendingOptimisticIds = [];
  Timer? _replyTimer;
  int _replyGeneration = 0;
  final Map<int, MessageReceiptStatus> _receiptStatuses = {};
  final Map<int, DateTime> _receiptSentAt = {};

  int _unlockedIntimacyLevel = 1;
  bool _pageViewTracked = false;

  @override
  void initState() {
    super.initState();
    _input.addListener(_onInputChanged);
    _scroll.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _replyTimer?.cancel();
    _recordDurationTimer?.cancel();
    _input.removeListener(_onInputChanged);
    _scroll.removeListener(_onScroll);
    _inputFocus.dispose();
    _input.dispose();
    _scroll.dispose();
    _recorder.dispose();
    _playerSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final pinned = _scroll.position.pixels <= 72;
    if (pinned != _pinnedToBottom) {
      setState(() => _pinnedToBottom = pinned);
    }
  }

  void _jumpToBottom() {
    setState(() => _pinnedToBottom = true);
    _scrollToBottom(animate: true, force: true);
  }

  bool get _showScrollToBottom =>
      !_loading &&
      !_pinnedToBottom &&
      (_messages.isNotEmpty || _showMiaActivity);

  void _onInputChanged() {
    if (_input.text.isNotEmpty) {
      _abortMiaReply();
    } else if (_textOutbox.isNotEmpty && !_recording) {
      _scheduleMiaReply();
    }
  }

  String _statusWhenIdle() => 'online now';

  void _abortMiaReply() {
    _replyGeneration++;
    _replyTimer?.cancel();
    if (_showMiaActivity && mounted) {
      setState(() {
        _miaActivity = _MiaActivity.none;
        _statusText = _statusWhenIdle();
      });
    }
  }

  void _showMiaTypingIndicator() {
    setState(() {
      _miaActivity = _MiaActivity.typing;
      _statusText = 'typing...';
    });
  }

  void _showMiaRecordingIndicator() {
    setState(() {
      _miaActivity = _MiaActivity.recording;
      _statusText = 'recording audio...';
    });
  }

  void _scheduleMiaReply() {
    _replyTimer?.cancel();
    _replyTimer = Timer(_replyIdlePause, () {
      if (!mounted) return;
      if (_input.text.isNotEmpty || _textOutbox.isEmpty || _recording) return;
      unawaited(_flushTextOutbox());
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      if (!ApiService.instance.isLoggedIn) {
        await ApiService.instance.ensureAuthenticated();
      }
      final messages = await ApiService.instance.fetchMessages();
      IntimacyStatus? intimacy;
      try {
        intimacy = await ApiService.instance.fetchIntimacyStatus();
      } catch (_) {
        intimacy = null;
      }
      if (!mounted) return;
      setState(() {
        _messages = messages;
        if (intimacy != null) {
          _unlockedIntimacyLevel = intimacy.unlockedLevel;
        }
        _loading = false;
      });
      _trackPageViewedOnce();
      _scrollToBottom(force: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _trackPageViewedOnce();
      _handleError(e);
    }
  }

  void _trackPageViewedOnce() {
    if (_pageViewTracked) return;
    _pageViewTracked = true;
    unawaited(
      ApiService.instance.trackEvent(
        'page_viewed',
        eventTime: DateTime.now(),
        anonymous: true,
      ),
    );
  }

  void _onIntimacyUnlocked(IntimacyStatus status) {
    setState(() => _unlockedIntimacyLevel = status.unlockedLevel);
    MiaTheme.showMessage(
      context,
      '${status.tiers.firstWhere((t) => t.level == status.unlockedLevel).label} unlocked — go ahead 😊',
    );
  }

  Future<void> _maybeShowIntimacyNudge(IntimacyNudge? nudge) async {
    if (nudge == null || !mounted) return;
    if (nudge.requiredLevel <= _unlockedIntimacyLevel) return;
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    unawaited(
      ApiService.instance.trackEvent(
        'intimacy_detected',
        eventTime: DateTime.now(),
      ),
    );
    await showIntimacyUnlockSheet(
      context: context,
      nudge: nudge,
      onUnlocked: _onIntimacyUnlocked,
    );
  }

  /// Reverse list: offset 0 is the newest messages (bottom, above input).
  void _scrollToBottom({bool animate = false, bool force = false}) {
    if (!force && !_pinnedToBottom) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      if (animate) {
        _scroll.animateTo(
          0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
        );
      } else {
        _scroll.jumpTo(0);
      }
    });
  }

  int get _listItemCount => _messages.length + (_showMiaActivity ? 1 : 0);

  int? _messageIndexForListIndex(int index) {
    final pendingOffset = _showMiaActivity ? 1 : 0;
    if (_showMiaActivity && index == 0) return null;
    return _messages.length - 1 - (index - pendingOffset);
  }

  Widget _buildListItem(BuildContext context, int index) {
    if (_showMiaActivity && index == 0) {
      final compact =
          _messages.isNotEmpty && _messages.last.role == 'assistant';
      final kind = _miaActivity == _MiaActivity.recording
          ? MiaPresenceKind.recording
          : MiaPresenceKind.typing;
      return RepaintBoundary(
        child: MiaPresenceRow(kind: kind, compactTop: compact),
      );
    }

    final msgIndex = _messageIndexForListIndex(index)!;
    final msg = _messages[msgIndex];

    return RepaintBoundary(
      key: ValueKey(msg.id),
      child: ChatMessageTile(
        message: msg,
        showDateHeader: _showDateHeader(msgIndex),
        compactTop: _compactTop(msgIndex),
        isPlaying: _playingId == msg.id,
        onPlayAudio: msg.isAudio ? () => _playAudio(msg) : null,
        receiptStatus: msg.isUser ? _receiptStatuses[msg.id] : null,
      ),
    );
  }

  Future<void> _recoverSession() async {
    try {
      await ApiService.instance.ensureAuthenticated();
      await _load();
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      MiaTheme.showMessage(
        context,
        msg.contains('Cannot reach server')
            ? 'can\'t reach ${MiaProfile.name.toLowerCase()}\'s server. open $resolvedApiBaseUrl/health in your browser.'
            : 'couldn\'t restore your session. try refresh chat.',
      );
    }
  }

  void _handleError(Object e) {
    if (!mounted) return;
    if (e is SessionExpiredException) {
      unawaited(_recoverSession());
      return;
    }
    final msg = e.toString().replaceFirst('Exception: ', '');
    if (msg.contains('Session expired') || msg.contains('foreign key')) {
      unawaited(_recoverSession());
      return;
    }
    final short = msg.contains('Cannot reach server')
        ? 'can\'t reach ${MiaProfile.name.toLowerCase()}\'s server. open $resolvedApiBaseUrl/health in your phone browser, then reinstall the app with the production API URL.'
        : msg;
    MiaTheme.showMessage(context, short);
  }

  Future<void> _sendText() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;

    _input.clear();
    _abortMiaReply();

    final optimisticId = -DateTime.now().millisecondsSinceEpoch;
    final optimistic = ChatMessage(
      id: optimisticId,
      role: 'user',
      content: text,
      messageType: 'text',
      createdAt: DateTime.now(),
    );

    _textOutbox.add(text);
    _pendingOptimisticIds.add(optimisticId);
    _receiptStatuses[optimisticId] = MessageReceiptStatus.sent;
    _receiptSentAt[optimisticId] = DateTime.now();
    unawaited(_runReceiptSequence(optimisticId));

    setState(() {
      _messages = [..._messages, optimistic];
      _pinnedToBottom = true;
    });
    _scrollToBottom(force: true);
    _keepInputFocused();
    unawaited(_flushTextOutbox());
  }

  Future<void> _flushTextOutbox() async {
    if (_textOutbox.isEmpty || _input.text.isNotEmpty || _recording) return;

    final texts = List<String>.from(_textOutbox);
    final optimisticIds = List<int>.from(_pendingOptimisticIds);
    _textOutbox.clear();
    _pendingOptimisticIds.clear();

    final generation = ++_replyGeneration;

    try {
      final replyFuture = ApiService.instance.sendTextBatch(texts);
      await _ensureReceiptsRead(optimisticIds);
      if (!mounted || generation != _replyGeneration) {
        unawaited(replyFuture.then<void>((_) {}, onError: (_) {}));
        return;
      }

      await Future<void>.delayed(_postReadBeforeTypingDelay);
      if (!mounted || generation != _replyGeneration) {
        unawaited(replyFuture.then<void>((_) {}, onError: (_) {}));
        return;
      }

      _showMiaTypingIndicator();
      final typingElapsed = Stopwatch()..start();
      final result = await replyFuture;
      if (!mounted || generation != _replyGeneration) return;

      final assistants = result.assistants;
      final userIds = <int>[];
      setState(() {
        var updated = List<ChatMessage>.from(_messages);
        for (var i = 0; i < optimisticIds.length; i++) {
          final optId = optimisticIds[i];
          final idx = updated.indexWhere((m) => m.id == optId);
          if (idx >= 0 && i < result.users.length) {
            final userMsg = result.users[i];
            updated[idx] = userMsg;
            userIds.add(userMsg.id);
            _transferReceiptStatus(optId, userMsg.id);
          }
        }
        _messages = updated;
      });
      await _ensureReceiptsRead(userIds);
      if (!mounted || generation != _replyGeneration) return;

      await HumanPresence.waitRemaining(
        _assistantTypingDelay(assistants.isEmpty ? null : assistants.first),
        typingElapsed,
      );
      if (!mounted || generation != _replyGeneration) return;

      for (var i = 0; i < assistants.length; i++) {
        if (i > 0) {
          await Future<void>.delayed(_assistantTypingDelay(assistants[i]));
          if (!mounted || generation != _replyGeneration) return;
        }
        setState(() {
          _messages = [..._messages, assistants[i]];
          _miaActivity = i == assistants.length - 1
              ? _MiaActivity.none
              : _MiaActivity.typing;
          _statusText = i == assistants.length - 1
              ? _statusWhenIdle()
              : 'typing...';
        });
        _scrollToBottom(animate: true);
      }
      unawaited(_maybeShowIntimacyNudge(result.intimacyNudge));
    } catch (e) {
      if (!mounted || generation != _replyGeneration) return;
      setState(() {
        _messages = _messages
            .where((m) => !optimisticIds.contains(m.id))
            .toList();
        _miaActivity = _MiaActivity.none;
        _statusText = _statusWhenIdle();
        for (final id in optimisticIds) {
          _receiptStatuses.remove(id);
          _receiptSentAt.remove(id);
        }
      });
      _textOutbox.insertAll(0, texts);
      _pendingOptimisticIds.insertAll(0, optimisticIds);
      _handleError(e);
    }
  }

  Duration _assistantTypingDelay(ChatMessage? message) =>
      HumanPresence.typingDuration(message?.content ?? '');

  Future<void> _runReceiptSequence(int id) async {
    await Future<void>.delayed(_receiptDeliveredDelay);
    _setReceiptStatus(id, MessageReceiptStatus.delivered);
    await Future<void>.delayed(_receiptReadDelay - _receiptDeliveredDelay);
    _setReceiptStatus(id, MessageReceiptStatus.read);
  }

  void _setReceiptStatus(int id, MessageReceiptStatus status) {
    if (!mounted || !_receiptStatuses.containsKey(id)) return;
    final current = _receiptStatuses[id];
    if (current != null && current.index >= status.index) return;
    setState(() => _receiptStatuses[id] = status);
  }

  void _transferReceiptStatus(int fromId, int toId) {
    final status = _receiptStatuses.remove(fromId) ?? MessageReceiptStatus.sent;
    final sentAt = _receiptSentAt.remove(fromId) ?? DateTime.now();
    _receiptStatuses[toId] = status;
    _receiptSentAt[toId] = sentAt;
  }

  Future<void> _ensureReceiptsRead(List<int> ids) async {
    if (ids.isEmpty) return;
    while (mounted &&
        ids.any((id) => _receiptStatuses[id] != MessageReceiptStatus.read)) {
      final now = DateTime.now();
      var wait = _receiptReadDelay;
      for (final id in ids) {
        final sentAt = _receiptSentAt[id] ?? now;
        final elapsed = now.difference(sentAt);
        final remaining = _receiptReadDelay - elapsed;
        if (remaining <= Duration.zero) {
          _setReceiptStatus(id, MessageReceiptStatus.read);
        } else if (remaining < wait) {
          wait = remaining;
        }
      }
      if (ids.every(
        (id) => _receiptStatuses[id] == MessageReceiptStatus.read,
      )) {
        return;
      }
      await Future<void>.delayed(wait);
    }
  }

  Future<void> _startVoiceRecording() async {
    if (_recording) return;

    FocusScope.of(context).unfocus();
    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) {
      if (!mounted) return;
      MiaTheme.showMessage(
        context,
        'microphone permission is needed for voice notes',
      );
      return;
    }

    final path = await createVoiceRecordingPath();

    await _recorder.start(voiceRecordConfig(), path: path);

    if (!mounted) return;

    _recordDurationTimer?.cancel();
    _recordingDuration = Duration.zero;
    _recordDurationTimer = Timer.periodic(const Duration(milliseconds: 200), (
      _,
    ) {
      if (!mounted || !_recording) return;
      setState(() {
        _recordingDuration += const Duration(milliseconds: 200);
      });
    });

    setState(() {
      _recording = true;
      _recordingLocked = false;
      _statusText = 'listening…';
      _slideCancelActive = false;
      _voiceSlideOffset = 0;
    });
  }

  void _lockVoiceRecording() {
    if (!_recording || _recordingLocked) return;
    setState(() {
      _recordingLocked = true;
      _slideCancelActive = false;
      _voiceSlideOffset = 0;
    });
  }

  void _onVoiceSlideUpdate(double offset, bool cancelActive) {
    if (!mounted) return;
    setState(() {
      _voiceSlideOffset = offset;
      _slideCancelActive = cancelActive;
    });
  }

  Future<void> _tapStartAndLockVoiceNote() async {
    await _startVoiceRecording();
    if (!mounted || !_recording) return;
    _lockVoiceRecording();
  }

  Future<void> _cancelVoiceRecording() async {
    _recordDurationTimer?.cancel();
    _recordDurationTimer = null;

    String? path;
    try {
      if (await _recorder.isRecording()) {
        path = await _recorder.stop();
      }
    } catch (_) {}

    await discardVoiceRecordingOutput(path);

    if (!mounted) return;
    setState(() {
      _recording = false;
      _recordingLocked = false;
      _statusText = _statusWhenIdle();
      _slideCancelActive = false;
      _voiceSlideOffset = 0;
      _recordingDuration = Duration.zero;
    });
  }

  Future<void> _sendVoiceRecording() async {
    if (!_recording) return;

    _recordDurationTimer?.cancel();
    _recordDurationTimer = null;

    final duration = _recordingDuration;
    final path = await _recorder.stop();

    if (!mounted) return;
    setState(() {
      _recording = false;
      _recordingLocked = false;
      _slideCancelActive = false;
      _voiceSlideOffset = 0;
      _recordingDuration = Duration.zero;
    });

    if (path == null) return;

    if (duration < const Duration(milliseconds: 600)) {
      await discardVoiceRecordingOutput(path);
      if (mounted) {
        MiaTheme.showMessage(context, 'hold longer to record a voice note');
      }
      setState(() => _statusText = _statusWhenIdle());
      return;
    }

    _replyTimer?.cancel();
    late final VoiceUpload upload;
    try {
      upload = await voiceUploadFromRecordingOutput(path);
    } catch (e) {
      await discardVoiceRecordingOutput(path);
      if (!mounted) return;
      setState(() => _statusText = _statusWhenIdle());
      _handleError(e);
      return;
    }

    if (_textOutbox.isNotEmpty) {
      await _flushTextOutbox();
      if (!mounted) {
        await discardVoiceRecordingOutput(path);
        return;
      }
    }

    final optimisticId = -DateTime.now().millisecondsSinceEpoch;
    final durationSec = duration.inSeconds.clamp(1, 599);
    final optimistic = ChatMessage(
      id: optimisticId,
      role: 'user',
      content: 'voice note',
      messageType: 'audio',
      audioUrl: upload.localPlaybackUrl,
      createdAt: DateTime.now(),
      audioDurationSec: durationSec,
    );

    // 1) Your voice note appears first.
    setState(() {
      _messages = [..._messages, optimistic];
      _miaActivity = _MiaActivity.none;
      _pinnedToBottom = true;
    });
    _scrollToBottom(force: true);

    // 2) Then Mia's recording state (voice reply).
    await Future<void>.delayed(Duration.zero);
    if (!mounted) {
      await discardVoiceRecordingOutput(path);
      return;
    }
    _showMiaRecordingIndicator();
    _scrollToBottom(force: true);
    final recordingElapsed = Stopwatch()..start();

    try {
      final generation = ++_replyGeneration;
      final result = await ApiService.instance.sendVoice(upload);
      if (!mounted || generation != _replyGeneration) {
        await discardVoiceRecordingOutput(path);
        return;
      }

      await HumanPresence.waitRemaining(
        HumanPresence.recordingDuration(result.assistant.content),
        recordingElapsed,
      );
      if (!mounted || generation != _replyGeneration) {
        await discardVoiceRecordingOutput(path);
        return;
      }

      // 3) Then Mia's voice note.
      setState(() {
        _messages = [
          ..._messages.where((m) => m.id != optimisticId),
          result.user.copyWith(audioDurationSec: durationSec),
          result.assistant,
        ];
        _miaActivity = _MiaActivity.none;
        _statusText = _statusWhenIdle();
      });
      await discardVoiceRecordingOutput(path);
      _scrollToBottom(force: true, animate: true);
      unawaited(_maybeShowIntimacyNudge(result.intimacyNudge));
    } catch (e) {
      await discardVoiceRecordingOutput(path);
      if (!mounted) return;
      setState(() {
        _messages = _messages.where((m) => m.id != optimisticId).toList();
        _miaActivity = _MiaActivity.none;
        _statusText = _statusWhenIdle();
      });
      _handleError(e);
    }
  }

  Future<void> _playAudio(ChatMessage msg) async {
    if (msg.audioUrl == null) return;

    if (_playingId == msg.id) {
      await _player.stop();
      setState(() => _playingId = null);
      return;
    }

    try {
      final url = msg.audioUrl!;
      final playbackUrl =
          url.startsWith('http') ||
              url.startsWith('file://') ||
              url.startsWith('blob:')
          ? url
          : Uri.file(url).toString();
      await _player.setUrl(playbackUrl);
      await _playerSub?.cancel();
      _playerSub = _player.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed && mounted) {
          setState(() => _playingId = null);
        }
      });
      setState(() => _playingId = msg.id);
      await _player.play();
    } catch (e) {
      _handleError(e);
    }
  }

  bool _showDateHeader(int index) {
    return ChatDates.isFirstMessageOfDay(
      _messages.map((m) => m.createdAt).toList(),
      index,
    );
  }

  bool _sameSenderAsPrevious(int index) {
    if (index <= 0) return false;
    return _messages[index].role == _messages[index - 1].role;
  }

  bool _compactTop(int index) {
    if (_showDateHeader(index)) return false;
    return _sameSenderAsPrevious(index);
  }

  void _dismissKeyboard() {
    _inputFocus.unfocus();
    FocusManager.instance.primaryFocus?.unfocus();
  }

  void _keepInputFocused() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_recording) {
        _inputFocus.requestFocus();
      }
    });
  }

  void _onCallPressed() {
    unawaited(
      ApiService.instance.trackEvent(
        'call_button_clicked',
        eventTime: DateTime.now(),
      ),
    );
    MiaTheme.showMessage(
      context,
      'This feature is coming soon.',
      isError: false,
    );
  }

  void _openMenuSheet() {
    _dismissKeyboard();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: MiaColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: MiaColors.miaBubble,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.refresh_rounded),
              title: const Text('refresh chat'),
              onTap: () {
                Navigator.pop(ctx);
                _load();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    ).whenComplete(() {
      if (!mounted) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _dismissKeyboard();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: MiaBackground(
        child: Column(
          children: [
            MiaChatHeader(
              statusText: _statusText,
              onProfile: () {
                Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const MiaProfileScreen()));
              },
              onCall: _onCallPressed,
              onMenu: _openMenuSheet,
            ),
            Expanded(
              child: GestureDetector(
                onTap: _dismissKeyboard,
                behavior: HitTestBehavior.translucent,
                child: Stack(
                  alignment: Alignment.bottomRight,
                  clipBehavior: Clip.none,
                  children: [
                    _loading
                        ? const Center(
                            child: CircularProgressIndicator(
                              color: MiaColors.accent,
                              strokeWidth: 2.5,
                            ),
                          )
                        : _messages.isEmpty && !_showMiaActivity
                        ? const EmptyChat()
                        : RefreshIndicator(
                            color: MiaColors.accent,
                            onRefresh: _load,
                            child: ListView.builder(
                              controller: _scroll,
                              reverse: true,
                              keyboardDismissBehavior:
                                  ScrollViewKeyboardDismissBehavior.manual,
                              physics: const AlwaysScrollableScrollPhysics(
                                parent: ClampingScrollPhysics(),
                              ),
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                              cacheExtent: 800,
                              itemCount: _listItemCount,
                              itemBuilder: _buildListItem,
                            ),
                          ),
                    if (_showScrollToBottom)
                      Padding(
                        padding: const EdgeInsets.only(right: 12, bottom: 10),
                        child: ScrollToBottomButton(onPressed: _jumpToBottom),
                      ),
                  ],
                ),
              ),
            ),
            WebKeyboardInset(
              child: ChatInputBar(
                controller: _input,
                focusNode: _inputFocus,
                recording: _recording,
                recordingLocked: _recordingLocked,
                recordingDuration: _recordingDuration,
                slideCancelActive: _slideCancelActive,
                slideOffset: _voiceSlideOffset,
                sending: _showMiaActivity,
                enabled: !_loading,
                onSend: _sendText,
                onTapStartAndLock: _tapStartAndLockVoiceNote,
                onHoldStart: _startVoiceRecording,
                onHoldSend: () => unawaited(_sendVoiceRecording()),
                onHoldCancel: () => unawaited(_cancelVoiceRecording()),
                onSlideUpdate: _onVoiceSlideUpdate,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
