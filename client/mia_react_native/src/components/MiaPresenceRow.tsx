import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MiaColors, bubbleBorderRadius } from '../theme/colors';
import { MiaAvatar } from './MiaAvatar';

export type MiaPresenceKind = 'typing' | 'recording';

const DOT = 6;
const SPACING = 4;
const BOUNCE = 4;

function TypingDots() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <View style={styles.dotsRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            i > 0 && { marginLeft: SPACING },
            {
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 0.25, 0.5, 0.75, 1],
                    outputRange: [0, -BOUNCE, 0, BOUNCE, 0],
                  }),
                },
              ],
              opacity: anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.55, 0.9, 0.55],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

function RecordingMic() {
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
    <Animated.View style={{ opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }}>
      <Ionicons name="mic" size={18} color="#E54D42" />
    </Animated.View>
  );
}

type Props = {
  kind: MiaPresenceKind;
  compactTop?: boolean;
};

export function MiaPresenceRow({ kind, compactTop = false }: Props) {
  return (
    <View style={[styles.row, { marginTop: compactTop ? 4 : 16 }]}>
      <MiaAvatar size={28} />
      <View style={styles.gap} />
      <View style={[styles.bubble, bubbleBorderRadius(false)]}>
        {kind === 'typing' ? <TypingDots /> : <RecordingMic />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
  gap: { width: 8 },
  bubble: {
    backgroundColor: MiaColors.miaBubble,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 36,
    justifyContent: 'center',
  },
  dotsRow: { flexDirection: 'row', alignItems: 'flex-end', height: DOT + BOUNCE },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: MiaColors.textMuted,
  },
});
