import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import 'voice_note_mic_button.dart';
import 'voice_recording_bar.dart';

class ChatInputBar extends StatefulWidget {
  const ChatInputBar({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.recording,
    required this.recordingLocked,
    required this.recordingDuration,
    required this.recordingLevels,
    required this.slideCancelActive,
    required this.slideOffset,
    required this.sending,
    required this.onSend,
    required this.onTapStartAndLock,
    required this.onHoldStart,
    required this.onHoldSend,
    required this.onHoldCancel,
    required this.onSlideUpdate,
    this.emojiPickerOpen = false,
    this.onEmojiToggle,
    this.enabled = true,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool recording;
  final bool recordingLocked;
  final Duration recordingDuration;
  final List<double> recordingLevels;
  final bool slideCancelActive;
  final double slideOffset;
  final bool sending;
  final bool enabled;
  final bool emojiPickerOpen;
  final VoidCallback? onEmojiToggle;
  final VoidCallback onSend;
  final Future<void> Function() onTapStartAndLock;
  final Future<void> Function() onHoldStart;
  final VoidCallback onHoldSend;
  final VoidCallback onHoldCancel;
  final void Function(double offset, bool cancelActive) onSlideUpdate;

  @override
  State<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends State<ChatInputBar> {
  static const _iconGrey = Color(0xFFA89FA3);
  static const _showVoiceNoteMic = false;

  bool _hasText = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTextChanged);
    _hasText = widget.controller.text.trim().isNotEmpty;
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTextChanged);
    super.dispose();
  }

  void _onTextChanged() {
    final next = widget.controller.text.trim().isNotEmpty;
    if (next != _hasText) setState(() => _hasText = next);
  }

  bool get _canSendText => _hasText && widget.enabled && !widget.recording;

  // On desktop/web a physical Enter key should send the message, while
  // Shift+Enter inserts a newline. On mobile the soft-keyboard return key
  // continues to insert a newline (it doesn't emit a hardware key event).
  bool get _enterSendsMessage => switch (defaultTargetPlatform) {
    TargetPlatform.macOS ||
    TargetPlatform.windows ||
    TargetPlatform.linux => true,
    TargetPlatform.android ||
    TargetPlatform.iOS ||
    TargetPlatform.fuchsia => false,
  };

  KeyEventResult _handleKeyEvent(FocusNode node, KeyEvent event) {
    if (!_enterSendsMessage || event is! KeyDownEvent) {
      return KeyEventResult.ignored;
    }
    final isEnter =
        event.logicalKey == LogicalKeyboardKey.enter ||
        event.logicalKey == LogicalKeyboardKey.numpadEnter;
    if (!isEnter) return KeyEventResult.ignored;
    // Let Shift+Enter fall through so the TextField inserts a newline.
    if (HardwareKeyboard.instance.isShiftPressed) {
      return KeyEventResult.ignored;
    }
    if (_canSendText) widget.onSend();
    // Consume the event so no newline is inserted (web calls preventDefault).
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final canSendText = _canSendText;
    final holdActive = widget.recording && !widget.recordingLocked;
    final showLockedSend = widget.recording && widget.recordingLocked;
    final showMic = !_hasText && widget.enabled && !showLockedSend;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Container(
                constraints: BoxConstraints(
                  minHeight: widget.recording && holdActive ? 52 : 48,
                ),
                decoration: BoxDecoration(
                  color: MiaColors.surface,
                  borderRadius: BorderRadius.circular(26),
                  border: Border.all(
                    color: widget.recording
                        ? MiaColors.accentDeep.withValues(alpha: 0.45)
                        : MiaColors.miaBubble.withValues(alpha: 0.55),
                    width: widget.recording ? 1.5 : 1,
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: widget.recording
                    ? VoiceRecordingBar(
                        duration: widget.recordingDuration,
                        levels: widget.recordingLevels,
                        locked: widget.recordingLocked,
                        slideCancelActive: widget.slideCancelActive,
                        slideOffset: widget.slideOffset,
                        onCancelTap: widget.recordingLocked
                            ? widget.onHoldCancel
                            : null,
                      )
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          if (widget.onEmojiToggle != null)
                            _EmojiToggleButton(
                              isPickerOpen: widget.emojiPickerOpen,
                              enabled: widget.enabled,
                              onTap: widget.onEmojiToggle!,
                            ),
                          Expanded(
                            child: Focus(
                              canRequestFocus: false,
                              skipTraversal: true,
                              onKeyEvent: _handleKeyEvent,
                              child: TextField(
                                controller: widget.controller,
                                focusNode: widget.focusNode,
                                enabled: widget.enabled,
                                scrollPadding: const EdgeInsets.only(
                                  bottom: 120,
                                ),
                                minLines: 1,
                                maxLines: 4,
                                textAlignVertical: TextAlignVertical.center,
                                textCapitalization:
                                    TextCapitalization.sentences,
                                style: GoogleFonts.inter(
                                  fontSize: 15,
                                  height: 1.35,
                                  color: MiaColors.textPrimary,
                                ),
                                decoration: InputDecoration(
                                  hintText: 'message ${MiaProfile.name}...',
                                  hintStyle: GoogleFonts.inter(
                                    color: _iconGrey,
                                    fontSize: 15,
                                    height: 1.35,
                                    fontWeight: FontWeight.w400,
                                  ),
                                  border: InputBorder.none,
                                  isCollapsed: true,
                                  contentPadding: EdgeInsets.fromLTRB(
                                    widget.onEmojiToggle == null ? 18 : 4,
                                    12,
                                    18,
                                    12,
                                  ),
                                ),
                                onSubmitted: canSendText
                                    ? (_) => widget.onSend()
                                    : null,
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(width: 10),
            if (showLockedSend)
              _SendButton(canSend: true, onSend: widget.onHoldSend)
            else if (showMic && _showVoiceNoteMic)
              VoiceNoteMicButton(
                enabled: widget.enabled,
                holdActive: holdActive,
                onTapStartAndLock: widget.onTapStartAndLock,
                onHoldStart: widget.onHoldStart,
                onHoldSend: widget.onHoldSend,
                onHoldCancel: widget.onHoldCancel,
                onSlideUpdate: widget.onSlideUpdate,
              )
            else
              _SendButton(canSend: canSendText, onSend: widget.onSend),
          ],
        ),
      ),
    );
  }
}

class _EmojiToggleButton extends StatelessWidget {
  const _EmojiToggleButton({
    required this.isPickerOpen,
    required this.enabled,
    required this.onTap,
  });

  final bool isPickerOpen;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const iconGrey = Color(0xFFA89FA3);
    final color = enabled ? iconGrey : iconGrey.withValues(alpha: 0.5);

    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      child: Semantics(
        button: true,
        label: isPickerOpen ? 'Show keyboard' : 'Choose emoji',
        child: InkResponse(
          onTap: enabled ? onTap : null,
          radius: 22,
          containedInkWell: false,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 140),
                transitionBuilder: (child, anim) => ScaleTransition(
                  scale: anim,
                  child: FadeTransition(opacity: anim, child: child),
                ),
                child: Icon(
                  isPickerOpen
                      ? Icons.keyboard_alt_outlined
                      : Icons.emoji_emotions_outlined,
                  key: ValueKey<bool>(isPickerOpen),
                  size: 24,
                  color: color,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({required this.canSend, required this.onSend});

  final bool canSend;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final bg = canSend
        ? MiaColors.miaBubble
        : MiaColors.miaBubble.withValues(alpha: 0.55);

    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: canSend ? onSend : null,
          customBorder: const CircleBorder(),
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
            child: Transform.rotate(
              angle: -0.35,
              child: Icon(
                Icons.send_rounded,
                color: canSend
                    ? MiaColors.accentDeep
                    : MiaColors.accentDeep.withValues(alpha: 0.4),
                size: 21,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
