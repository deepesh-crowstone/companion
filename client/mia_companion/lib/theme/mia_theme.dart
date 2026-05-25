import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'mia_palette.dart';

class MiaColors {
  static MiaPalette _palette = MiaPalette.light;

  static void apply(MiaPalette palette) => _palette = palette;

  static Color get background => _palette.background;
  static Color get chatBackground => _palette.chatBackground;
  static Color get backgroundDeep => _palette.backgroundDeep;
  static Color get surface => _palette.surface;
  static Color get miaBubble => _palette.miaBubble;
  static Color get userBubble => _palette.userBubble;
  static Color get textPrimary => _palette.textPrimary;
  static Color get miaText => _palette.miaText;
  static Color get textMuted => _palette.textMuted;
  static Color get accent => _palette.accent;
  static Color get accentLight => _palette.accentLight;
  static Color get accentDeep => _palette.accentDeep;
  static Color get statusPink => _palette.statusAccent;
  static Color get online => _palette.online;
  static Color get errorBg => _palette.errorBg;
  static Color get callGradientTop => _palette.callGradientTop;
  static Color get callGradientMid => _palette.callGradientMid;
  static Color get callGradientBottom => _palette.callGradientBottom;
  static double get patternAccentAlpha => _palette.patternAccentAlpha;
}

class MiaTheme {
  static const bubbleRadius = 22.0;
  static const bubbleTail = 6.0;

  static ThemeData light() => _build(MiaPalette.light, Brightness.light);

  static ThemeData dark() => _build(MiaPalette.dark, Brightness.dark);

  static ThemeData _build(MiaPalette palette, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: palette.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: palette.accent,
        brightness: brightness,
        surface: palette.background,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: palette.errorBg,
        contentTextStyle: GoogleFonts.inter(color: Colors.white, fontSize: 14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );

    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: palette.textPrimary,
        displayColor: palette.textPrimary,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: palette.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: palette.textPrimary,
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: palette.accent,
          foregroundColor: Colors.white,
          disabledBackgroundColor: palette.accent.withValues(alpha: 0.45),
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: BorderSide(color: palette.miaBubble, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: BorderSide(color: palette.accent, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: GoogleFonts.inter(color: palette.textMuted, fontSize: 15),
      ),
    );
  }

  static TextStyle serifTitle({double size = 28}) =>
      GoogleFonts.playfairDisplay(
        fontSize: size,
        fontWeight: FontWeight.w600,
        color: MiaColors.miaText,
        height: 1.1,
      );

  static TextStyle chatBody({required bool isUser}) => GoogleFonts.inter(
        fontSize: 15,
        height: 1.4,
        color: MiaColors.miaText,
      );

  static TextStyle caption() => GoogleFonts.inter(
        fontSize: 11,
        color: MiaColors.textMuted,
        letterSpacing: 0.3,
      );

  static TextStyle labelCaps() => GoogleFonts.inter(
        fontSize: 11,
        letterSpacing: 1.2,
        fontWeight: FontWeight.w600,
        color: MiaColors.textMuted,
      );

  static BorderRadius bubbleShape({required bool isUser}) {
    return BorderRadius.only(
      topLeft: const Radius.circular(bubbleRadius),
      topRight: const Radius.circular(bubbleRadius),
      bottomLeft: Radius.circular(isUser ? bubbleRadius : bubbleTail),
      bottomRight: Radius.circular(isUser ? bubbleTail : bubbleRadius),
    );
  }

  static void showMessage(BuildContext context, String text, {bool isError = true}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(text),
          duration: Duration(seconds: isError ? 5 : 2),
        ),
      );
  }
}
