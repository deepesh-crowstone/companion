import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';
import { formatDateSeparator } from '../utils/chatDates';

export function DateSeparator({ date }: { date: Date }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{formatDateSeparator(date)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 16 },
  text: {
    fontFamily: Fonts.inter,
    fontSize: 11,
    letterSpacing: 0.3,
    color: MiaColors.textMuted,
    textTransform: 'lowercase',
  },
});
