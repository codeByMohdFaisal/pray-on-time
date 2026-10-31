import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PilotProvider } from '../state';
import { colors } from '../ui';

export default function Layout() {
  return <SafeAreaProvider><PilotProvider><StatusBar style="dark" /><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: '#7B887E', tabBarStyle: { backgroundColor: '#FFF', borderTopColor: colors.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
    <Tabs.Screen name="index" options={{ title: 'My masjid', tabBarIcon: ({ color }) => <Text style={{ fontSize: 23, color }}>⌂</Text> }} />
    <Tabs.Screen name="volunteer" options={{ title: 'Volunteer', tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>▤</Text> }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>⚙</Text> }} />
  </Tabs></PilotProvider></SafeAreaProvider>;
}
