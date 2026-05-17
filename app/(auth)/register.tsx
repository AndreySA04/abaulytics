import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Lock, Mail, User } from "lucide-react-native";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <LinearGradient
      colors={["#162233", "#090E16"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      className="flex-1"
    >
      <TouchableOpacity
        className="absolute top-14 left-8 z-10 flex-row items-center"
        onPress={() => router.push("/")}
      >
        <ArrowLeft size={20} color="#94a3b8" />
        <Text className="text-slate-400 text-base ml-2">Voltar ao login</Text>
      </TouchableOpacity>

      <KeyboardAwareScrollView
        enableOnAndroid={true}
        extraScrollHeight={50}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        className="px-6"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center mb-8">
          <Text className="text-white text-4xl font-bold">Criar Conta</Text>
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
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          className="bg-orange-500 rounded-2xl h-14 mt-10 flex-row justify-center items-center"
          style={{ elevation: 8 }}
        >
          <Text className="text-white text-lg font-bold mr-2">Criar Conta</Text>
          <ArrowRight size={20} color="white" />
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
