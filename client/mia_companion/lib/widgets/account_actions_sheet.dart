import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/session_reset.dart';
import '../theme/mia_theme.dart';
import 'mia_bottom_sheet.dart';
import 'mia_confirm_dialog.dart';

Future<void> showAccountActionsSheet(BuildContext context) {
  return showMiaBottomSheet<void>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: MiaColors.miaBubble,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Account',
                style: GoogleFonts.inter(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: MiaColors.textPrimary,
                ),
              ),
            ),
          ),
          ListTile(
            leading: Icon(Icons.logout_rounded, color: MiaColors.accentDeep),
            title: const Text('Log out'),
            onTap: () async {
              Navigator.pop(ctx);
              final confirmed = await showMiaConfirmDialog(
                context: context,
                title: 'Log out?',
                message:
                    'You will be signed out of this device. Your chat history stays on the server until you delete your account.',
                confirmLabel: 'Log out',
              );
              if (confirmed == true && context.mounted) {
                await SessionReset.logout(context);
              }
            },
          ),
          ListTile(
            leading: Icon(Icons.delete_outline, color: Colors.red.shade700),
            title: Text(
              'Delete account',
              style: TextStyle(color: Colors.red.shade700),
            ),
            onTap: () async {
              Navigator.pop(ctx);
              final confirmed = await showMiaConfirmDialog(
                context: context,
                title: 'Delete account?',
                message:
                    'This removes your local session and resets the app. This action cannot be undone from the app.',
                confirmLabel: 'Delete',
                destructive: true,
              );
              if (confirmed == true && context.mounted) {
                await SessionReset.deleteAccount(context);
              }
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}
