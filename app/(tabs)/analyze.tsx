import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // Importamos um ícone real para a UI

export default function AnalisarCaixaScreen() {
  const router = useRouter();
  // 1. Hook obrigatório para gerenciar as permissões
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Enquanto verifica a permissão, não renderiza nada para evitar flashes
  if (!permission) {
    return <View className="flex-1 bg-[#0f172a]" />;
  }

  // Se não tem permissão, mostra a tela para solicitar
  if (!permission.granted) {
    return (
      <View className="flex-1 bg-[#0f172a] justify-center items-center px-6">
        <Text className="text-white text-center mb-6 text-lg">
          Precisamos de acesso à câmera para analisar a chapa.
        </Text>
        <TouchableOpacity 
          onPress={requestPermission} 
          className="bg-orange-500 px-6 py-3 rounded-full"
        >
          <Text className="text-white font-bold">Permitir Câmera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      // 2. Dispara a captura
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7, // 0.7 é ideal para equilibrar qualidade e tamanho de rede
        base64: false, // Mantemos false para enviar o arquivo via FormData para a API
      });
      
      console.log("Foto capturada com sucesso!", photo.uri);
      
      // TODO: Enviar photo.uri para o seu backend FastAPI
      
    } catch (error) {
      console.error("Erro na captura:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View className="flex-1 bg-[#0f172a]">
      <View className="pt-16 px-6 py-6 flex-row items-center">
        <Text className="text-white text-2xl font-bold">Analisar Chapa</Text>
      </View>

      <View className="flex-1 justify-center items-center px-10">
        
        {/* Container principal (Câmera + Overlay) */}
        <View className="w-full aspect-[4/5] border-2 border-dashed border-slate-500 rounded-[40px] overflow-hidden relative bg-slate-800">
          
          {/* 3. A Câmera real preenchendo o fundo */}
          <CameraView 
            ref={cameraRef}
            style={{ flex: 1 }} 
            facing="back"
          />

          {/* 4. Overlay interativo por cima da câmera */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCapture}
            disabled={isCapturing}
            className="absolute inset-0 items-center justify-center bg-black/30"
          >
            <View className="items-center p-6 bg-slate-900/70 rounded-3xl">
              <View className="bg-slate-800/80 p-4 rounded-full mb-4">
                {isCapturing ? (
                  <ActivityIndicator color="#f97316" size="large" />
                ) : (
                  <Ionicons name="camera-outline" size={40} color="#94a3b8" />
                )}
              </View>

              <Text className="text-white text-lg font-semibold text-center mb-2">
                {isCapturing ? "Processando..." : "Toque para capturar"}
              </Text>

              <Text className="text-slate-300 text-center px-4 text-sm leading-5">
                Alinhe a chapa de perfil na horizontal
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View className="mt-8 flex-row items-center bg-slate-800/30 px-4 py-2 rounded-full">
          <View className={`w-2 h-2 rounded-full mr-2 ${isCapturing ? 'bg-green-500' : 'bg-orange-500 animate-pulse'}`} />
          <Text className="text-slate-400 text-xs font-medium uppercase tracking-widest">
            {isCapturing ? "Processando imagem..." : "Aguardando posicionamento"}
          </Text>
        </View>
      </View>
      <View className="h-20" />
    </View>
  );
}