import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';

type Props = {
  message: string;
  visible: boolean;
  onHide: () => void;
  durationMs?: number;
  bottomOffset?: number;
};

/** Floating snackbar — matches Flutter MiaTheme.showMessage. */
export function MiaSnackbar({ message, visible, onHide, durationMs = 5000, bottomOffset = 88 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 12, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onHide();
      });
    }, durationMs);
    return () => clearTimeout(timer);
  }, [visible, message, durationMs, onHide, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ translateY }], bottom: bottomOffset }]}>
      <Pressable style={styles.bar} onPress={onHide}>
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  bar: {
    backgroundColor: MiaColors.errorBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  text: {
    fontFamily: Fonts.inter,
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
});
