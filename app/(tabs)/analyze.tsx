import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Camera, Image } from "lucide-react-native";
import { useRouter } from "expo-router";

export default function AnalisarCaixaScreen() {
  const router = useRouter();

  const handleCapture = () => {
    console.log("Capturando imagem...");
    // Aqui entrará sua lógica de captura
  };

  return (
    <View className="flex-1 bg-[#0f172a]">
      <View className="pt-16 px-6 py-6 flex-row items-center">
        <Text className="text-white text-2xl font-bold">Analisar Caixa</Text>
      </View>
      <View className="flex-1 justify-center items-center px-10">
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleCapture}
          className="w-full aspect-[4/5] border-2 border-dashed border-slate-500 rounded-[40px] items-center justify-center bg-slate-800/10 overflow-hidden"
        >
          <View className="items-center p-6">
            <View className="bg-slate-800/40 p-6 rounded-full mb-6">
              <Camera size={48} color="#64748b" />
            </View>

            <Text className="text-white text-lg font-semibold text-center mb-2">
              Toque para capturar
            </Text>

            <Text className="text-slate-400 text-center px-4 text-sm leading-5">
              Alinhe a caixa dentro desta área na horizontal
            </Text>
          </View>
        </TouchableOpacity>
        <View className="mt-8 flex-row items-center bg-slate-800/30 px-4 py-2 rounded-full">
          <View className="w-2 h-2 rounded-full bg-orange-500 animate-pulse mr-2" />
          <Text className="text-slate-400 text-xs font-medium uppercase tracking-widest">
            Aguardando posicionamento
          </Text>
        </View>
      </View>
      <View className="h-20" />
    </View>
  );
}
