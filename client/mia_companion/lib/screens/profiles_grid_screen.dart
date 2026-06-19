import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/companion_profile.dart';
import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import 'chat_screen.dart';

class ProfilesGridScreen extends StatefulWidget {
  const ProfilesGridScreen({super.key});

  @override
  State<ProfilesGridScreen> createState() => _ProfilesGridScreenState();
}

class _ProfilesGridScreenState extends State<ProfilesGridScreen> {
  List<CompanionProfile>? _profiles;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ApiService.instance.ensureAuthenticated();
      final profiles = await ApiService.instance.fetchCompanionProfiles();
      if (!mounted) return;
      setState(() {
        _profiles = profiles;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = ApiService.friendlyErrorMessage(e);
        _loading = false;
      });
    }
  }

  void _openChat(CompanionProfile profile) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChatScreen(profile: profile),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MiaColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                'Choose someone to chat with',
                style: MiaTheme.serifTitle(size: 28),
                textAlign: TextAlign.center,
              ),
            ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return Center(
        child: CircularProgressIndicator(color: MiaColors.accent),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(color: MiaColors.textMuted),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _load,
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
    }

    final profiles = _profiles ?? const <CompanionProfile>[];
    if (profiles.isEmpty) {
      return Center(
        child: Text(
          'No profiles available yet.',
          style: GoogleFonts.inter(color: MiaColors.textMuted),
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 14,
        crossAxisSpacing: 14,
        childAspectRatio: 0.72,
      ),
      itemCount: profiles.length,
      itemBuilder: (context, index) {
        final profile = profiles[index];
        return _ProfileCard(
          profile: profile,
          onTap: () => _openChat(profile),
        );
      },
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.profile, required this.onTap});

  final CompanionProfile profile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MiaColors.surface,
      elevation: 1,
      shadowColor: Colors.black.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Image.asset(
                profile.avatarAsset,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: MiaColors.miaBubble,
                  alignment: Alignment.center,
                  child: Icon(
                    Icons.person_outline,
                    size: 40,
                    color: MiaColors.textMuted,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: MiaColors.miaText,
                    ),
                  ),
                  if (profile.tagline.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      profile.tagline,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        height: 1.3,
                        color: MiaColors.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
