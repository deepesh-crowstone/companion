import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { apiService } from '../services/apiService';
import { MiaColors } from '../theme/colors';
import { AuthScreen } from '../screens/AuthScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { VoiceCallScreen } from '../screens/VoiceCallScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function BootstrapScreen({ onReady }: { onReady: (loggedIn: boolean) => void }) {
  useEffect(() => {
    void (async () => {
      await apiService.loadSession();
      let loggedIn = false;
      if (apiService.isLoggedIn) {
        const reachable = await apiService.checkHealth();
        loggedIn = reachable && (await apiService.validateSession());
      }
      onReady(loggedIn);
    })();
  }, [onReady]);

  return (
    <View style={styles.boot}>
      <ActivityIndicator color={MiaColors.accent} />
    </View>
  );
}

export function AppNavigator() {
  const [booted, setBooted] = useState(false);
  const [initialRoute, setInitialRoute] = useState<'Auth' | 'Chat'>('Auth');

  if (!booted) {
    return (
      <BootstrapScreen
        onReady={(loggedIn) => {
          setInitialRoute(loggedIn ? 'Chat' : 'Auth');
          setBooted(true);
        }}
      />
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="VoiceCall" component={VoiceCallScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: MiaColors.background },
});
