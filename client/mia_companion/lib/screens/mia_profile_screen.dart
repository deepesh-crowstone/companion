import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_avatar.dart';

class MiaProfileScreen extends StatelessWidget {
  const MiaProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MiaColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new, size: 20),
                    color: MiaColors.textPrimary,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  Expanded(
                    child: Text(
                      'profile',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: MiaColors.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                child: Column(
                  children: [
                    const MiaAvatar(size: 108, showBorder: true, borderWidth: 3),
                    const SizedBox(height: 16),
                    Text('Mia', style: MiaTheme.serifTitle(size: 32)),
                    const SizedBox(height: 6),
                    Text(
                      MiaProfile.tagline,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: MiaColors.statusPink,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 24),
                    _SectionCard(
                      title: 'about me',
                      child: Text(
                        MiaProfile.about,
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          height: 1.5,
                          color: MiaColors.miaText,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _SectionCard(
                      title: 'hobbies',
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: MiaProfile.hobbies.map((h) {
                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: MiaColors.miaBubble.withValues(alpha: 0.65),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: MiaColors.accent.withValues(alpha: 0.2),
                              ),
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
                    ),
                    const SizedBox(height: 16),
                    _SectionCard(
                      title: 'social',
                      child: Column(
                        children: MiaProfile.socialLinks.map((link) {
                          return _SocialTile(link: link);
                        }).toList(),
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

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: MiaColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: MiaColors.miaBubble),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: MiaColors.accentDeep,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _SocialTile extends StatelessWidget {
  const _SocialTile({required this.link});

  final MiaSocialLink link;

  Future<void> _open(BuildContext context) async {
    final uri = Uri.parse(link.url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) {
        MiaTheme.showMessage(context, 'could not open ${link.platform}');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: MiaColors.background,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: () => _open(context),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Text(link.icon, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        link.platform,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: MiaColors.miaText,
                        ),
                      ),
                      Text(
                        link.handle,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: MiaColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.open_in_new_rounded,
                  size: 18,
                  color: MiaColors.textMuted.withValues(alpha: 0.8),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
