import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#090E16" },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="index" /> 
        <Stack.Screen name="register" />
        <Stack.Screen name="password" />
      </Stack>
    </GestureHandlerRootView>
  );
}