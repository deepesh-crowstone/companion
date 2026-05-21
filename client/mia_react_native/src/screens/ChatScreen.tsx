import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChatInputBar } from '../components/ChatInputBar';
import { ChatMessageTile } from '../components/MessageBubble';
import { EmptyChat, ScrollToBottomButton } from '../components/EmptyChat';
import { MiaChatHeader } from '../components/MiaChatHeader';
import { MiaPresenceKind, MiaPresenceRow } from '../components/MiaPresenceRow';
import { resolvedApiBaseUrl } from '../config';
import { ChatMessage } from '../models/ChatMessage';
import { apiService } from '../services/apiService';
import { SessionExpiredException } from '../services/sessionExpired';
import { MiaColors } from '../theme/colors';
import { isFirstMessageOfDay } from '../utils/chatDates';
import { recordingDuration, typingDuration, waitRemaining } from '../utils/humanPresence';
import { useAndroidWindowHeight, useChatInputBottomLayout } from '../utils/keyboardLayout';
import { Ionicons } from '@expo/vector-icons';
import { MiaSnackbar } from '../components/MiaSnackbar';
import { Fonts } from '../theme/typography';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

const REPLY_IDLE_PAUSE = 2500;
const GO_ONLINE_DELAY = 2000;
const MIN_VOICE_MS = 600;

type MiaActivity = 'none' | 'typing' | 'recording';

export function ChatScreen({ navigation }: Props) {
  const androidWindowHeight = useAndroidWindowHeight();
  const inputBottomLayout = useChatInputBottomLayout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [miaActivity, setMiaActivity] = useState<MiaActivity>('none');
  const [statusText, setStatusText] = useState('offline');
  const [miaIsOnline, setMiaIsOnline] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [slideCancelActive, setSlideCancelActive] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const listRef = useRef<FlatList>(null);
  const recorderRef = useRef<Audio.Recording | null>(null);
  const recordPathRef = useRef<string | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const textOutboxRef = useRef<string[]>([]);
  const pendingOptimisticRef = useRef<number[]>([]);
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goOnlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyGenerationRef = useRef(0);
  const flushTextOutboxRef = useRef<() => Promise<void>>(async () => {});

  const statusWhenIdle = useCallback(() => (miaIsOnline ? 'online now' : 'offline'), [miaIsOnline]);

  const showMiaActivity = miaActivity !== 'none';

  const scrollToBottom = useCallback((animated = false) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  const showMessage = useCallback((msg: string) => setSnackbar(msg), []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof SessionExpiredException) {
        showMessage(e.message);
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        return;
      }
      const msg = e instanceof Error ? e.message.replace(/^Error: /, '') : String(e);
      if (msg.includes('Session expired') || msg.includes('foreign key')) {
        showMessage('please log in again.');
        void apiService.logout();
        navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        return;
      }
      const short = msg.includes('Cannot reach server')
        ? `can't reach mia's server. open ${resolvedApiBaseUrl()}/health in your phone browser.`
        : msg;
      showMessage(short);
    },
    [navigation, showMessage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.fetchMessages();
      setMessages(data);
      scrollToBottom(false);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [handleError, scrollToBottom]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiService.fetchMessages();
      setMessages(data);
    } catch (e) {
      handleError(e);
    } finally {
      setRefreshing(false);
    }
  }, [handleError]);

  useEffect(() => {
    void load();
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
      if (goOnlineTimerRef.current) clearTimeout(goOnlineTimerRef.current);
      void soundRef.current?.unloadAsync();
    };
  }, [load]);

  const abortMiaReply = useCallback(() => {
    replyGenerationRef.current += 1;
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    setMiaActivity('none');
    setStatusText(statusWhenIdle());
  }, [statusWhenIdle]);

  const scheduleGoOnline = useCallback(() => {
    if (goOnlineTimerRef.current) clearTimeout(goOnlineTimerRef.current);
    goOnlineTimerRef.current = setTimeout(() => {
      setMiaIsOnline(true);
      setStatusText((prev) => (prev === 'typing...' || prev === 'recording audio...' ? prev : 'online now'));
    }, GO_ONLINE_DELAY);
  }, []);

  const scheduleMiaReply = useCallback(() => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = setTimeout(() => {
      if (input.trim() || textOutboxRef.current.length === 0 || recording) return;
      void flushTextOutboxRef.current();
    }, REPLY_IDLE_PAUSE);
  }, [input, recording]);

  useEffect(() => {
    if (input.trim()) abortMiaReply();
    else if (textOutboxRef.current.length > 0 && !recording) scheduleMiaReply();
  }, [input, recording, abortMiaReply, scheduleMiaReply]);

  const flushTextOutbox = async () => {
    if (textOutboxRef.current.length === 0 || input.trim() || recording) return;

    const texts = [...textOutboxRef.current];
    const optimisticIds = [...pendingOptimisticRef.current];
    textOutboxRef.current = [];
    pendingOptimisticRef.current = [];

    const generation = ++replyGenerationRef.current;
    setMiaActivity('typing');
    setStatusText('typing...');
    const startedAt = Date.now();

    try {
      const result = await apiService.sendTextBatch(texts);
      if (generation !== replyGenerationRef.current) return;

      const assistants = result.assistants;
      const firstDelayMs = Math.min(
        2500,
        Math.max(650, Math.round(typingDuration(assistants[0]?.content ?? '') * 0.65)),
      );
      await waitRemaining(firstDelayMs, startedAt);
      if (generation !== replyGenerationRef.current) return;

      setMessages((prev) => {
        let updated = [...prev];
        optimisticIds.forEach((optId, i) => {
          const idx = updated.findIndex((m) => m.id === optId);
          if (idx >= 0 && i < result.users.length) updated[idx] = result.users[i];
        });
        return updated;
      });
      for (let i = 0; i < assistants.length; i += 1) {
        if (i > 0) {
          const delayMs = Math.min(
            4200,
            Math.max(1400, 1100 + assistants[i].content.trim().length * 55),
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (generation !== replyGenerationRef.current) return;
        }
        setMessages((prev) => [...prev, assistants[i]]);
        setMiaActivity(i === assistants.length - 1 ? 'none' : 'typing');
        setStatusText(i === assistants.length - 1 ? statusWhenIdle() : 'typing...');
        scrollToBottom(true);
      }
    } catch (e) {
      if (generation !== replyGenerationRef.current) return;
      setMessages((prev) => prev.filter((m) => !optimisticIds.includes(m.id)));
      textOutboxRef.current = [...texts, ...textOutboxRef.current];
      pendingOptimisticRef.current = [...optimisticIds, ...pendingOptimisticRef.current];
      setMiaActivity('none');
      setStatusText(statusWhenIdle());
      handleError(e);
    }
  };

  flushTextOutboxRef.current = flushTextOutbox;

  const sendText = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    abortMiaReply();

    const optimisticId = -Date.now();
    const optimistic: ChatMessage = {
      id: optimisticId,
      role: 'user',
      content: text,
      messageType: 'text',
      createdAt: new Date(),
    };

    textOutboxRef.current.push(text);
    pendingOptimisticRef.current.push(optimisticId);
    setMessages((prev) => [...prev, optimistic]);
    setPinnedToBottom(true);
    scrollToBottom(false);
    scheduleGoOnline();
    scheduleMiaReply();
  };

  const startRecording = async () => {
    if (recording) return;
    Keyboard.dismiss();

    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      showMessage('microphone permission is needed for voice notes');
      return;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

    const recordingObj = new Audio.Recording();
    await recordingObj.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recordingObj.startAsync();
    recorderRef.current = recordingObj;

    const path = `${FileSystem.cacheDirectory ?? ''}note_${Date.now()}.m4a`;
    recordPathRef.current = path;

    setRecording(true);
    setRecordingLocked(false);
    setRecordingDurationMs(0);
    setSlideCancelActive(false);
    setStatusText('listening…');

    recordTimerRef.current = setInterval(() => {
      setRecordingDurationMs((d) => d + 200);
    }, 200);
  };

  const tapStartAndLock = async () => {
    await startRecording();
    setRecordingLocked(true);
  };

  const cancelRecording = async () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    try {
      await recorderRef.current?.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    setRecording(false);
    setRecordingLocked(false);
    setSlideCancelActive(false);
    setSlideOffset(0);
    setRecordingDurationMs(0);
    setStatusText(statusWhenIdle());
  };

  const sendRecording = async () => {
    if (!recording) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    const duration = recordingDurationMs;
    let uri: string | null = null;
    try {
      await recorderRef.current?.stopAndUnloadAsync();
      uri = recorderRef.current?.getURI() || null;
    } catch {
      /* ignore */
    }
    recorderRef.current = null;

    setRecording(false);
    setRecordingLocked(false);
    setSlideCancelActive(false);
    setRecordingDurationMs(0);

    if (!uri) return;

    if (duration < MIN_VOICE_MS) {
      showMessage('hold longer to record a voice note');
      setStatusText(statusWhenIdle());
      return;
    }

    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    if (textOutboxRef.current.length > 0) await flushTextOutbox();

    const optimisticId = -Date.now();
    const durationSec = Math.min(599, Math.max(1, Math.floor(duration / 1000)));
    const optimistic: ChatMessage = {
      id: optimisticId,
      role: 'user',
      content: 'voice note',
      messageType: 'audio',
      audioUrl: uri,
      createdAt: new Date(),
      audioDurationSec: durationSec,
    };

    setMessages((prev) => [...prev, optimistic]);
    setMiaActivity('none');
    setPinnedToBottom(true);
    scheduleGoOnline();
    scrollToBottom(false);

    await new Promise((r) => setTimeout(r, 0));
    setMiaActivity('recording');
    setStatusText('recording audio...');
    const startedAt = Date.now();
    const generation = ++replyGenerationRef.current;

    try {
      const result = await apiService.sendVoice(uri);
      if (generation !== replyGenerationRef.current) return;

      await waitRemaining(recordingDuration(result.assistant.content), startedAt);
      if (generation !== replyGenerationRef.current) return;

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        result.user,
        result.assistant,
      ]);
      setMiaActivity('none');
      setStatusText(statusWhenIdle());
      scrollToBottom(true);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setMiaActivity('none');
      setStatusText(statusWhenIdle());
      handleError(e);
    }
  };

  const playAudio = async (msg: ChatMessage) => {
    if (!msg.audioUrl) return;

    if (playingId === msg.id) {
      await soundRef.current?.stopAsync();
      setPlayingId(null);
      return;
    }

    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync({ uri: msg.audioUrl });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setPlayingId(null);
      });
      setPlayingId(msg.id);
      await sound.playAsync();
    } catch (e) {
      handleError(e);
    }
  };

  const confirmLogout = () => {
    Alert.alert('log out?', "you'll need to sign in again to message mia.", [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'log out',
        style: 'destructive',
        onPress: async () => {
          await apiService.logout();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const listData = [...messages].reverse();
  const listCount = listData.length + (showMiaActivity ? 1 : 0);

  const renderItem = ({ index }: { index: number }) => {
    if (showMiaActivity && index === 0) {
      const kind: MiaPresenceKind = miaActivity === 'recording' ? 'recording' : 'typing';
      const compactTop = messages.length > 0 && messages[messages.length - 1].role === 'assistant';
      return <MiaPresenceRow kind={kind} compactTop={compactTop} />;
    }

    const msgIndex = messages.length - 1 - (index - (showMiaActivity ? 1 : 0));
    const msg = messages[msgIndex];
    const dates = messages.map((m) => m.createdAt);

    return (
      <ChatMessageTile
        message={msg}
        showDateHeader={isFirstMessageOfDay(dates, msgIndex)}
        compactTop={
          !isFirstMessageOfDay(dates, msgIndex) &&
          msgIndex > 0 &&
          messages[msgIndex].role === messages[msgIndex - 1].role
        }
        isPlaying={playingId === msg.id}
        onPlayAudio={() => void playAudio(msg)}
      />
    );
  };

  const chatBody = (
    <View style={styles.column}>
      <MiaChatHeader
        statusText={statusText}
        onProfile={() => navigation.navigate('Profile')}
        onCall={() => navigation.navigate('VoiceCall')}
        onMenu={() => setMenuOpen(true)}
      />

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={MiaColors.accent} />
        ) : messages.length === 0 && !showMiaActivity ? (
          <Pressable style={styles.emptyWrap} onPress={Keyboard.dismiss}>
            <EmptyChat />
          </Pressable>
        ) : (
          <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              data={Array.from({ length: listCount }, (_, i) => i)}
              inverted
              keyExtractor={(i) => String(i)}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              scrollEnabled
              onScrollBeginDrag={Keyboard.dismiss}
              onScroll={(e) => {
                const pinned = e.nativeEvent.contentOffset.y <= 72;
                setPinnedToBottom(pinned);
              }}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void onRefresh()}
                  tintColor={MiaColors.accent}
                  progressViewOffset={40}
                />
              }
            />
            {!pinnedToBottom && (messages.length > 0 || showMiaActivity) && (
              <View style={styles.fabWrap} pointerEvents="box-none">
                <ScrollToBottomButton onPress={() => scrollToBottom(true)} />
              </View>
            )}
          </View>
        )}
      </View>

      <View style={inputBottomLayout.lift > 0 ? { marginBottom: inputBottomLayout.lift } : undefined}>
        <ChatInputBar
          value={input}
          onChangeText={setInput}
          recording={recording}
          recordingLocked={recordingLocked}
          recordingDurationMs={recordingDurationMs}
          slideCancelActive={slideCancelActive}
          slideOffset={slideOffset}
          enabled={!loading}
          bottomPadding={inputBottomLayout.padding}
          onSend={sendText}
          onTapStartAndLock={() => void tapStartAndLock()}
          onHoldStart={() => void startRecording()}
          onHoldSend={() => void sendRecording()}
          onHoldCancel={() => void cancelRecording()}
          onSlideUpdate={(offset, cancel) => {
            setSlideOffset(offset);
            setSlideCancelActive(cancel);
          }}
        />
      </View>

      <MiaSnackbar
        message={snackbar ?? ''}
        visible={snackbar != null}
        onHide={() => setSnackbar(null)}
      />

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenuOpen(false);
                void onRefresh();
              }}
            >
              <Ionicons name="refresh" size={22} color={MiaColors.textPrimary} />
              <Text style={styles.sheetItemText}>refresh chat</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenuOpen(false);
                confirmLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={22} color={MiaColors.accentDeep} />
              <Text style={[styles.sheetItemText, { color: MiaColors.accentDeep }]}>log out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  const rootStyle =
    Platform.OS === 'android'
      ? [styles.screen, { height: androidWindowHeight }]
      : styles.screen;

  return (
    <View style={rootStyle}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {chatBody}
        </KeyboardAvoidingView>
      ) : (
        chatBody
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: MiaColors.chatBackground },
  flex: { flex: 1 },
  column: { flex: 1, backgroundColor: MiaColors.chatBackground },
  body: { flex: 1 },
  loader: { flex: 1 },
  emptyWrap: { flex: 1 },
  listWrap: { flex: 1 },
  list: { flex: 1 },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    // Inverted: paddingBottom = visual top (below header), paddingTop = visual bottom (above input)
    paddingBottom: 12,
    paddingTop: 8,
  },
  fabWrap: { position: 'absolute', right: 12, bottom: 10 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    backgroundColor: MiaColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: MiaColors.miaBubble,
    marginVertical: 8,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 14,
  },
  sheetItemText: {
    fontFamily: Fonts.inter,
    fontSize: 16,
    color: MiaColors.textPrimary,
  },
});
