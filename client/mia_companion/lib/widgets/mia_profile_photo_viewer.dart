import 'package:flutter/material.dart';

import '../data/mia_profile.dart';

class MiaProfilePhotoViewer extends StatefulWidget {
  const MiaProfilePhotoViewer({
    super.key,
    required this.assets,
    this.initialIndex = 0,
  });

  final List<String> assets;
  final int initialIndex;

  static void open(
    BuildContext context, {
    String? asset,
    List<String>? assets,
    int initialIndex = 0,
  }) {
    final resolved = assets ?? <String>[asset ?? MiaProfile.avatarAsset];
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => MiaProfilePhotoViewer(
          assets: resolved,
          initialIndex: initialIndex.clamp(0, resolved.length - 1),
        ),
      ),
    );
  }

  @override
  State<MiaProfilePhotoViewer> createState() => _MiaProfilePhotoViewerState();
}

class _MiaProfilePhotoViewerState extends State<MiaProfilePhotoViewer> {
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );
  late int _index = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final showCounter = widget.assets.length > 1;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              onPageChanged: (i) => setState(() => _index = i),
              itemCount: widget.assets.length,
              itemBuilder: (context, i) {
                return Center(
                  child: InteractiveViewer(
                    minScale: 1,
                    maxScale: 4,
                    child: Image.asset(
                      widget.assets[i],
                      fit: BoxFit.contain,
                      errorBuilder: (context, error, stackTrace) => const Icon(
                        Icons.person_outline,
                        color: Colors.white70,
                        size: 120,
                      ),
                    ),
                  ),
                );
              },
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                tooltip: 'Close',
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            if (showCounter)
              Positioned(
                bottom: 16,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${_index + 1} / ${widget.assets.length}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
