import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/api_service.dart';
import '../services/mood_controller.dart';
import '../theme/mia_theme.dart';
import '../utils/account_auth_validation.dart';

/// Ensures paid users who have not claimed an account are flagged for setup.
Future<void> syncAccountCredentialsRequirement() async {
  if (await ApiService.instance.hasClaimedAccount()) return;
  await MoodController.instance.refreshAccess();
  if (MoodController.instance.passActive) {
    await ApiService.instance.requireAccountCredentials();
  }
}

/// Shows the credentials sheet until the user saves or the context unmounts.
Future<void> promptAccountCredentialsIfNeeded(BuildContext context) async {
  await syncAccountCredentialsRequirement();
  while (context.mounted && await ApiService.instance.needsAccountCredentials()) {
    await showAccountCredentialsSheet(context);
  }
}

/// Prompts the user to choose a username and password after unlocking personalities.
Future<bool> showAccountCredentialsSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _AccountCredentialsSheet(),
  ).then((value) => value ?? false);
}

class _AccountCredentialsSheet extends StatefulWidget {
  const _AccountCredentialsSheet();

  @override
  State<_AccountCredentialsSheet> createState() =>
      _AccountCredentialsSheetState();
}

class _AccountCredentialsSheetState extends State<_AccountCredentialsSheet> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _saving = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final username = _usernameController.text;
    final password = _passwordController.text;

    final usernameErr = AccountAuthValidation.usernameError(username);
    final passwordErr = AccountAuthValidation.passwordError(password);
    if (usernameErr != null) {
      setState(() => _error = usernameErr);
      return;
    }
    if (passwordErr != null) {
      setState(() => _error = passwordErr);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ApiService.instance.setCredentials(username.trim(), password);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = AccountAuthValidation.friendlyAuthError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewPaddingOf(context).bottom;
    final inset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: inset),
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: EdgeInsets.fromLTRB(24, 28, 24, 20 + bottom),
        decoration: BoxDecoration(
          color: MiaColors.surface,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: MiaColors.accentDeep.withValues(alpha: 0.12),
              blurRadius: 32,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Save your account',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: MiaColors.textPrimary,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Choose a unique username and password so you can log in on this or another device.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 15,
                  height: 1.45,
                  color: MiaColors.textMuted,
                ),
              ),
              const SizedBox(height: 22),
              TextField(
                controller: _usernameController,
                autocorrect: false,
                textCapitalization: TextCapitalization.none,
                decoration: const InputDecoration(
                  labelText: 'Username',
                  hintText: 'letters, numbers, underscore',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                decoration: InputDecoration(
                  labelText: 'Password',
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    onPressed: () => setState(
                      () => _obscurePassword = !_obscurePassword,
                    ),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 14),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: MiaColors.accentDeep,
                  ),
                ),
              ],
              const SizedBox(height: 22),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Save account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
