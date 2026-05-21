import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { MiaAvatar } from '../components/MiaAvatar';
import { MiaProfile } from '../data/miaProfile';
import { apiService } from '../services/apiService';
import { RealtimeCallService } from '../services/realtimeCallService';
import { MiaColors } from '../theme/colors';
import { Fonts, MiaTypography } from '../theme/typography';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceCall'>;

export function VoiceCallScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const callRef = useRef(new RealtimeCallService());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;

  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('connecting…');
  const [bars, setBars] = useState<number[]>(Array(28).fill(10));
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    const call = callRef.current;

    const unsubConn = call.onConnection((state) => {
      if (state === 'ready') {
        setConnected(true);
        setStarting(false);
        setError(null);
        setTranscript('…say something — i\'m listening');
      } else if (state === 'error') {
        setStarting(false);
        setConnected(false);
      }
    });

    const unsubTx = call.onTranscript((t) => {
      if (!t) return;
      if (/error|failed|denied|disconnect/i.test(t)) setError(t);
      setTranscript(t.startsWith('…') ? t : `…${t}`);
    });

    const unsubLevel = call.onLevel((level) => {
      setBars(
        Array.from({ length: 28 }, (_, i) => {
          const wobble = Math.sin(secondsRef.current * 0.4 + i * 0.5) * 8;
          return Math.min(56, Math.max(6, Math.round(level + wobble)));
        }),
      );
    });

    void (async () => {
      const mic = await Audio.requestPermissionsAsync();
      if (!mic.granted) {
        setStarting(false);
        setError('microphone permission is required for calls');
        setTranscript('permission denied');
        return;
      }

      try {
        const session = await apiService.createRealtimeSession();
        const config = (session.sessionConfig as Record<string, unknown>) ?? {};
        const preconfigured = session.sessionPreconfigured === true;

        await call.connect({
          wsUrl: session.wsUrl as string,
          token: session.token as string,
          sessionConfig: config,
          sessionPreconfigured: preconfigured,
        });

        timerRef.current = setInterval(() => {
          secondsRef.current += 1;
          setSeconds(secondsRef.current);
        }, 1000);
      } catch (e) {
        setStarting(false);
        setError(e instanceof Error ? e.message : String(e));
        setTranscript("couldn't connect");
      }
    })();

    return () => {
      unsubConn();
      unsubTx();
      unsubLevel();
      if (timerRef.current) clearInterval(timerRef.current);
      void call.hangUp();
    };
  }, [navigation]);

  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const endCall = async () => {
    await callRef.current.hangUp();
    if (timerRef.current) clearInterval(timerRef.current);
    navigation.goBack();
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <LinearGradient
      colors={[MiaColors.callGradientTop, MiaColors.callGradientMid, MiaColors.callGradientBottom]}
      locations={[0, 0.45, 1]}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}
    >
      <View style={styles.header}>
        <Pressable style={styles.glassBtn} onPress={() => void endCall()} accessibilityLabel="End call">
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerLabel}>VOICE CALL</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Animated.View style={[styles.avatarRing, { transform: [{ scale }] }]}>
        <MiaAvatar size={168} showBorder lightBorder borderWidth={2} />
        {starting && (
          <View style={styles.overlay}>
            <ActivityIndicator color="rgba(255,255,255,0.7)" />
          </View>
        )}
        {!starting && !connected && (
          <View style={styles.overlay}>
            <Ionicons name="cloud-offline-outline" size={40} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </Animated.View>

      <Text style={[styles.name, MiaTypography.serifTitle(38)]}>{MiaProfile.name}</Text>

      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: connected ? MiaColors.online : '#FF9800' }]} />
        <Text style={styles.statusText}>
          {connected ? `on the line · ${duration}` : starting ? 'connecting…' : 'not connected'}
        </Text>
      </View>

      <View style={styles.bars}>
        {bars.map((h, i) => (
          <View key={i} style={[styles.bar, { height: h }]} />
        ))}
      </View>

      <View style={styles.transcriptBox}>
        <Text style={styles.transcript}>{error ?? transcript}</Text>
      </View>

      <View style={styles.controls}>
        <CallAction
          label="MUTE"
          icon={muted ? 'mic-off' : 'mic'}
          active={muted}
          onPress={() => {
            const next = !muted;
            setMuted(next);
            void callRef.current.setMuted(next);
          }}
        />
        <CallAction
          label={speaker ? 'SPEAKER' : 'EARPIECE'}
          icon={speaker ? 'volume-high' : 'ear-outline'}
          active={speaker}
          onPress={() => {
            const next = !speaker;
            setSpeaker(next);
            void callRef.current.setSpeaker(next);
          }}
        />
        <Pressable style={styles.endBtn} onPress={() => void endCall()} accessibilityLabel="Hang up">
          <Ionicons name="call" size={30} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function CallAction({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionWrap}>
      <View style={[styles.actionBtn, active && styles.actionActive]}>
        <Ionicons name={icon} size={24} color="rgba(255,255,255,0.85)" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 44 },
  headerLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.interSemiBold,
    color: 'rgba(255,255,255,0.54)',
    fontSize: 11,
    letterSpacing: 2,
  },
  avatarRing: {
    alignSelf: 'center',
    marginTop: 32,
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    shadowColor: MiaColors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 4 },
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 28,
    textAlign: 'center',
    color: '#FFF',
  },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: {
    fontFamily: Fonts.inter,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 52,
    marginTop: 32,
    paddingHorizontal: 24,
  },
  bar: {
    width: 3,
    marginHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  transcriptBox: {
    marginTop: 28,
    marginHorizontal: 24,
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  transcript: {
    fontFamily: Fonts.inter,
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
    textAlign: 'center',
  },
  controls: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  actionWrap: { alignItems: 'center' },
  actionBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  actionLabel: {
    marginTop: 8,
    fontFamily: Fonts.interSemiBold,
    color: 'rgba(255,255,255,0.54)',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  endBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53935',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 6,
  },
});
