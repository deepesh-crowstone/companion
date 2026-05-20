import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

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
    required this.slideCancelActive,
    required this.slideOffset,
    required this.sending,
    required this.onSend,
    required this.onTapStartAndLock,
    required this.onHoldStart,
    required this.onHoldSend,
    required this.onHoldCancel,
    required this.onSlideUpdate,
    this.enabled = true,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool recording;
  final bool recordingLocked;
  final Duration recordingDuration;
  final bool slideCancelActive;
  final double slideOffset;
  final bool sending;
  final bool enabled;
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

  @override
  Widget build(BuildContext context) {
    final canSendText = _hasText && widget.enabled && !widget.recording;
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
                        locked: widget.recordingLocked,
                        slideCancelActive: widget.slideCancelActive,
                        slideOffset: widget.slideOffset,
                        onCancelTap: widget.recordingLocked
                            ? widget.onHoldCancel
                            : null,
                      )
                    : TextField(
                        controller: widget.controller,
                        focusNode: widget.focusNode,
                        enabled: widget.enabled,
                        scrollPadding: const EdgeInsets.only(bottom: 120),
                        minLines: 1,
                        maxLines: 4,
                        textAlignVertical: TextAlignVertical.center,
                        textCapitalization: TextCapitalization.sentences,
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          height: 1.35,
                          color: MiaColors.textPrimary,
                        ),
                        decoration: InputDecoration(
                          hintText: 'message Mia...',
                          hintStyle: GoogleFonts.inter(
                            color: _iconGrey,
                            fontSize: 15,
                            height: 1.35,
                            fontWeight: FontWeight.w400,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 12,
                          ),
                        ),
                        onSubmitted:
                            canSendText ? (_) => widget.onSend() : null,
                      ),
              ),
            ),
            const SizedBox(width: 10),
            if (showLockedSend)
              _SendButton(
                canSend: true,
                onSend: widget.onHoldSend,
              )
            else if (showMic)
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
              _SendButton(
                canSend: canSendText,
                onSend: widget.onSend,
              ),
          ],
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.canSend,
    required this.onSend,
  });

  final bool canSend;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final bg = canSend
        ? MiaColors.miaBubble
        : MiaColors.miaBubble.withValues(alpha: 0.55);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: canSend ? onSend : null,
        customBorder: const CircleBorder(),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: bg,
            shape: BoxShape.circle,
          ),
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
    );
  }
}
