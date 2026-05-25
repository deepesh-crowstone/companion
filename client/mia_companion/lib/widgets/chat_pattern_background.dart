import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/mia_theme.dart';

/// Whitish chat backdrop with a subtle repeating doodle pattern.
class ChatPatternBackground extends StatelessWidget {
  const ChatPatternBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: MiaColors.chatBackground,
      child: CustomPaint(
        painter: _ChatPatternPainter(
          color: MiaColors.accent.withValues(alpha: 0.065),
        ),
        child: child,
      ),
    );
  }
}

class _ChatPatternPainter extends CustomPainter {
  _ChatPatternPainter({required this.color});

  final Color color;

  static const _tile = 96.0;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    for (var row = -1; row < (size.height / _tile).ceil() + 1; row++) {
      final y = row * _tile * 0.88;
      final stagger = row.isEven ? 0.0 : _tile * 0.5;
      for (var col = -1; col < (size.width / _tile).ceil() + 1; col++) {
        final origin = Offset(col * _tile + stagger, y);
        _drawTile(canvas, origin, stroke, fill, row * 7 + col * 3);
      }
    }
  }

  void _drawTile(
    Canvas canvas,
    Offset origin,
    Paint stroke,
    Paint fill,
    int seed,
  ) {
    final placements = _tilePlacements(seed);
    for (final placement in placements) {
      _drawMotif(
        canvas,
        origin + placement.offset,
        stroke,
        fill,
        placement.type,
        placement.scale,
        placement.rotation,
      );
    }
  }

  List<_Placement> _tilePlacements(int seed) {
    const motifs = _MotifType.values;
    final rng = math.Random(seed);
    final count = 3 + rng.nextInt(2);
    return List.generate(count, (i) {
      final type = motifs[(seed + i * 5) % motifs.length];
      return _Placement(
        type: type,
        offset: Offset(
          8 + rng.nextDouble() * (_tile - 28),
          8 + rng.nextDouble() * (_tile - 28),
        ),
        scale: 0.82 + rng.nextDouble() * 0.28,
        rotation: (rng.nextDouble() - 0.5) * 0.35,
      );
    });
  }

  void _drawMotif(
    Canvas canvas,
    Offset o,
    Paint stroke,
    Paint fill,
    _MotifType type,
    double scale,
    double rotation,
  ) {
    canvas.save();
    canvas.translate(o.dx, o.dy);
    canvas.rotate(rotation);
    canvas.scale(scale);

    switch (type) {
      case _MotifType.speechBubble:
        _speechBubble(canvas, stroke);
      case _MotifType.heart:
        _heart(canvas, fill);
      case _MotifType.dots:
        _dots(canvas, fill);
      case _MotifType.waveform:
        _waveform(canvas, stroke);
      case _MotifType.star:
        _star(canvas, stroke);
      case _MotifType.moon:
        _moon(canvas, stroke);
      case _MotifType.smile:
        _smile(canvas, stroke);
      case _MotifType.sparkle:
        _sparkle(canvas, stroke);
      case _MotifType.mic:
        _mic(canvas, stroke);
      case _MotifType.envelope:
        _envelope(canvas, stroke);
      case _MotifType.music:
        _musicNote(canvas, stroke);
      case _MotifType.camera:
        _camera(canvas, stroke);
    }

    canvas.restore();
  }

  void _speechBubble(Canvas canvas, Paint paint) {
    final rrect = RRect.fromRectAndRadius(
      const Rect.fromLTWH(-17, -11, 34, 22),
      const Radius.circular(10),
    );
    canvas.drawRRect(rrect, paint);
    final tail = Path()
      ..moveTo(-7, 11)
      ..lineTo(-11, 17)
      ..lineTo(-1, 11);
    canvas.drawPath(tail, paint);
  }

  void _heart(Canvas canvas, Paint paint) {
    final path = Path()
      ..moveTo(0, 4)
      ..cubicTo(-8, -6, -14, 4, 0, 12)
      ..cubicTo(14, 4, 8, -6, 0, 4);
    canvas.drawPath(path, paint);
  }

  void _dots(Canvas canvas, Paint paint) {
    for (var i = 0; i < 3; i++) {
      canvas.drawCircle(Offset(-10 + i * 10.0, 0), 2.0, paint);
    }
  }

  void _waveform(Canvas canvas, Paint paint) {
    const heights = [6.0, 12.0, 8.0, 14.0, 7.0];
    for (var i = 0; i < heights.length; i++) {
      final h = heights[i];
      canvas.drawLine(
        Offset(-14 + i * 7.0, (14 - h) / 2 - 7),
        Offset(-14 + i * 7.0, (14 + h) / 2 - 7),
        paint,
      );
    }
  }

  void _star(Canvas canvas, Paint paint) {
    const points = 5;
    const outer = 9.0;
    const inner = 4.0;
    final path = Path();
    for (var i = 0; i < points * 2; i++) {
      final r = i.isEven ? outer : inner;
      final angle = (math.pi / points) * i - math.pi / 2;
      final point = Offset(math.cos(angle) * r, math.sin(angle) * r);
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  void _moon(Canvas canvas, Paint paint) {
    canvas.drawArc(
      const Rect.fromLTWH(-8, -8, 16, 16),
      math.pi * 0.35,
      math.pi * 1.35,
      false,
      paint,
    );
  }

  void _smile(Canvas canvas, Paint paint) {
    canvas.drawCircle(const Offset(0, 0), 9, paint);
    canvas.drawArc(
      const Rect.fromLTWH(-4, -1, 8, 6),
      math.pi * 0.15,
      math.pi * 0.7,
      false,
      paint,
    );
    final dot = Paint()
      ..color = paint.color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(const Offset(-3, -2), 1.2, dot);
    canvas.drawCircle(const Offset(3, -2), 1.2, dot);
  }

  void _sparkle(Canvas canvas, Paint paint) {
    canvas.drawLine(const Offset(0, -8), const Offset(0, 8), paint);
    canvas.drawLine(const Offset(-8, 0), const Offset(8, 0), paint);
    canvas.drawLine(const Offset(-5, -5), const Offset(5, 5), paint);
    canvas.drawLine(const Offset(-5, 5), const Offset(5, -5), paint);
  }

  void _mic(Canvas canvas, Paint paint) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(-4, -10, 8, 14),
        const Radius.circular(4),
      ),
      paint,
    );
    canvas.drawArc(
      const Rect.fromLTWH(-7, -4, 14, 14),
      0,
      math.pi,
      false,
      paint,
    );
    canvas.drawLine(const Offset(0, 10), const Offset(0, 14), paint);
    canvas.drawLine(const Offset(-5, 14), const Offset(5, 14), paint);
  }

  void _envelope(Canvas canvas, Paint paint) {
    final rect = RRect.fromRectAndRadius(
      const Rect.fromLTWH(-11, -7, 22, 14),
      const Radius.circular(3),
    );
    canvas.drawRRect(rect, paint);
    canvas.drawLine(const Offset(-11, -7), Offset.zero, paint);
    canvas.drawLine(const Offset(11, -7), Offset.zero, paint);
  }

  void _musicNote(Canvas canvas, Paint paint) {
    canvas.drawCircle(const Offset(-4, 4), 3.5, paint);
    canvas.drawLine(const Offset(-0.5, 4), const Offset(-0.5, -10), paint);
    final flag = Path()
      ..moveTo(-0.5, -10)
      ..quadraticBezierTo(8, -8, 6, -2)
      ..quadraticBezierTo(2, -4, -0.5, -4);
    canvas.drawPath(flag, paint);
  }

  void _camera(Canvas canvas, Paint paint) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(-11, -7, 22, 14),
        const Radius.circular(3),
      ),
      paint,
    );
    canvas.drawCircle(const Offset(0, 0), 4.5, paint);
    canvas.drawLine(const Offset(-4, -7), const Offset(-1, -10), paint);
  }

  @override
  bool shouldRepaint(covariant _ChatPatternPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}

enum _MotifType {
  speechBubble,
  heart,
  dots,
  waveform,
  star,
  moon,
  smile,
  sparkle,
  mic,
  envelope,
  music,
  camera,
}

class _Placement {
  const _Placement({
    required this.type,
    required this.offset,
    required this.scale,
    required this.rotation,
  });

  final _MotifType type;
  final Offset offset;
  final double scale;
  final double rotation;
}
