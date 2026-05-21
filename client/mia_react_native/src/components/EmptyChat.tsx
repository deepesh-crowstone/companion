import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MiaColors } from '../theme/colors';
import { MiaTypography, Fonts } from '../theme/typography';

export function EmptyChat() {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name="heart-outline" size={36} color={MiaColors.accentDeep} />
      </View>
      <Text style={[styles.title, MiaTypography.serifTitle(22)]}>say hi to mia</Text>
      <Text style={styles.subtitle}>
        text her, send a voice note, or tap the phone icon for a live call.
      </Text>
      <View style={styles.hint}>
        <Text style={styles.hintText}>you're up early 👀</Text>
      </View>
    </View>
  );
}

export function ScrollToBottomButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.fab} onPress={onPress} accessibilityLabel="Scroll to latest messages">
      <Ionicons name="chevron-down" size={28} color={MiaColors.accentDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: MiaColors.miaBubble,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MiaColors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  title: { marginTop: 24, textAlign: 'center' },
  subtitle: {
    marginTop: 10,
    fontFamily: Fonts.inter,
    fontSize: 14,
    lineHeight: 20,
    color: MiaColors.textMuted,
    textAlign: 'center',
  },
  hint: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(249, 221, 227, 0.7)',
    borderRadius: 20,
  },
  hintText: { fontFamily: Fonts.inter, fontSize: 15, color: MiaColors.textPrimary },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MiaColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
