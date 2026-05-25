import 'package:flutter/material.dart';

/// Semantic color tokens for light and dark Mia themes.
class MiaPalette {
  const MiaPalette({
    required this.background,
    required this.chatBackground,
    required this.backgroundDeep,
    required this.surface,
    required this.miaBubble,
    required this.userBubble,
    required this.textPrimary,
    required this.miaText,
    required this.textMuted,
    required this.accent,
    required this.accentLight,
    required this.accentDeep,
    required this.statusAccent,
    required this.online,
    required this.errorBg,
    required this.callGradientTop,
    required this.callGradientMid,
    required this.callGradientBottom,
    required this.patternAccentAlpha,
  });

  final Color background;
  final Color chatBackground;
  final Color backgroundDeep;
  final Color surface;
  final Color miaBubble;
  final Color userBubble;
  final Color textPrimary;
  final Color miaText;
  final Color textMuted;
  final Color accent;
  final Color accentLight;
  final Color accentDeep;
  final Color statusAccent;
  final Color online;
  final Color errorBg;
  final Color callGradientTop;
  final Color callGradientMid;
  final Color callGradientBottom;
  final double patternAccentAlpha;

  static const light = MiaPalette(
    background: Color(0xFFF3EEF9),
    chatBackground: Color(0xFFFAFAFC),
    backgroundDeep: Color(0xFFE8E0F2),
    surface: Color(0xFFFFFFFF),
    miaBubble: Color(0xFFE2D6F0),
    userBubble: Color(0xFFE8E6EB),
    textPrimary: Color(0xFF2A2430),
    miaText: Color(0xFF151018),
    textMuted: Color(0xFF8E8699),
    accent: Color(0xFF9B72D4),
    accentLight: Color(0xFFC9B0E8),
    accentDeep: Color(0xFF6E48AB),
    statusAccent: Color(0xFF9170C4),
    online: Color(0xFF4CD964),
    errorBg: Color(0xFF352A42),
    callGradientTop: Color(0xFF7A52B8),
    callGradientMid: Color(0xFF452A62),
    callGradientBottom: Color(0xFF1E1228),
    patternAccentAlpha: 0.065,
  );

  static const dark = MiaPalette(
    background: Color(0xFF151019),
    chatBackground: Color(0xFF1C1824),
    backgroundDeep: Color(0xFF0E0A12),
    surface: Color(0xFF2A2430),
    miaBubble: Color(0xFF3A3248),
    userBubble: Color(0xFF3D3B42),
    textPrimary: Color(0xFFF3EEF9),
    miaText: Color(0xFFFAFAFC),
    textMuted: Color(0xFF9A8FA8),
    accent: Color(0xFFB088E8),
    accentLight: Color(0xFF7A5898),
    accentDeep: Color(0xFF9B72D4),
    statusAccent: Color(0xFFA882D4),
    online: Color(0xFF4CD964),
    errorBg: Color(0xFF352A42),
    callGradientTop: Color(0xFF7A52B8),
    callGradientMid: Color(0xFF452A62),
    callGradientBottom: Color(0xFF1E1228),
    patternAccentAlpha: 0.1,
  );
}
