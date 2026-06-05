import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from "@expo/vector-icons";
import { salvarNoBanco } from "../../src/database/analysesRepository";
import { CheckCircle2, RefreshCcw, Hash } from "lucide-react-native";
import { useIsFocused } from "expo-router";

export default function AnalisarCaixaScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const isFocused = useIsFocused();

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
  }

  const PX_TO_MM_RATIO = 0.163453;

  const getAnalysisDetails = (resultadoString: string) => {
    try {
      const data = JSON.parse(resultadoString);
      const pxValue = data.abaulamento_px || 0;
      const mm = pxValue * PX_TO_MM_RATIO;
      return {
        mm: mm,
        id: data.id_medicao || '-'
      };
    } catch (error) {
      console.error("Erro ao fazer parse do resultado:", error);
      return { mm: 0, id: '-' };
    }
  };

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
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
      setIsCapturing(false);
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
      const resultadoString = JSON.stringify(json);
      
      await salvarNoBanco(resultadoString); 
      setResultado(resultadoString);

    } catch (err) {
      console.error("Erro na API", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const detalhes = resultado ? getAnalysisDetails(resultado) : { mm: 0, id: '-' };

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      
      <View style={{ flex: 1 }}>
        <View className="pt-16 px-6 py-6 flex-row items-center">
          <Text className="text-white text-2xl font-bold">Analisar Chapa</Text>
        </View>

        <View className="flex-1 justify-center items-center px-10">
          <View className="w-full aspect-[4/5] border-2 border-dashed border-slate-500 rounded-[40px] overflow-hidden relative bg-slate-800">
            {isFocused && (
              <CameraView 
                ref={cameraRef}
                style={{ flex: 1 }} 
                facing="back"
              />
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCapture}
              disabled={isCapturing}
              className="absolute inset-0 items-center justify-center bg-black/30"
            >
              <View className="items-center p-6 rounded-3xl" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
                <View className="p-4 rounded-full mb-4" style={{ backgroundColor: 'rgba(30, 41, 59, 0.8)' }}>
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
                  Alinhe a chapa na horizontal
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View className="mt-8 flex-row items-center px-4 py-2 rounded-full" style={{ backgroundColor: 'rgba(30, 41, 59, 0.3)' }}>
            <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: isCapturing ? '#22c55e' : '#f97316' }} />
            <Text className="text-slate-400 text-xs font-medium uppercase tracking-widest">
              {isCapturing ? "Processando imagem..." : "Aguardando posicionamento"}
            </Text>
          </View>
        </View>
        <View className="h-20" />
      </View>

      <Modal
        visible={!!resultado}
        animationType="fade"
        transparent={true} 
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View className="w-full bg-[#1e293b] rounded-[32px] p-6 border border-[#334155] items-center" style={{ elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 }}>
            <View className="p-4 rounded-full mb-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}>
              <CheckCircle2 size={40} color="#22c55e" />
            </View>
            
            <Text className="text-white text-xl font-bold mb-1">Análise Concluída</Text>
            
            <View className="flex-row items-center mb-6 mt-1">
              <Hash size={14} color="#94a3b8" />
              <Text className="text-slate-400 text-sm ml-1 font-medium">
                Medição BX-{detalhes.id}
              </Text>
            </View>
            
            <View className="w-full bg-[#0f172a] rounded-2xl p-5 mb-8 items-center border border-slate-800">
              <Text className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">
                Abaulamento
              </Text>
              <View className="flex-row items-end justify-center">
                <Text className="text-white text-6xl font-black tracking-tighter" style={{ color: '#f97316' }}>
                  {detalhes.mm.toFixed(2)}
                </Text>
                <Text className="text-slate-400 text-xl font-bold ml-2 mb-2">
                  mm
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              onPress={() => setResultado(null)}
              className="bg-orange-500 w-full flex-row justify-center items-center py-4 rounded-xl"
              activeOpacity={0.8}
            >
              <RefreshCcw size={20} color="white" className="mr-2" />
              <Text className="text-white font-bold text-lg ml-2">Nova Leitura</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}