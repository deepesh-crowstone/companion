import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

class MiaColors {
  static const background = Color(0xFFF3EEF9);
  /// Chat thread — whitish base for the message area.
  static const chatBackground = Color(0xFFFAFAFC);
  static const backgroundDeep = Color(0xFFE8E0F2);
  static const surface = Color(0xFFFFFFFF);
  static const miaBubble = Color(0xFFE2D6F0);
  static const userBubble = Color(0xFFE8E6EB);
  static const textPrimary = Color(0xFF2A2430);
  static const miaText = Color(0xFF151018);
  static const textMuted = Color(0xFF8E8699);
  static const accent = Color(0xFF9B72D4);
  static const accentLight = Color(0xFFC9B0E8);
  static const accentDeep = Color(0xFF6E48AB);
  static const statusPink = Color(0xFF9170C4);
  static const online = Color(0xFF4CD964);
  static const errorBg = Color(0xFF352A42);
  static const callGradientTop = Color(0xFF7A52B8);
  static const callGradientMid = Color(0xFF452A62);
  static const callGradientBottom = Color(0xFF1E1228);
}

class MiaTheme {
  static const bubbleRadius = 22.0;
  static const bubbleTail = 6.0;

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: MiaColors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: MiaColors.accent,
        surface: MiaColors.background,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: MiaColors.errorBg,
        contentTextStyle: GoogleFonts.inter(color: Colors.white, fontSize: 14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );

    return base.copyWith(
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: MiaColors.textPrimary,
        displayColor: MiaColors.textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: MiaColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: MiaColors.textPrimary,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: MiaColors.accent,
          foregroundColor: Colors.white,
          disabledBackgroundColor: MiaColors.accent.withValues(alpha: 0.45),
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
        fillColor: MiaColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: BorderSide(color: MiaColors.miaBubble, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(28),
          borderSide: const BorderSide(color: MiaColors.accent, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: GoogleFonts.inter(color: MiaColors.textMuted, fontSize: 15),
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
