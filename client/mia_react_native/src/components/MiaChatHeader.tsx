import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';
import { MiaAvatar } from './MiaAvatar';

type Props = {
  statusText: string;
  onProfile: () => void;
  onCall: () => void;
  onMenu: () => void;
};

function StatusLine({ text }: { text: string }) {
  const isOnline = text === 'online now';
  return (
    <View style={styles.statusRow}>
      {isOnline && <View style={styles.onlineDot} />}
      {isOnline && <View style={styles.statusGap} />}
      <Text style={styles.statusText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function MiaChatHeader({ statusText, onProfile, onCall, onMenu }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.pill}>
        <MiaAvatar size={48} onPress={onProfile} showBorder lightBorder borderWidth={1.5} />
        <View style={styles.nameGap} />
        <View style={styles.meta}>
          <Text style={styles.name}>Mia</Text>
          <StatusLine text={statusText} />
        </View>
        <Pressable
          onPress={onCall}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityLabel="Start voice call"
        >
          <Ionicons name="call-outline" size={22} color={MiaColors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={onMenu}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityLabel="Open menu"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={MiaColors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    zIndex: 10,
    elevation: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: MiaColors.chatBackground,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MiaColors.surface,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nameGap: { width: 12 },
  meta: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: Fonts.interBold,
    fontSize: 17,
    color: MiaColors.miaText,
    lineHeight: 20,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusGap: { width: 6 },
  statusText: {
    fontFamily: Fonts.inter,
    fontSize: 12,
    color: MiaColors.textMuted,
    flexShrink: 1,
    opacity: 0.95,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: MiaColors.online },
  iconBtn: { padding: 6 },
});
