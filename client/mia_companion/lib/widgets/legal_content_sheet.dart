import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/profile_legal_content.dart';
import '../theme/mia_theme.dart';
import 'mia_bottom_sheet.dart';

Future<void> showLegalContentSheet({
  required BuildContext context,
  required String title,
  required String body,
  List<LegalSection>? sections,
}) {
  return showMiaBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      final maxHeight = MediaQuery.sizeOf(ctx).height * 0.82;
      return SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
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
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: GoogleFonts.inter(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: MiaColors.textPrimary,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(Icons.close, color: MiaColors.textMuted),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Flexible(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  children: sections != null
                      ? sections
                          .map(
                            (section) => Padding(
                              padding: const EdgeInsets.only(bottom: 18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    section.title,
                                    style: GoogleFonts.inter(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: MiaColors.textPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    section.body,
                                    style: GoogleFonts.inter(
                                      fontSize: 14,
                                      height: 1.5,
                                      color: MiaColors.miaText,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                          .toList()
                      : [
                          Text(
                            body,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              height: 1.55,
                              color: MiaColors.miaText,
                            ),
                          ),
                        ],
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
