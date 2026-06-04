import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { ArrowLeft, User, Mail, Shield, Calendar, LogOut } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import { getProfile } from "../../src/database/userRepository";

const getInitials = (name: string) => {
  if (!name) return "OP";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function ProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{ name: string; email: string; role?: string; created_at?: string } | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userId = await SecureStore.getItemAsync('userId');
        if (userId) {
          const profile = await getProfile(userId);
          if (profile) {
            setUserData(profile);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados do usuário:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('userId');
    router.replace("/(auth)/");
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#ff6b00" />
      </View>
    );
  }

  const userInitials = userData?.name ? getInitials(userData.name) : "OP";

  return (
    <View className="flex-1 bg-slate-50">
      <View className="pt-16 pb-16 px-6 rounded-b-[32px] flex-row items-center">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="h-10 w-10 bg-white border border-slate-100 rounded-full items-center justify-center mr-4"
        >
          <ArrowLeft size={20} color="black" />
        </TouchableOpacity>
        <Text className="text-[#0f172a] text-xl font-bold">Minha Conta</Text>
      </View>

      <ScrollView className="flex-1 px-6 -mt-14" showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-3xl p-6 items-center shadow-sm border border-slate-100 mb-6">
          <View className="h-24 w-24 rounded-full bg-[#1e293b] border-4 border-white items-center justify-center shadow-md mb-4">
            <Text className="text-orange-500 font-bold text-3xl">{userInitials}</Text>
          </View>
          
          <Text className="text-[#0f172a] text-2xl font-bold text-center">
            {userData?.name || 'Operador'}
          </Text>
          <Text className="text-slate-400 text-sm mt-1">
            {userData?.email || 'usuario@email.com'}
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 gap-5 mb-6">
          <Text className="text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
            Informações do Perfil
          </Text>

          <View className="flex-row items-center border-b border-slate-100 pb-4">
            <View className="bg-slate-50 p-3 rounded-xl mr-4">
              <User size={20} color="#64748b" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-medium">Nome Completo</Text>
              <Text className="text-[#0f172a] text-base font-semibold mt-0.5">
                {userData?.name || 'Não informado'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center border-b border-slate-100 pb-4">
            <View className="bg-slate-50 p-3 rounded-xl mr-4">
              <Mail size={20} color="#64748b" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-400 text-xs font-medium">E-mail</Text>
              <Text className="text-[#0f172a] text-base font-semibold mt-0.5">
                {userData?.email || 'Não informado'}
              </Text>
            </View>
          </View>
          
          {userData?.created_at && (
            <View className="flex-row items-center pb-2">
              <View className="bg-slate-50 p-3 rounded-xl mr-4">
                <Calendar size={20} color="#64748b" />
              </View>
              <View className="flex-1">
                <Text className="text-slate-400 text-xs font-medium">Membro desde</Text>
                <Text className="text-[#0f172a] text-base font-semibold mt-0.5">
                  {new Date(userData.created_at).toLocaleDateString('pt-BR')}
                </Text>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-50 border border-red-100 rounded-2xl h-14 flex-row justify-center items-center mb-12 active:bg-red-100"
        >
          <LogOut size={20} color="#ef4444" />
          <Text className="text-red-500 text-base font-bold ml-2">Desconectar Conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
