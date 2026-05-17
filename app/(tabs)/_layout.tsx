import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Camera, History, Home } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#1e293b', 
        tabBarInactiveTintColor: '#94a3b8', 
        tabBarStyle: {
          height: 90,
          paddingBottom: 10,
          paddingTop: 10,
          borderTopWidth: 0,
          elevation: 10,
          shadowOpacity: 0.1,
          backgroundColor: '#ffffff',
        },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: '600'
        },
        animation: "shift"
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color }) => <Home size={26} color={color} />,
        }}
      />
      
      <Tabs.Screen
        name="analyze"
        options={{
          title: "Medir",
          tabBarIcon: ({ focused }) => (
            <View 
              className={`h-20 w-20 rounded-full items-center justify-center -mt-10 shadow-lg shadow-orange-500/50 ${
                focused ? 'bg-orange-600' : 'bg-orange-500'
              }`}
            >
              <Camera size={32} color="white" />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              className={`text-base font-semibold mt-2 ${
                focused ? 'text-orange-600' : 'text-[#94a3b8]'
              }`}
            >
              Medir
            </Text>
          )
        }}
      />
      
      <Tabs.Screen
        name="history"
        options={{
          title: "Histórico",
          tabBarIcon: ({ color }) => <History size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}