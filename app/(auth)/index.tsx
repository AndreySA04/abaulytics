import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowRight, Box, Lock, Mail, Eye, EyeOff } from "lucide-react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useLogin } from "../../src/hooks/useLogin";

export default function LoginScreen() {
  const router = useRouter();
  const { email, setEmail, password, setPassword, errors, handleEnter, message, isLoading } = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <LinearGradient
      colors={["#162233", "#090E16"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      className="flex-1"
    >
      <KeyboardAwareScrollView
        bottomOffset={50}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        style={{ paddingHorizontal: 24 }}
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
              className={`h-14 bg-slate-800 border ${errors?.email ? 'border-red-500' : 'border-slate-700'} rounded-2xl flex-row items-center px-4`}
            >
              <Mail size={20} color={errors?.email ? "#EF4444" : "#64748b"} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLoading}
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
            {errors?.email ? (
              <Text className="text-red-500 text-sm mt-1 ml-1 font-medium">{errors.email}</Text>
            ) : null}
          </View>

          <View>
            <Text className="text-white font-semibold mb-2 ml-1">Senha</Text>
            <View 
              className={`h-14 bg-slate-800 border ${errors?.password ? 'border-red-500' : 'border-slate-700'} rounded-2xl flex-row items-center px-4`}
            >
              <Lock size={20} color={errors?.password ? "#EF4444" : "#64748b"} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                onSubmitEditing={handleEnter}
                editable={!isLoading}
                className="flex-1 text-white ml-3 text-base"
              />
              <TouchableOpacity 
                onPress={() => setShowPassword(!showPassword)}
                className="p-2"
                activeOpacity={0.7}
              >
                {showPassword ? (
                  <EyeOff size={20} color="#94a3b8" />
                ) : (
                  <Eye size={20} color="#94a3b8" />
                )}
              </TouchableOpacity>
            </View>
            {errors?.password ? (
              <Text className="text-red-500 text-sm mt-1 ml-1 font-medium">{errors.password}</Text>
            ) : null}
          </View>
        </View>

        {!!message && <Text accessibilityRole="alert" className="text-red-400 mt-3">{message}</Text>}
        <TouchableOpacity
          className={`bg-orange-500 rounded-2xl h-14 mt-8 flex-row justify-center items-center ${isLoading ? 'opacity-80' : 'opacity-100'}`}
          onPress={handleEnter}
          disabled={isLoading}
          style={{
            shadowColor: "#FF7300",
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text className="text-white text-lg font-bold mr-2">Entrar na Bancada</Text>
              <ArrowRight size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        <View className="flex-row justify-center mt-8 mb-6">
          <Text className="text-slate-400 text-base">Não tem uma conta? </Text>
          <TouchableOpacity onPress={() => router.push("/register")} disabled={isLoading}>
            <Text className="text-orange-500 font-semibold text-base">
              Solicite acesso
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity accessibilityRole="button" className="mb-8 items-center py-3"
          onPress={() => router.push('/producao')} disabled={isLoading}>
          <Text className="font-semibold text-orange-400">Acessar Produção com crachá</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
