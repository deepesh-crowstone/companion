import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const KEYBOARD_GAP = 10;

export type ChatInputBottomLayout = {
  /** Lifts the input above the keyboard in adjustPan mode. */
  lift: number;
  /** paddingBottom inside the input bar. */
  padding: number;
};

/** Re-sync root height after IME closes — fixes grey gap below input on Android. */
export function useAndroidWindowHeight(): number {
  const [height, setHeight] = useState(() => Dimensions.get('window').height);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sync = () => setHeight(Dimensions.get('window').height);

    const dimSub = Dimensions.addEventListener('change', sync);
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      requestAnimationFrame(sync);
      setTimeout(sync, 50);
    });

    return () => {
      dimSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/** Bottom spacing for chat input — safe area when closed, gap/lift when keyboard open. */
export function useChatInputBottomLayout(): ChatInputBottomLayout {
  const insets = useSafeAreaInsets();
  const closedPadding = insets.bottom + 12;

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [usesResize, setUsesResize] = useState(true);
  const windowHeightRef = useRef(Dimensions.get('window').height);
  const keyboardHeightRef = useRef(0);

  useEffect(() => {
    const syncWindowHeight = () => {
      if (keyboardHeightRef.current === 0) {
        windowHeightRef.current = Dimensions.get('window').height;
      }
    };

    const dimSub = Dimensions.addEventListener('change', syncWindowHeight);

    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const kh = e.endCoordinates.height;
      const wh = Dimensions.get('window').height;
      const shrink = windowHeightRef.current - wh;
      setUsesResize(shrink > kh * 0.35);
      keyboardHeightRef.current = kh;
      setKeyboardHeight(kh);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      requestAnimationFrame(syncWindowHeight);
      setTimeout(syncWindowHeight, 50);
    });

    return () => {
      dimSub.remove();
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (Platform.OS !== 'android') {
    return { lift: 0, padding: closedPadding };
  }

  if (keyboardHeight === 0) {
    return { lift: 0, padding: closedPadding };
  }

  if (usesResize) {
    return { lift: 0, padding: KEYBOARD_GAP };
  }

  return { lift: keyboardHeight, padding: KEYBOARD_GAP };
}
