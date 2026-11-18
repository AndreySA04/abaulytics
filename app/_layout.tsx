import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { clearPrivateFiles } from '../src/privacy/files';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { getDatabase } from '../src/database/database';

export default function RootLayout() {
  const [clean, setClean] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const cleanup = () => { setCleanupError(false); Promise.all([clearPrivateFiles(), getDatabase()]).then(() => setClean(true)).catch(() => setCleanupError(true)); };
  useEffect(cleanup, []);
  if (!clean) return <View className="flex-1 bg-slate-50 items-center justify-center px-6">
    {cleanupError ? <><Text className="text-slate-800 text-center mb-4">Não foi possível preparar o armazenamento local.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={cleanup}><Text className="text-orange-700 font-bold">Tentar novamente</Text></TouchableOpacity></> : <ActivityIndicator />}
    {!cleanupError && <Text className="text-slate-600 mt-3">Preparando seus dados com segurança...</Text>}
  </View>;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider preload={false}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#090E16" },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="producao" />
      </Stack>
      <Toast />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
