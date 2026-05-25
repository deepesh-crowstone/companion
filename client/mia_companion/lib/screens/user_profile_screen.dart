import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/app_info.dart';
import '../data/profile_legal_content.dart';
import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import '../widgets/account_actions_sheet.dart';
import '../widgets/legal_content_sheet.dart';

class UserProfileScreen extends StatelessWidget {
  const UserProfileScreen({super.key});

  Future<void> _openSupportEmail(BuildContext context) async {
    final uri = Uri(
      scheme: 'mailto',
      path: 'deepesh@crowstone.ai',
      queryParameters: const {'subject': 'Zara App Support'},
    );
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) {
        MiaTheme.showMessage(context, 'Could not open your email app.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final username = ApiService.instance.username;

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
                      'Profile',
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
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  if (username != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: MiaColors.surface,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: MiaColors.miaBubble),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Signed in as',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: MiaColors.textMuted,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            username,
                            style: GoogleFonts.inter(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: MiaColors.miaText,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  _ProfileMenuTile(
                    icon: Icons.help_outline_rounded,
                    title: 'FAQs',
                    onTap: () => showLegalContentSheet(
                      context: context,
                      title: 'FAQs',
                      sections: ProfileLegalContent.faqs,
                      body: '',
                    ),
                  ),
                  _ProfileMenuTile(
                    icon: Icons.privacy_tip_outlined,
                    title: 'Privacy Policy',
                    onTap: () => showLegalContentSheet(
                      context: context,
                      title: 'Privacy Policy',
                      body: ProfileLegalContent.privacyPolicy,
                    ),
                  ),
                  _ProfileMenuTile(
                    icon: Icons.description_outlined,
                    title: 'Terms and Conditions',
                    onTap: () => showLegalContentSheet(
                      context: context,
                      title: 'Terms and Conditions',
                      body: ProfileLegalContent.termsAndConditions,
                    ),
                  ),
                  _ProfileMenuTile(
                    icon: Icons.mail_outline_rounded,
                    title: 'Support',
                    subtitle: 'deepesh@crowstone.ai',
                    onTap: () => _openSupportEmail(context),
                  ),
                  _ProfileMenuTile(
                    icon: Icons.person_outline_rounded,
                    title: 'Account',
                    onTap: () => showAccountActionsSheet(context),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                AppInfo.versionLabel,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  color: MiaColors.textMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileMenuTile extends StatelessWidget {
  const _ProfileMenuTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: MiaColors.surface,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: MiaColors.miaBubble),
            ),
            child: Row(
              children: [
                Icon(icon, color: MiaColors.accentDeep, size: 22),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: MiaColors.textPrimary,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: MiaColors.textMuted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
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
