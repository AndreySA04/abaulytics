import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import {
  Package,
  TriangleAlert,
  TrendingUp,
  CheckCircle2,
  LogOut,
  User,
} from "lucide-react-native";
import { useRouter } from "expo-router";

type Status = "success" | "warning" | "critical";

interface Activity {
  id: string;
  code: string;
  time: string;
  value: string;
  status: Status;
}

const recentActivities: Activity[] = [
  {
    id: "1",
    code: "BX-1042",
    time: "10:42",
    value: "1.2 cm",
    status: "success",
  },
  {
    id: "2",
    code: "BX-1041",
    time: "10:15",
    value: "3.4 cm",
    status: "warning",
  },
  {
    id: "3",
    code: "BX-1040",
    time: "09:58",
    value: "5.8 cm",
    status: "critical",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

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
                Olá, Operador
              </Text>
              <Text className="text-slate-400 text-sm mt-1">
                Turno da Manhã • 17 Mai
              </Text>
            </View>

            <View className="relative">
              <TouchableOpacity
                onPress={() => setProfileMenuOpen(!profileMenuOpen)}
                className="h-12 w-12 rounded-full bg-[#1e293b] border border-[#334155] items-center justify-center"
                activeOpacity={0.7}
              >
                <Text className="text-orange-500 font-bold text-lg">OP</Text>
              </TouchableOpacity>

              {profileMenuOpen && (
                <View className="absolute right-0 top-14 bg-white rounded-xl shadow-xl border border-slate-100 py-1 w-40 z-50">
                  <TouchableOpacity
                    onPress={() => handleLogout()}
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

          <View className="flex-row mt-8 space-x-4 gap-4">
            <View className="flex-1 bg-[#1e293b] border border-[#334155] rounded-2xl p-4">
              <View className="flex-row items-center space-x-2 gap-2">
                <Package size={16} color="#60a5fa" />
                <Text className="text-slate-300 font-medium">
                  Medições Hoje
                </Text>
              </View>
              <Text className="text-white text-3xl font-bold mt-2">24</Text>
            </View>

            <View className="flex-1 bg-[#1e293b] border border-[#334155] rounded-2xl p-4">
              <View className="flex-row items-center space-x-2 gap-2">
                <TriangleAlert size={16} color="#fb923c" />
                <Text className="text-slate-300 font-medium">Críticos</Text>
              </View>
              <Text className="text-white text-3xl font-bold mt-2">3</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          className="mx-6 mt-8 bg-white p-5 rounded-2xl shadow-sm flex-row justify-between items-center border border-slate-100"
          activeOpacity={0.8}
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

        <View className="mt-8 mb-4 px-6">
          <Text className="text-xl font-bold text-[#0f172a]">
            Atividade Recente
          </Text>
        </View>

        <View className="px-6 pb-8">
          {recentActivities.map((item) => {
            const isSuccess = item.status === "success";
            const isWarning = item.status === "warning";

            const iconBgColor = isSuccess
              ? "bg-green-100"
              : isWarning
                ? "bg-yellow-100"
                : "bg-red-100";
            const iconColor = isSuccess
              ? "#22c55e"
              : isWarning
                ? "#eab308"
                : "#ef4444";
            const valueColor = isSuccess
              ? "text-green-600"
              : isWarning
                ? "text-yellow-600"
                : "text-red-600";

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
                    {item.code}
                  </Text>
                  <Text className="text-slate-400 text-sm mt-0.5">
                    {item.time}
                  </Text>
                </View>

                <View className="items-end">
                  <Text className={`font-bold text-base ${valueColor}`}>
                    {item.value}
                  </Text>
                  <Text className="text-slate-400 text-[10px] font-bold mt-1 tracking-wider">
                    ABAULAMENTO
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
