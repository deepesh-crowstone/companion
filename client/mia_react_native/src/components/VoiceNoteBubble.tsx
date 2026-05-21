import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';

type Props = {
  isUser: boolean;
  isPlaying: boolean;
  seed: number;
  audioUrl?: string | null;
  durationSec?: number | null;
  onPlay?: () => void;
};

const durationCache = new Map<string, number>();

function generateWaveform(seed: number): number[] {
  let s = Math.abs(seed) || 1;
  return Array.from({ length: 32 }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return 6 + ((s % 1000) / 1000) * 22;
  });
}

function formatDuration(sec?: number | null): string {
  if (sec == null || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function VoiceNoteBubble({
  isUser,
  isPlaying,
  seed,
  audioUrl,
  durationSec,
  onPlay,
}: Props) {
  const bars = React.useMemo(() => generateWaveform(seed), [seed]);
  const anim = useRef(new Animated.Value(0)).current;
  const [resolvedSec, setResolvedSec] = useState<number | null>(durationSec ?? null);

  useEffect(() => {
    if (durationSec != null && durationSec > 0) {
      setResolvedSec(durationSec);
      return;
    }

    const url = audioUrl?.trim();
    if (!url || (!url.startsWith('file://') && !url.startsWith('http'))) {
      return;
    }

    const cached = durationCache.get(url);
    if (cached != null) {
      setResolvedSec(cached);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: false },
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        const millis = status.isLoaded ? status.durationMillis : undefined;
        await sound.unloadAsync();
        if (millis != null && millis > 0) {
          const sec = Math.max(1, Math.round(millis / 1000));
          durationCache.set(url, sec);
          if (!cancelled) setResolvedSec(sec);
        }
      } catch {
        /* keep placeholder until playback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, durationSec]);

  useEffect(() => {
    if (isPlaying) {
      const loop = Animated.loop(
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
      );
      loop.start();
      return () => loop.stop();
    }
    anim.setValue(0);
  }, [anim, isPlaying]);

  const fg = isUser ? '#FFFFFF' : MiaColors.accentDeep;
  const fgMuted = isUser ? 'rgba(255,255,255,0.7)' : MiaColors.textMuted;

  return (
    <Pressable onPress={onPlay} style={styles.row} accessibilityRole="button">
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color={fg} style={styles.play} />
      <View style={styles.wave}>
        {bars.map((h, i) => (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                height: isPlaying
                  ? anim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [h, h + 6, h],
                    })
                  : h,
                backgroundColor: fg,
                opacity: isPlaying ? 0.95 : 0.55,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.duration, { color: fgMuted }]}>{formatDuration(resolvedSec)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 220,
    maxWidth: 280,
  },
  play: { width: 28 },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 28, marginHorizontal: 8 },
  bar: { flex: 1, marginHorizontal: 0.8, borderRadius: 1.5, minHeight: 4 },
  duration: {
    fontFamily: Fonts.interMedium,
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
