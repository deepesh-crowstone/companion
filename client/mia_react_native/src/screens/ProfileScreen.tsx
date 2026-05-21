import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MiaAvatar } from '../components/MiaAvatar';
import { MiaProfile } from '../data/miaProfile';
import { MiaColors } from '../theme/colors';
import { Fonts, MiaTypography } from '../theme/typography';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={MiaColors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 32) }]}
        showsVerticalScrollIndicator={false}
      >
        <MiaAvatar size={108} showBorder lightBorder borderWidth={3} />
        <Text style={[styles.name, MiaTypography.serifTitle(32)]}>Mia</Text>
        <Text style={styles.tagline}>{MiaProfile.tagline}</Text>

        <SectionCard title="about me">
          <Text style={styles.body}>{MiaProfile.about}</Text>
        </SectionCard>

        <SectionCard title="hobbies">
          <View style={styles.chips}>
            {MiaProfile.hobbies.map((h) => (
              <View key={h} style={styles.chip}>
                <Text style={styles.chipText}>{h}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="social">
          {MiaProfile.socialLinks.map((link) => (
            <Pressable
              key={link.platform}
              style={styles.social}
              onPress={() => void Linking.openURL(link.url)}
            >
              <Text style={styles.socialIcon}>{link.icon}</Text>
              <View style={styles.socialText}>
                <Text style={styles.socialPlatform}>{link.platform}</Text>
                <Text style={styles.socialHandle}>{link.handle}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={MiaColors.textMuted} />
            </Pressable>
          ))}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: MiaColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  backBtn: { width: 48, alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.interSemiBold,
    fontSize: 16,
    color: MiaColors.textPrimary,
  },
  scroll: { alignItems: 'center', paddingHorizontal: 24 },
  name: { marginTop: 16, textAlign: 'center' },
  tagline: {
    marginTop: 6,
    fontFamily: Fonts.interMedium,
    fontSize: 14,
    color: MiaColors.statusPink,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    marginTop: 16,
    padding: 18,
    backgroundColor: MiaColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: MiaColors.miaBubble,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardTitle: {
    fontFamily: Fonts.interBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: MiaColors.accentDeep,
    marginBottom: 12,
  },
  body: {
    fontFamily: Fonts.inter,
    fontSize: 15,
    lineHeight: 22,
    color: MiaColors.miaText,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chip: {
    margin: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(249, 221, 227, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(232, 137, 154, 0.2)',
  },
  chipText: {
    fontFamily: Fonts.interMedium,
    fontSize: 13,
    color: MiaColors.miaText,
  },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: MiaColors.background,
    marginBottom: 8,
  },
  socialIcon: { fontSize: 22, marginRight: 12 },
  socialText: { flex: 1 },
  socialPlatform: {
    fontFamily: Fonts.interSemiBold,
    fontSize: 14,
    color: MiaColors.miaText,
  },
  socialHandle: {
    fontFamily: Fonts.inter,
    fontSize: 13,
    color: MiaColors.textMuted,
  },
});
