import React, { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MiaColors } from '../theme/colors';

type Props = {
  enabled: boolean;
  holdActive: boolean;
  onTapStartAndLock: () => void;
  onHoldStart: () => void;
  onHoldSend: () => void;
  onHoldCancel: () => void;
};

/** Mic: tap to lock-record, long-press for push-to-talk. */
export function VoiceNoteMicButton({
  enabled,
  holdActive,
  onTapStartAndLock,
  onHoldStart,
  onHoldSend,
  onHoldCancel,
}: Props) {
  const longPressActive = useRef(false);
  const slideCancelled = useRef(false);
  const busy = useRef(false);
  const didLongPress = useRef(false);

  const handleTap = () => {
    if (!enabled || busy.current || holdActive || didLongPress.current) return;
    busy.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onTapStartAndLock();
    busy.current = false;
  };

  return (
    <Pressable
      disabled={!enabled || holdActive}
      onLongPress={() => {
        if (!enabled || busy.current || holdActive) return;
        didLongPress.current = true;
        longPressActive.current = true;
        slideCancelled.current = false;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void onHoldStart();
      }}
      delayLongPress={200}
      onPress={handleTap}
      onPressOut={() => {
        if (slideCancelled.current) {
          slideCancelled.current = false;
          longPressActive.current = false;
          didLongPress.current = false;
          return;
        }
        if (longPressActive.current) {
          onHoldSend();
        }
        longPressActive.current = false;
        didLongPress.current = false;
      }}
      style={[styles.btn, holdActive && styles.btnActive]}
    >
      <Ionicons name="mic" size={22} color={holdActive ? '#FFF' : MiaColors.accentDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MiaColors.miaBubble,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  btnActive: {
    backgroundColor: MiaColors.accentDeep,
    shadowColor: MiaColors.accentDeep,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
});
