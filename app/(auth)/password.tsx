import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter } from "expo-router";
import { Send } from "lucide-react-native";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");

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
        <Feather name="arrow-left" size={20} color="#94a3b8" />
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
          <Text className="text-white text-4xl font-bold">Recuperar Senha</Text>
          <Text className="text-gray-300/70 text-base mt-2 text-center">
            Digite seu e-mail para receber as instruções de recuperação de
            senha.
          </Text>
        </View>

        <View className="gap-6">
          <View>
            <Text className="text-slate-300 font-semibold mb-2 ml-1">
              E-mail corporativo
            </Text>
            <View className="h-14 bg-slate-900/50 border border-slate-700/50 rounded-2xl flex-row items-center px-4">
              <Feather name="mail" size={20} color="#64748b" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                className="flex-1 text-white ml-3 text-base"
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          className="bg-orange-500 rounded-2xl h-14 mt-8 flex-row justify-center items-center"
          style={{ elevation: 8 }}
        >
          <Send size={20} color="white" />
          <Text className="text-white text-lg font-bold ml-2">
            Enviar Instruções
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}
