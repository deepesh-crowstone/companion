import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_avatar.dart';
import '../widgets/mia_profile_photo_viewer.dart';

class MiaProfileScreen extends StatelessWidget {
  const MiaProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MiaColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(left: 8, top: 4),
                child: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                  color: MiaColors.textPrimary,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                child: Column(
                  children: [
                    MiaAvatar(
                      size: 108,
                      showBorder: true,
                      borderWidth: 3,
                      onTap: () => MiaProfilePhotoViewer.open(
                        context,
                        asset: MiaProfile.avatarAsset,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(MiaProfile.name, style: MiaTheme.serifTitle(size: 32)),
                    const SizedBox(height: 10),
                    const _FollowMeRow(),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            MiaProfile.about,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.inter(
                              fontSize: 15,
                              height: 1.5,
                              color: MiaColors.miaText,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _PhotoGrid(assets: MiaProfile.galleryAssets),
                          const SizedBox(height: 16),
                          Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 8,
                            children: MiaProfile.hobbies.map((h) {
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: MiaColors.miaBubble.withValues(
                                    alpha: 0.65,
                                  ),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  h,
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    color: MiaColors.miaText,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FollowMeRow extends StatelessWidget {
  const _FollowMeRow();

  Future<void> _open(BuildContext context, MiaSocialLink link) async {
    final uri = Uri.parse(link.url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) {
        MiaTheme.showMessage(context, 'could not open ${link.platform}');
      }
    }
  }

  FaIconData _iconFor(MiaSocialLink link) {
    switch (link.icon) {
      case 'instagram':
        return FontAwesomeIcons.instagram;
      case 'x':
        return FontAwesomeIcons.xTwitter;
      case 'facebook':
        return FontAwesomeIcons.facebook;
      default:
        return FontAwesomeIcons.link;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Follow me on',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: MiaColors.textMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 8),
        for (var i = 0; i < MiaProfile.followLinks.length; i++) ...[
          if (i > 0) const SizedBox(width: 2.5),
          InkWell(
            onTap: () => _open(context, MiaProfile.followLinks[i]),
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.all(5),
              child: FaIcon(
                _iconFor(MiaProfile.followLinks[i]),
                size: 20,
                color: MiaColors.accentDeep,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.assets});

  final List<String> assets;

  static const _spacing = 8.0;
  static const _columns = 2;
  static const _photoCount = 4;

  @override
  Widget build(BuildContext context) {
    final photos = assets.take(_photoCount).toList();
    if (photos.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (context, constraints) {
        final tileSize = (constraints.maxWidth - _spacing) / _columns;
        return Wrap(
          spacing: _spacing,
          runSpacing: _spacing,
          children: [
            for (var i = 0; i < photos.length; i++)
              SizedBox(
                width: tileSize,
                height: tileSize,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Material(
                    color: MiaColors.miaBubble,
                    child: InkWell(
                      onTap: () => MiaProfilePhotoViewer.open(
                        context,
                        assets: photos,
                        initialIndex: i,
                      ),
                      child: Image.asset(
                        photos[i],
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Center(
                          child: Icon(
                            Icons.image_not_supported_outlined,
                            color: MiaColors.textMuted,
                            size: 24,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
