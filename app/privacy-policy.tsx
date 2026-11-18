import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { POLICY_TEXT } from '../src/privacy/policy';
export default function PrivacyPolicy() {
  const router = useRouter();
  return <ScrollView className="flex-1 bg-slate-50 px-6 pt-16" contentContainerStyle={{ paddingBottom: 80 }}>
    <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} className="py-4"><Text className="text-orange-600 font-bold">Voltar</Text></TouchableOpacity>
    <Text selectable className="text-slate-800 text-base leading-7">{POLICY_TEXT}</Text>
  </ScrollView>;
}
