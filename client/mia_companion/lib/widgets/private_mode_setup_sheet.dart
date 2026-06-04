import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/api_service.dart';
import '../services/private_mode_controller.dart';
import '../theme/mia_theme.dart';
import '../utils/account_auth_validation.dart';
import 'account_credentials_sheet.dart';

Future<void> showPrivateModeSetupSheet(BuildContext context) async {
  if (!context.mounted) return;
  if (!PrivateModeController.instance.needsSetup) return;

  final needsCreds = await ApiService.instance.needsAccountCredentials();
  if (!context.mounted) return;

  if (needsCreds) {
    final claimed = await showAccountCredentialsSheet(context);
    if (!claimed || !context.mounted) return;
  }

  while (context.mounted && PrivateModeController.instance.needsSetup) {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const _PrivateModeAgeSheet(),
    );
    if (ok != true) break;
    await PrivateModeController.instance.refreshAccess();
  }
}

class _PrivateModeAgeSheet extends StatefulWidget {
  const _PrivateModeAgeSheet();

  @override
  State<_PrivateModeAgeSheet> createState() => _PrivateModeAgeSheetState();
}

class _PrivateModeAgeSheetState extends State<_PrivateModeAgeSheet> {
  final _ageController = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _ageController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final parsed = int.tryParse(_ageController.text.trim());
    if (parsed == null) {
      setState(() => _error = 'Enter your age as a number');
      return;
    }
    if (parsed < 18) {
      setState(
        () => _error =
            'We dont allow minors to enter into private chat mode',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ApiService.instance.setUserAge(parsed);
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
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Almost there',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: MiaColors.textPrimary,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Enter your age to unlock private romantic chat with Zara.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 15,
                  height: 1.45,
                  color: MiaColors.textMuted,
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _ageController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Age',
                  hintText: '18 or above',
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: MiaColors.accentDeep,
                  ),
                ),
              ],
              const SizedBox(height: 20),
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
                    : const Text('Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
