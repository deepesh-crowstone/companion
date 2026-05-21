import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isProductionApi, resolvedApiBaseUrl } from '../config';
import { MiaProfile } from '../data/miaProfile';
import { apiService } from '../services/apiService';
import { MiaColors } from '../theme/colors';
import { Fonts, MiaTypography } from '../theme/typography';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export function AuthScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [isRegister, setIsRegister] = useState(route.params?.initialRegister ?? false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [obscure, setObscure] = useState(true);

  useEffect(() => {
    void apiService.checkHealth().then(setServerReachable);
  }, []);

  const friendlyError = (e: unknown): string => {
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes('Cannot reach server')) {
      if (isProductionApi()) {
        return `can't reach ${MiaProfile.name.toLowerCase()}'s server. on your phone open ${resolvedApiBaseUrl()}/health — if that fails, set private DNS to automatic or dns.google, then try again.`;
      }
      return "can't reach the server. run npm run dev on your mac, then use EXPO_PUBLIC_API_BASE_URL with your mac's ip.";
    }
    if (raw.includes('Username already taken')) return 'that username is taken — try another.';
    if (raw.includes('Invalid username or password')) return 'wrong username or password.';
    return raw;
  };

  const validate = (): boolean => {
    const u = username.trim();
    if (u.length < 3) {
      setError('at least 3 characters');
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(u)) {
      setError('letters, numbers, underscore only');
      return false;
    }
    if (password.length < 6) {
      setError('at least 6 characters');
      return false;
    }
    setError(null);
    return true;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    setError(null);
    try {
      if (isRegister) await apiService.register(username.trim(), password);
      else await apiService.login(username.trim(), password);
      navigation.reset({ index: 0, routes: [{ name: 'Chat' }] });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {serverReachable === false && (
        <View style={[styles.offline, { paddingTop: insets.top }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={MiaColors.accentDeep} />
          <Text style={styles.offlineText} numberOfLines={2}>
            can't reach server at {resolvedApiBaseUrl()}
          </Text>
          <Pressable onPress={() => void apiService.checkHealth().then(setServerReachable)}>
            <Text style={styles.retry}>retry</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: serverReachable === false ? 16 : Math.max(insets.top, 16) + 32 },
          { paddingBottom: Math.max(insets.bottom, 28) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.logo, MiaTypography.serifTitle(44)]}>zara</Text>
        <Text style={styles.sub}>{isRegister ? 'create your account' : 'welcome back'}</Text>

        <View style={styles.fieldWrap}>
          <Ionicons name="person-outline" size={22} color={MiaColors.textMuted} style={styles.fieldIcon} />
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.inputInner}
            placeholderTextColor={MiaColors.textMuted}
            returnKeyType="next"
          />
        </View>

        <View style={[styles.fieldWrap, styles.fieldGap]}>
          <Ionicons name="lock-closed-outline" size={22} color={MiaColors.textMuted} style={styles.fieldIcon} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            secureTextEntry={obscure}
            style={styles.inputInner}
            placeholderTextColor={MiaColors.textMuted}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          <Pressable onPress={() => setObscure((o) => !o)} style={styles.eyeBtn} hitSlop={8}>
            <Ionicons
              name={obscure ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={MiaColors.textMuted}
            />
          </Pressable>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.button, (loading || serverReachable === false) && styles.buttonDisabled]}
          onPress={() => void submit()}
          disabled={loading || serverReachable === false}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>{isRegister ? 'sign up' : 'log in'}</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setIsRegister((r) => !r);
            setError(null);
          }}
          disabled={loading}
          style={styles.switchBtn}
        >
          <Text style={styles.switchText}>
            {isRegister ? 'already have an account? log in' : 'new here? create account'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: MiaColors.background },
  scroll: { paddingHorizontal: 28 },
  logo: { color: MiaColors.miaText },
  sub: {
    marginTop: 8,
    fontFamily: Fonts.interMedium,
    fontSize: 15,
    color: MiaColors.statusPink,
  },
  fieldWrap: {
    marginTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MiaColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: MiaColors.miaBubble,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  fieldGap: { marginTop: 14 },
  fieldIcon: { marginRight: 4 },
  inputInner: {
    flex: 1,
    fontFamily: Fonts.inter,
    fontSize: 15,
    color: MiaColors.textPrimary,
    paddingVertical: 16,
  },
  eyeBtn: { paddingLeft: 8 },
  errorBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(176, 74, 90, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(176, 74, 90, 0.2)',
  },
  errorText: {
    fontFamily: Fonts.inter,
    color: MiaColors.accentDeep,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    marginTop: 28,
    backgroundColor: MiaColors.accent,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    fontFamily: Fonts.interSemiBold,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  switchBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  switchText: {
    fontFamily: Fonts.interMedium,
    color: MiaColors.accentDeep,
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(176, 74, 90, 0.12)',
  },
  offlineText: {
    flex: 1,
    fontFamily: Fonts.inter,
    fontSize: 12,
    color: MiaColors.accentDeep,
    lineHeight: 16,
  },
  retry: {
    fontFamily: Fonts.interSemiBold,
    color: MiaColors.accentDeep,
  },
});
