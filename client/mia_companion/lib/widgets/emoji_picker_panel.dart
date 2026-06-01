import 'package:emoji_picker_flutter/emoji_picker_flutter.dart' as ep;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';

/// WhatsApp-style emoji picker panel that hosts the emoji grid below the
/// chat input bar. Inserts emojis into [controller] at the current cursor
/// position automatically via [EmojiPicker]'s built-in support.
class EmojiPickerPanel extends StatelessWidget {
  const EmojiPickerPanel({
    super.key,
    required this.controller,
    this.height = 300,
    this.onEmojiSelected,
    this.onBackspacePressed,
  });

  final TextEditingController controller;
  final double height;
  final void Function(ep.Category? category, ep.Emoji emoji)? onEmojiSelected;
  final VoidCallback? onBackspacePressed;

  @override
  Widget build(BuildContext context) {
    final bg = MiaColors.surface;
    final muted = MiaColors.textMuted;
    final accent = MiaColors.accentDeep;

    return Material(
      color: bg,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: height,
          child: ep.EmojiPicker(
            textEditingController: controller,
            onEmojiSelected: onEmojiSelected,
            onBackspacePressed: onBackspacePressed,
            config: ep.Config(
              height: height,
              checkPlatformCompatibility: true,
              emojiViewConfig: ep.EmojiViewConfig(
                columns: 8,
                emojiSizeMax: 28,
                backgroundColor: bg,
                gridPadding: const EdgeInsets.symmetric(horizontal: 6),
                verticalSpacing: 2,
                horizontalSpacing: 2,
                recentsLimit: 32,
                buttonMode: ep.ButtonMode.MATERIAL,
                noRecents: Text(
                  'No recents yet',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    color: muted,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              categoryViewConfig: ep.CategoryViewConfig(
                tabBarHeight: 42,
                initCategory: ep.Category.RECENT,
                recentTabBehavior: ep.RecentTabBehavior.RECENT,
                backgroundColor: bg,
                indicatorColor: accent,
                iconColor: muted,
                iconColorSelected: accent,
                backspaceColor: accent,
                dividerColor: MiaColors.miaBubble.withValues(alpha: 0.45),
              ),
              skinToneConfig: ep.SkinToneConfig(
                dialogBackgroundColor: bg,
                indicatorColor: muted,
              ),
              bottomActionBarConfig: const ep.BottomActionBarConfig(
                enabled: false,
              ),
              searchViewConfig: ep.SearchViewConfig(
                backgroundColor: bg,
                buttonIconColor: accent,
                hintText: 'Search',
                inputTextStyle: GoogleFonts.inter(
                  fontSize: 14,
                  color: MiaColors.textPrimary,
                ),
                hintTextStyle: GoogleFonts.inter(
                  fontSize: 14,
                  color: muted,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
