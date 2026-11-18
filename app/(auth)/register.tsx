import React from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Lock, Mail, User } from "lucide-react-native";
import { useRegister } from "../../src/hooks/useRegister";

export default function RegisterScreen() {
  const router = useRouter();
  const { name, setName, email, setEmail, password, setPassword, acceptedPrivacy, setAcceptedPrivacy, errors, handleEnter, isLoading } = useRegister();

  return (
    <LinearGradient
      colors={["#162233", "#090E16"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      className="flex-1"
    >
      <TouchableOpacity
        className="absolute top-14 left-8 z-10 flex-row items-center"
        onPress={() => router.dismissTo('/(auth)')}
      >
        <ArrowLeft size={20} color="#94a3b8" />
        <Text className="text-slate-400 text-base ml-2">Voltar ao login</Text>
      </TouchableOpacity>

      <KeyboardAwareScrollView
        bottomOffset={50}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        style={{ paddingHorizontal: 24 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-8">
          <Text className="text-white text-4xl font-bold">{isLoading ? 'Criando...' : 'Criar Conta'}</Text>
          <Text className="text-blue-300/70 text-base mt-2">
            Solicite acesso ao Abaulytics
          </Text>
        </View>

        <View className="gap-6">
          <View>
            <Text className="text-slate-300 font-semibold mb-2 ml-1">
              Nome Completo
            </Text>
            <View className="h-14 bg-slate-900/50 border border-slate-700/50 rounded-2xl flex-row items-center px-4">
              <User size={20} color="#64748b" />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Seu nome"
                placeholderTextColor="#475569"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
          </View>

          <View>
            <Text className="text-slate-300 font-semibold mb-2 ml-1">
              E-mail corporativo
            </Text>
            <View className="h-14 bg-slate-900/50 border border-slate-700/50 rounded-2xl flex-row items-center px-4">
              <Mail size={20} color="#64748b" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="nome@empresa.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
          </View>

          <View>
            <Text className="text-slate-300 font-semibold mb-2 ml-1">
              Senha
            </Text>
            <View className="h-14 bg-slate-900/50 border border-slate-700/50 rounded-2xl flex-row items-center px-4">
              <Lock size={20} color="#64748b" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#475569"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/privacy-policy')} className="mt-6 py-3">
          <Text className="text-orange-400 text-center">Ler política de privacidade</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: acceptedPrivacy, disabled: isLoading }}
          disabled={isLoading} onPress={() => setAcceptedPrivacy(!acceptedPrivacy)} className="flex-row items-start py-3">
          <View className={`w-6 h-6 rounded border mr-3 items-center justify-center ${acceptedPrivacy ? 'bg-orange-500 border-orange-500' : 'border-slate-400'}`}>
            {acceptedPrivacy && <Text className="text-white font-bold">✓</Text>}
          </View>
          <Text className="text-slate-300 flex-1 leading-5">Li e aceito a política de privacidade e autorizo o envio das imagens das chapas para análise e o armazenamento dos resultados. Posso revogar em Minha Conta.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-orange-500 rounded-2xl h-14 mt-10 flex-row justify-center items-center"
          style={{ elevation: 8 }}
          disabled={isLoading}
          onPress={handleEnter}
        >
          <Text className="text-white text-lg font-bold mr-2">{isLoading ? 'Protegendo sua conta...' : 'Criar Conta'}</Text>
          {isLoading ? <ActivityIndicator color="white" /> : <ArrowRight size={20} color="white" />}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
