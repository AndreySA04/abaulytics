import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import {
  Package,
  TriangleAlert,
  TrendingUp,
  CheckCircle2,
  LogOut,
  User,
  Inbox,
} from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Analise } from "../../src/types/analyses";
import * as SecureStore from 'expo-secure-store';
import { getAnalysesCountToday, getCriticalAnalysesCountToday, getRecentAnalyses } from "../../src/database/analysesRepository";
import { getProfile } from "../../src/database/userRepository";
import { getAnalysisDetails } from "../../src/utils/analyze";

const getFormattedCurrentDate = () => {
  const date = new Date();
  const day = date.getDate();
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} de ${month} de ${year}`;
};

const getInitials = (name: string) => {
  if (!name) return "OP";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function HomeScreen() {
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [todayCount, setTodayCount] = useState<number>(0);
  const [criticalCount, setCriticalCount] = useState<number>(0);
  const [recentActivities, setRecentActivities] = useState<Analise[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [userInitials, setUserInitials] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      const fetchDashboardData = async () => {
        try {
          const userId = await SecureStore.getItemAsync('userId');
          
          if (userId) {
            const [userProfile, count, critical, recent] = await Promise.all([
              getProfile(userId),
              getAnalysesCountToday(userId),
              getCriticalAnalysesCountToday(userId),
              getRecentAnalyses(userId)
            ]);
            
            if (userProfile && userProfile.name) {
              setUserName(userProfile.name);
              setUserInitials(getInitials(userProfile.name));
            }

            setTodayCount(count);
            setCriticalCount(critical);
            setRecentActivities(recent);
          }
        } catch (error) {
          console.error("Erro ao buscar dados da dashboard:", error);
        }
      };

      fetchDashboardData();
    }, [])
  );

  const handleLogout = () => {
    setProfileMenuOpen(false);
    router.replace("/(auth)/");
  };
  
  return (
    <View className="flex-1 gap-4 bg-slate-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="bg-[#0f172a] pt-16 pb-12 px-6 rounded-b-[32px] z-50">
          <View className="flex-row justify-between items-center relative">
            <View>
              <Text className="text-white text-2xl font-bold">
                Olá, {userName.split(' ')[0] || 'Operador'}
              </Text>
              <Text className="text-slate-400 text-sm mt-1">
                {getFormattedCurrentDate()}
              </Text>
            </View>

            <View className="relative">
              <TouchableOpacity
                onPress={() => setProfileMenuOpen(!profileMenuOpen)}
                className="h-12 w-12 rounded-full bg-[#1e293b] border border-[#334155] items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-orange-500 font-bold text-base">{userInitials || 'OP'}</Text>
              </TouchableOpacity>

              {profileMenuOpen && (
                <View className="absolute right-0 top-14 bg-white rounded-xl shadow-xl border border-slate-100 py-1 w-40 z-50">
                  <TouchableOpacity
                    onPress={() => {
                      setProfileMenuOpen(false);
                      router.push("/profile");
                    }}
                    className="flex-row items-center space-x-2 gap-2 px-4 py-3 active:bg-slate-50"
                  >
                    <User size={16} color="#6a7282" />
                    <Text className="text-gray-500 font-medium text-sm">
                      Conta
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleLogout()}
                    className="flex-row items-center space-x-2 gap-2 px-4 py-3 active:bg-slate-50"
                  >
                    <LogOut size={16} color="#ef4444" />
                    <Text className="text-red-500 font-medium text-sm">
                      Sair
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View className="flex-row mt-8 gap-4">
            <View className="flex-1 bg-[#1e293b] border border-[#334155] rounded-2xl p-4 justify-between min-h-[100px]">
              <View className="flex-row items-center gap-2">
                <Package size={16} color="#60a5fa" />
                <Text className="text-slate-300 font-medium text-sm">
                  Medições Hoje
                </Text>
              </View>
              <Text className="text-white text-3xl font-bold mt-2">{todayCount}</Text>
            </View>

            <View className="flex-1 bg-[#1e293b] border border-[#334155] rounded-2xl p-4 justify-between min-h-[100px]">
              <View className="flex-row items-center gap-2">
                <TriangleAlert size={16} color="#fb923c" />
                <Text className="text-slate-300 font-medium text-sm">Críticos Hoje</Text>
              </View>
              <Text className="text-white text-3xl font-bold mt-2">{criticalCount}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          className="mx-6 mt-6 bg-white p-5 rounded-2xl shadow-sm flex-row justify-between items-center border border-slate-100"
          activeOpacity={0.8}
          onPress={() => router.push('/analyze/')}
        >
          <View>
            <Text className="text-[#0f172a] text-lg font-bold">
              Nova Medição
            </Text>
            <Text className="text-slate-500 text-sm mt-1">
              Registre os dados para analisar
            </Text>
          </View>
          <View className="bg-[#ff6b00] p-4 rounded-xl shadow-sm">
            <TrendingUp size={24} color="white" />
          </View>
        </TouchableOpacity>

        <View className="mt-6 mb-4 px-6">
          <Text className="text-xl font-bold text-[#0f172a]">
            Atividade Recente
          </Text>
        </View>

        <View className="px-6 pb-8">
          {recentActivities.length === 0 ? (
            <View className="bg-white border border-slate-100 rounded-3xl p-8 items-center justify-center shadow-sm mt-2">
              <View className="bg-slate-50 h-20 w-20 rounded-full items-center justify-center mb-5 border border-slate-100">
                <Inbox size={32} color="#94a3b8" />
              </View>
              <Text className="text-slate-700 font-bold text-lg mb-2 text-center">
                Nenhuma medição recente
              </Text>
              <Text className="text-slate-400 text-center text-sm px-4">
                Quando você registrar novas medições, os resultados aparecerão aqui.
              </Text>
            </View>
          ) : (
            recentActivities.map((item) => {
              const details = getAnalysisDetails(item.result);

              const isSuccess = details.status === "sucesso";
              const isWarning = details.status === "atencao";

              const safeDateString = item.created_at.replace(' ', 'T');
              const dateObj = new Date(safeDateString);

              dateObj.setHours(dateObj.getHours() - 3); 

              const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

              const iconBgColor = isSuccess ? "bg-green-100" : isWarning ? "bg-yellow-100" : "bg-red-100";
              const iconColor = isSuccess ? "#22c55e" : isWarning ? "#eab308" : "#ef4444";
              const valueColor = isSuccess ? "text-green-600" : isWarning ? "text-yellow-600" : "text-red-600";

              return (
                <View
                  key={item.id}
                  className="bg-white p-4 rounded-2xl mb-3 shadow-sm flex-row items-center border border-slate-100"
                >
                  <View
                    className={`h-12 w-12 rounded-full items-center justify-center mr-4 ${iconBgColor}`}
                  >
                    {isSuccess ? (
                      <CheckCircle2 size={24} color={iconColor} />
                    ) : (
                      <TriangleAlert size={24} color={iconColor} />
                    )}
                  </View>

                  <View className="flex-1">
                    <Text className="text-[#0f172a] font-bold text-base">
                      BX-{details.id_medicao || item.id}
                    </Text>
                    <Text className="text-slate-400 text-sm mt-0.5">
                      {formattedTime}
                    </Text>
                  </View>

                  <View className="items-end">
                    <Text className={`font-bold text-base ${valueColor}`}>
                      {details.value.toFixed(2)} mm
                    </Text>
                    <Text className="text-slate-400 text-[10px] font-bold mt-1 tracking-wider">
                      ABAULAMENTO
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
