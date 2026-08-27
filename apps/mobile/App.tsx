import React, { useState, useEffect, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from './src/AuthContext';
import { getToken, getUser, logout as apiLogout } from './src/api';
import { COLORS } from './src/theme';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ScannerScreen from './src/screens/ScannerScreen';
import SearchScreen from './src/screens/SearchScreen';
import UsersScreen from './src/screens/UsersScreen';
import ClassesScreen from './src/screens/ClassesScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import StaffReportsScreen from './src/screens/StaffReportsScreen';
import EditAttendanceScreen from './src/screens/EditAttendanceScreen';
import HolidaysScreen from './src/screens/HolidaysScreen';
import SessionSettingsScreen from './src/screens/SessionSettingsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MyReportsScreen from './src/screens/MyReportsScreen';
import StaffAttendanceScreen from './src/screens/StaffAttendanceScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const savedUser = await getUser();
          if (savedUser) setUser(savedUser);
        }
      } catch {}
      setIsReady(true);
    })();
  }, []);

  const authContext = useMemo(
    () => ({
      signIn: async () => {
        const savedUser = await getUser();
        setUser(savedUser);
      },
      signOut: async () => {
        await apiLogout();
        setUser(null);
      },
      user,
    }),
    [user]
  );

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          fullScreenGestureEnabled: true,
        }}>
          {user ? (
            <>
              <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ animation: 'fade' }} />
              <Stack.Screen name="Scanner" component={ScannerScreen} />
              <Stack.Screen name="StaffAttendance" component={StaffAttendanceScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="Users" component={UsersScreen} />
              <Stack.Screen name="Classes" component={ClassesScreen} />
              <Stack.Screen name="Reports" component={ReportsScreen} />
              <Stack.Screen name="StaffReports" component={StaffReportsScreen} />
              <Stack.Screen name="EditAttendance" component={EditAttendanceScreen} />
              <Stack.Screen name="Holidays" component={HolidaysScreen} />
              <Stack.Screen name="SessionSettings" component={SessionSettingsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="MyReports" component={MyReportsScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ animation: 'fade' }} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </AuthContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
