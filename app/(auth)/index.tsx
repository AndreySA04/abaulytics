import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Box, Lock, Mail } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter } from "expo-router";
import { useLogin } from "../../src/hooks/useLogin";

export default function LoginScreen() {
  const router = useRouter();
  const { email, setEmail, password, setPassword, errors, handleEnter } = useLogin();

  return (
    <LinearGradient
      colors={["#162233", "#090E16"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      className="flex-1"
    >
      <KeyboardAwareScrollView
        enableOnAndroid={true}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        className="px-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10 mt-10">
          <View
            className="w-24 h-24 bg-orange-500 rounded-3xl items-center justify-center mb-6"
            style={{
              transform: [{ rotate: "10deg" }],
              shadowColor: "#FF7300",
              shadowOpacity: 0.4,
              shadowRadius: 14,
              elevation: 10,
            }}
          >
            <View style={{ transform: [{ rotate: "-10deg" }] }}>
              <Box size={45} color="white" />
            </View>
          </View>
          <Text className="text-white text-4xl font-bold">Abaulytics</Text>
          <Text className="text-blue-300 text-base mt-2 text-center">
            Medição inteligente de abaulamento
          </Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="text-white font-semibold mb-2 ml-1">E-mail</Text>
            <View 
              className={`h-14 bg-slate-800 border ${errors.email ? 'border-red-500' : 'border-slate-700'} rounded-2xl flex-row items-center px-4`}
            >
              <Mail size={20} color={errors.email ? "#EF4444" : "#64748b"} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
            {errors.email ? (
              <Text className="text-red-500 text-sm mt-1 ml-1 font-medium">{errors.email}</Text>
            ) : null}
          </View>

          <View>
            <Text className="text-white font-semibold mb-2 ml-1">Senha</Text>
            <View 
              className={`h-14 bg-slate-800 border ${errors.password ? 'border-red-500' : 'border-slate-700'} rounded-2xl flex-row items-center px-4`}
            >
              <Lock size={20} color={errors.password ? "#EF4444" : "#64748b"} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
            {errors.password ? (
              <Text className="text-red-500 text-sm mt-1 ml-1 font-medium">{errors.password}</Text>
            ) : null}
            
            <TouchableOpacity
              className="self-end mt-3"
              onPress={() => router.push("/password")}
            >
              <Text className="text-orange-500 font-semibold">
                Esqueceu a senha?
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          className="bg-orange-500 rounded-2xl h-14 mt-8 flex-row justify-center items-center"
          onPress={handleEnter}
          style={{
            shadowColor: "#FF7300",
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <Text className="text-white text-lg font-bold mr-2">Entrar</Text>
          <ArrowRight size={20} color="white" />
        </TouchableOpacity>

        <View className="flex-row justify-center mt-8 mb-6">
          <Text className="text-slate-400 text-base">Não tem uma conta? </Text>
          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text className="text-orange-500 font-semibold text-base">
              Solicite acesso
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
