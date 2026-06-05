import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from "@expo/vector-icons";
import { salvarNoBanco } from "../../src/database/analysesRepository";
import { CheckCircle2, RefreshCcw } from "lucide-react-native";

export default function AnalisarCaixaScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  if (!permission) {
    return <View className="flex-1 bg-[#0f172a]" />;
  }

  const PX_TO_MM_RATIO = 0.264583;

  const getAnalysisDetails = (resultado: string) => {
    const pxValue = parseFloat(resultado) || 0;
    const mm = pxValue * PX_TO_MM_RATIO;
    
    return mm;
  };

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
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      console.log("Foto capturada com sucesso!", photo.uri);
      
      uploadImage(photo.uri);
      
    } catch (error) {
      console.error("Erro na captura:", error);
    }
  };

  const uploadImage = async (photoUri: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri: photoUri,
      name: 'chapa.jpg',
      type: 'image/jpeg',
    } as any);

    try {
      // Substitua pelo IPv4 do seu computador na rede Wi-Fi
      const url = 'http://192.168.15.8:8000/api/analisar-chapa'; 
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const json = await response.json();
      console.log("Resultado:", json);

      const resultadoString = JSON.stringify(json, null, 2);
      
      await salvarNoBanco(resultadoString); 
      
      setResultado(resultadoString);
    } catch (err) {
      console.error("Erro na API", err);
    }finally {
      setIsCapturing(false);
    }
  };
  if (resultado) {
    return (
      <View className="flex-1 bg-[#0f172a] pt-16 px-6">
        <View className="items-center mb-8 mt-4">
          <View className="bg-green-500/20 p-4 rounded-full mb-4">
            <CheckCircle2 size={48} color="#22c55e" />
          </View>
          <Text className="text-white text-2xl font-bold">Análise Concluída</Text>
          <Text className="text-slate-400 text-base mt-2 text-center">
            Medição realizada e salva com sucesso.
          </Text>
        </View>
        
        <View className="flex-1 bg-[#1e293b] rounded-3xl p-6 mb-6 border border-[#334155] shadow-lg justify-center items-center">
          <View className="bg-slate-800/50 px-4 py-2 rounded-full mb-6">
            <Text className="text-slate-300 font-bold uppercase tracking-widest text-sm">
              Abaulamento
            </Text>
          </View>

          <View className="flex-row items-end justify-center">
            <Text className="text-white text-[72px] font-black tracking-tighter" style={{ color: '#f97316' }}>
              {getAnalysisDetails(resultado)}
            </Text>
            <Text className="text-slate-400 text-2xl font-bold ml-2 mb-4">
              mm
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          onPress={() => setResultado(null)}
          className="bg-orange-500 flex-row justify-center items-center py-4 rounded-2xl mb-10 shadow-lg shadow-orange-500/30"
          activeOpacity={0.8}
        >
          <RefreshCcw size={20} color="white" className="mr-2" />
          <Text className="text-white font-bold text-lg ml-2">Nova Análise</Text>
        </TouchableOpacity>
      </View>
    );
  }

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