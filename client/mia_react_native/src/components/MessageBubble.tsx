import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChatMessage, isAudioMessage, isUserMessage } from '../models/ChatMessage';
import { MiaColors, bubbleBorderRadius } from '../theme/colors';
import { Fonts } from '../theme/typography';
import { DateSeparator } from './DateSeparator';
import { VoiceNoteBubble } from './VoiceNoteBubble';

type Props = {
  message: ChatMessage;
  showDateHeader: boolean;
  compactTop: boolean;
  isPlaying: boolean;
  onPlayAudio?: () => void;
};

export function MessageBubble({
  message,
  compactTop,
  isPlaying,
  onPlayAudio,
}: Omit<Props, 'showDateHeader'>) {
  const { width } = useWindowDimensions();
  const isUser = isUserMessage(message);
  const marginTop = compactTop ? 4 : 16;

  const bubbleStyle = [
    styles.bubbleBase,
    isUser ? styles.userBubble : styles.miaBubbleBg,
    bubbleBorderRadius(isUser),
  ];

  if (isAudioMessage(message)) {
    return (
      <View style={[isUser ? styles.alignEnd : styles.alignStart, { marginTop }]}>
        <View style={[...bubbleStyle, styles.audioPadding]}>
          <VoiceNoteBubble
            isUser={isUser}
            isPlaying={isPlaying}
            seed={message.id}
            audioUrl={message.audioUrl}
            durationSec={message.audioDurationSec}
            onPlay={onPlayAudio}
          />
        </View>
      </View>
    );
  }

  const text = isUser ? message.content : message.content.toLowerCase();

  return (
    <View style={[isUser ? styles.alignEnd : styles.alignStart, { marginTop }]}>
      <View style={[...bubbleStyle, { maxWidth: width * 0.76 }]}>
        <Text style={[styles.body, { color: isUser ? '#FFF' : MiaColors.miaText }]}>{text}</Text>
      </View>
    </View>
  );
}

export function ChatMessageTile({
  message,
  showDateHeader,
  compactTop,
  isPlaying,
  onPlayAudio,
}: Props) {
  return (
    <View>
      {showDateHeader && <DateSeparator date={message.createdAt} />}
      <MessageBubble
        message={message}
        compactTop={compactTop}
        isPlaying={isPlaying}
        onPlayAudio={onPlayAudio}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  alignEnd: { alignItems: 'flex-end', marginBottom: 2 },
  alignStart: { alignItems: 'flex-start', marginBottom: 2 },
  bubbleBase: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  userBubble: {
    backgroundColor: MiaColors.userBubble,
    shadowOpacity: 0.08,
  },
  miaBubbleBg: {
    backgroundColor: MiaColors.miaBubble,
    shadowOpacity: 0.04,
  },
  audioPadding: { paddingHorizontal: 12, paddingVertical: 10 },
  body: {
    fontFamily: Fonts.inter,
    fontSize: 15,
    lineHeight: 21,
  },
});
