import { hasConsent, setConsent, requireConsent, recordOwnAction } from '../../src/privacy/repository';
import { AnalysisConsentDialog } from '../../src/components/AnalysisConsentDialog';
import { removeCapture, adoptTemporaryFile } from '../../src/privacy/files';
import { analysisUrl } from '../../src/privacy/api';
import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from "react-native";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { salvarNoBanco } from "../../src/database/analysesRepository";
import { Camera, CheckCircle2, RefreshCcw, Hash } from "lucide-react-native";
import { useIsFocused, useRouter } from "expo-router";
import { getAnalysisDetails } from "../../src/utils/analyze";

export default function AnalisarCaixaScreen() {
  const router = useRouter();
  const captureBusy = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [processingStage, setProcessingStage] = useState('Capturando...');
  const [consentRequested, setConsentRequested] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [larguraNominalMm, setLarguraNominalMm] = useState('');

  const isFocused = useIsFocused();

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
  }

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
    if (!cameraRef.current || captureBusy.current) return;

    captureBusy.current = true;
    setIsCapturing(true);
    setProcessingStage('Capturando...');
    const captureStarted = performance.now();
    try {
      if (!await hasConsent()) { setConsentRequested(true); return; }
      await requireConsent();
      const width = Number(larguraNominalMm.replace(",", "."));
      if (!Number.isFinite(width) || width <= 0 || width > 100000) {
        throw new Error("Informe a largura nominal da chapa em milímetros, com um valor positivo de até 100000.");
      }
      analysisUrl();
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });
      if (__DEV__) console.info('[performance] captura', { ms: Math.round(performance.now() - captureStarted), width: photo.width, height: photo.height });

      let uri = photo.uri;
      try { uri = await adoptTemporaryFile(uri, 'jpg'); await uploadImage(uri, width); }
      finally { await removeCapture(uri); }
      
    } catch (error) {
      Alert.alert("Análise não concluída", error instanceof Error ? error.message : "Não foi possível capturar ou processar a imagem.", [
        { text: "OK" }, { text: 'Privacidade', onPress: () => router.push('/(tabs)/privacy') },
      ]);
    } finally { captureBusy.current = false; setIsCapturing(false); }
  };

  const uploadImage = async (photoUri: string, width: number) => {
    await requireConsent();
    const formData = new FormData();
    // Expo's fetch accepts a File/Blob, not React Native's legacy URI object.
    formData.append('file', new File(photoUri));
    formData.append('largura_real_mm', String(width));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setProcessingStage('Enviando e analisando...');
    const requestStarted = performance.now();
    try {
      const url = analysisUrl();
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      
      const json = await response.json();
      if (__DEV__) console.info('[performance] API', { ms: Math.round(performance.now() - requestStarted), serverTiming: response.headers.get('Server-Timing') });
      if (!response.ok || json.erro || json.status !== 'sucesso') throw new Error(json.erro || 'Falha no serviço de análise.');
      const resultadoString = JSON.stringify(json);
      
      setProcessingStage('Salvando resultado...');
      const saveStarted = performance.now();
      await salvarNoBanco(resultadoString);
      if (__DEV__) console.info('[performance] salvar resultado', { ms: Math.round(performance.now() - saveStarted) });
      setResultado(resultadoString);

    } catch (err) {
      await recordOwnAction('analysis', 'failure');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  };

  const detalhes = resultado ? getAnalysisDetails(resultado) : { mm: 0, id: '-', isContour: false };

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      
      <View style={{ flex: 1 }}>
        <View className="pt-16 px-6 py-4 flex-row items-center">
          <Text className="text-white text-2xl font-bold">Medição de bancada</Text>
        </View>

        <View className="px-6 mt-2 mb-6 items-center w-full">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 text-center">
            Largura nominal da chapa
          </Text>
          <View className="flex-row items-center justify-center bg-[#1e293b] border-2 border-slate-600 rounded-2xl px-4 py-2 w-2/3">
            <TextInput
              accessibilityLabel="Largura nominal da chapa em milímetros"
              value={larguraNominalMm}
              onChangeText={setLarguraNominalMm}
              keyboardType="decimal-pad"
              placeholder="Ex. 500"
              placeholderTextColor="#64748b"
              textAlign="center"
              style={{ 
                color: '#f97316',
                fontSize: 32, 
                fontWeight: 'bold', 
                minWidth: 80 
              }}
            />
            <Text className="text-slate-400 text-lg font-bold ml-1 mt-2">mm</Text>
          </View>
        </View>

        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-slate-300 text-center text-sm mb-3">
            Centralize a chapa inteira com margem e fundo contrastante. Na foto de frente, deixe a borda a medir no topo.
          </Text>
          <View className="w-full flex-1 max-h-80 border-2 border-slate-500 rounded-3xl overflow-hidden relative bg-slate-800">
            {isFocused && (
              <CameraView 
                ref={cameraRef}
                style={{ flex: 1 }} 
                facing="back"
              />
            )}

            <View pointerEvents="none" className="absolute inset-0 justify-center px-[8%]">
              <View className="h-[84%] rounded-lg border-2 border-dashed border-white/80" />
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={handleCapture}
            disabled={isCapturing}
            className="mt-4 flex-row items-center gap-2 px-5 py-3 rounded-full bg-orange-600"
          >
            {isCapturing ? <ActivityIndicator color="white" /> : <Camera size={20} color="white" />}
            <Text className="text-white font-semibold" accessibilityLiveRegion="polite">
              {isCapturing ? processingStage : "Capturar foto"}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="h-20" />
      </View>

      <AnalysisConsentDialog visible={consentRequested} onCancel={() => setConsentRequested(false)}
        onAccept={async () => { await setConsent(true); setConsentRequested(false); await handleCapture(); }} />
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
              <Text selectable style={{ flexShrink: 1 }} className="text-slate-400 text-sm ml-1 font-medium">
                Medição BX-{detalhes.id}
              </Text>
            </View>
            
            <View className="w-full bg-[#0f172a] rounded-2xl p-5 mb-8 items-center border border-slate-800">
              <Text className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">
                {detalhes.isContour ? 'Curvatura do contorno' : 'Abaulamento estimado'}
              </Text>
              <View className="flex-row items-end justify-center">
                <Text className="text-white text-6xl font-black tracking-tighter" style={{ color: '#f97316' }}>
                  {detalhes.mm.toFixed(2)}
                </Text>
                <Text className="text-slate-400 text-xl font-bold ml-2 mb-2">
                  mm
                </Text>
              </View>
              {detalhes.isContour && <Text className="text-slate-300 text-center text-sm mt-2">Estimativa da borda superior visível</Text>}
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
