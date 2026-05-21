import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MiaColors } from '../theme/colors';
import { Fonts } from '../theme/typography';

const profileImage = require('../assets/mia_profile.png');

type Props = {
  size?: number;
  onPress?: () => void;
  showBorder?: boolean;
  borderWidth?: number;
  /** White border ring for header/call screens. */
  lightBorder?: boolean;
};

function FallbackLetter({ size }: { size: number }) {
  return (
    <LinearGradient
      colors={[MiaColors.miaBubble, MiaColors.accent]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: Fonts.interSemiBold, fontSize: size * 0.42, color: MiaColors.accentDeep }}>
        M
      </Text>
    </LinearGradient>
  );
}

export function MiaAvatar({
  size = 48,
  onPress,
  showBorder = false,
  borderWidth = 1.5,
  lightBorder = false,
}: Props) {
  const [failed, setFailed] = useState(false);

  const photo = failed ? (
    <FallbackLetter size={size} />
  ) : (
    <Image
      source={profileImage}
      style={{ width: size, height: size }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );

  const inner = (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        showBorder && {
          borderWidth,
          borderColor: lightBorder ? MiaColors.surface : MiaColors.accentLight,
          shadowColor: MiaColors.accent,
          shadowOpacity: 0.25,
          shadowRadius: size * 0.2,
          shadowOffset: { width: 0, height: size * 0.06 },
          elevation: showBorder ? 3 : 0,
        },
      ]}
    >
      {photo}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open Mia profile">
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MiaColors.miaBubble },
});
