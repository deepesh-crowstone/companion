import React, { useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';
import { VoiceNoteMicButton } from './VoiceNoteMicButton';
import { VoiceRecordingBar } from './VoiceRecordingBar';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  recording: boolean;
  recordingLocked: boolean;
  recordingDurationMs: number;
  slideCancelActive: boolean;
  slideOffset: number;
  enabled: boolean;
  onSend: () => void;
  onTapStartAndLock: () => void;
  onHoldStart: () => void;
  onHoldSend: () => void;
  onHoldCancel: () => void;
  onSlideUpdate: (offset: number, cancelActive: boolean) => void;
  bottomPadding?: number;
};

export function ChatInputBar({
  value,
  onChangeText,
  recording,
  recordingLocked,
  recordingDurationMs,
  slideCancelActive,
  slideOffset,
  enabled,
  onSend,
  onTapStartAndLock,
  onHoldStart,
  onHoldSend,
  onHoldCancel,
  onSlideUpdate,
  bottomPadding,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;
  const showLockedSend = recording && recordingLocked;
  const showMic = !hasText && enabled && !showLockedSend;
  const holdActive = recording && !recordingLocked;

  const bottomPad = bottomPadding ?? insets.bottom + 12;

  const holdActiveRef = useRef(holdActive);
  holdActiveRef.current = holdActive;
  const callbacksRef = useRef({ onHoldSend, onHoldCancel, onSlideUpdate });
  callbacksRef.current = { onHoldSend, onHoldCancel, onSlideUpdate };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => holdActiveRef.current,
      onPanResponderMove: (_, g) => {
        const offset = Math.min(0, g.dx);
        callbacksRef.current.onSlideUpdate(offset, offset < -96);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -96) callbacksRef.current.onHoldCancel();
        else if (holdActiveRef.current) callbacksRef.current.onHoldSend();
        callbacksRef.current.onSlideUpdate(0, false);
      },
      onPanResponderTerminate: () => {
        callbacksRef.current.onSlideUpdate(0, false);
      },
    }),
  ).current;

  return (
    <View style={[styles.safe, { paddingBottom: bottomPad }]}>
      <View style={styles.row}>
        <View
          style={[
            styles.inputWrap,
            recording && styles.inputWrapRecording,
            holdActive && { minHeight: 52 },
          ]}
          {...(holdActive ? pan.panHandlers : {})}
        >
          {recording ? (
            <VoiceRecordingBar
              durationMs={recordingDurationMs}
              locked={recordingLocked}
              slideCancelActive={slideCancelActive}
              slideOffset={slideOffset}
              onCancel={onHoldCancel}
            />
          ) : (
            <TextInput
              value={value}
              onChangeText={onChangeText}
              editable={enabled}
              placeholder="message Mia..."
              placeholderTextColor="#A89FA3"
              style={styles.input}
              multiline
              maxLength={4000}
              textAlignVertical="center"
            />
          )}
        </View>

        <View style={styles.gap} />

        {showLockedSend ? (
          <SendButton canSend onPress={onHoldSend} />
        ) : showMic ? (
          <VoiceNoteMicButton
            enabled={enabled}
            holdActive={holdActive}
            onTapStartAndLock={onTapStartAndLock}
            onHoldStart={onHoldStart}
            onHoldSend={onHoldSend}
            onHoldCancel={onHoldCancel}
          />
        ) : (
          <SendButton canSend={hasText && enabled && !recording} onPress={onSend} />
        )}
      </View>
    </View>
  );
}

function SendButton({ canSend, onPress }: { canSend: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={canSend ? onPress : undefined}
      style={[styles.sendBtn, { opacity: canSend ? 1 : 0.55 }]}
      accessibilityRole="button"
      accessibilityLabel="Send message"
    >
      <Ionicons
        name="send"
        size={21}
        color={canSend ? MiaColors.accentDeep : `${MiaColors.accentDeep}66`}
        style={{ transform: [{ rotate: '-35deg' }] }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: MiaColors.chatBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(249, 221, 227, 0.8)',
  },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  inputWrap: {
    flex: 1,
    minHeight: 48,
    backgroundColor: MiaColors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(249, 221, 227, 0.55)',
    justifyContent: 'center',
  },
  inputWrapRecording: {
    borderColor: 'rgba(176, 74, 90, 0.45)',
    borderWidth: 1.5,
  },
  input: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontFamily: Fonts.inter,
    fontSize: 15,
    lineHeight: 20,
    color: MiaColors.textPrimary,
    maxHeight: 100,
  },
  gap: { width: 10 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MiaColors.miaBubble,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
