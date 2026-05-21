import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function RecordingDot() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      style={[
        styles.dot,
        { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
      ]}
    />
  );
}

function LiveWaveform() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <View style={styles.waveform}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              height: anim.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [6, 6 + 12 * Math.abs(Math.sin(i)), 6, 6 + 12 * Math.abs(Math.cos(i)), 6],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

type Props = {
  durationMs: number;
  locked: boolean;
  slideCancelActive: boolean;
  slideOffset: number;
  onCancel?: () => void;
};

export function VoiceRecordingBar({
  durationMs,
  locked,
  slideCancelActive,
  slideOffset,
  onCancel,
}: Props) {
  if (locked) {
    return (
      <View style={styles.lockedRow}>
        <Pressable onPress={onCancel} hitSlop={8} style={styles.trashBtn}>
          <Ionicons name="trash-outline" size={24} color={MiaColors.accentDeep} />
        </Pressable>
        <RecordingDot />
        <Text style={styles.timer}>{formatDuration(durationMs)}</Text>
        <View style={{ flex: 1 }} />
        <LiveWaveform />
      </View>
    );
  }

  const slideShift = Math.max(-120, Math.min(0, slideOffset)) * 0.35;
  const progress = Math.min(1, Math.abs(slideOffset) / 96);

  return (
    <View style={styles.holdRow}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideShift }] }}>
        <View
          style={[
            styles.slideHint,
            slideCancelActive && styles.slideHintActive,
            !slideCancelActive && { backgroundColor: `rgba(176, 74, 90, ${0.1 + progress * 0.08})` },
          ]}
        >
          <Ionicons
            name={slideCancelActive ? 'trash-outline' : 'chevron-back'}
            size={22}
            color={slideCancelActive ? '#C62828' : MiaColors.accentDeep}
          />
          <Text style={[styles.slideText, slideCancelActive && styles.slideTextActive]}>
            slide to cancel
          </Text>
        </View>
      </Animated.View>
      <RecordingDot />
      <Text style={styles.timerBold}>{formatDuration(durationMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    minHeight: 48,
  },
  holdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    minHeight: 52,
  },
  trashBtn: { padding: 8 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MiaColors.accentDeep,
    marginHorizontal: 8,
  },
  timer: {
    fontFamily: Fonts.interSemiBold,
    fontSize: 15,
    color: MiaColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  timerBold: {
    fontFamily: Fonts.interBold,
    fontSize: 16,
    color: MiaColors.textPrimary,
    marginLeft: 8,
    marginRight: 10,
    fontVariant: ['tabular-nums'],
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 36,
    height: 22,
    justifyContent: 'flex-end',
  },
  waveBar: {
    width: 3,
    marginLeft: 2,
    backgroundColor: 'rgba(176, 74, 90, 0.75)',
    borderRadius: 2,
  },
  slideHint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(176, 74, 90, 0.25)',
    alignSelf: 'flex-start',
  },
  slideHintActive: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF9A9A',
  },
  slideText: {
    marginLeft: 6,
    fontFamily: Fonts.interSemiBold,
    fontSize: 15,
    color: MiaColors.accentDeep,
  },
  slideTextActive: {
    color: '#C62828',
  },
});
