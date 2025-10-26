import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AntDesign from '@expo/vector-icons/AntDesign';
import Entypo from '@expo/vector-icons/Entypo';
export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Process Ticket',
          tabBarIcon: ({ color }) => <Entypo name="upload" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="TicketsScreen"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color }) => <AntDesign name="carry-out" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="googlesheets"
        options={{
          href: null, 
        }}
      />
    </Tabs>
    
  );
}
