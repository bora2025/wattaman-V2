import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform,
  ScrollView, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

export default function SettingsScreen({ navigation }: any) {
  const { user, signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const sections = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline' as const, label: 'Profile', detail: user?.name || 'User' },
        { icon: 'mail-outline' as const, label: 'Email', detail: user?.email || '' },
        { icon: 'shield-outline' as const, label: 'Role', detail: user?.role || 'USER' },
      ],
    },
    {
      title: 'App',
      items: [
        { icon: 'information-circle-outline' as const, label: 'Version', detail: '1.0.0' },
        { icon: 'globe-outline' as const, label: 'Server', detail: 'Connected' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
          <Text style={styles.profileName}>{user?.name || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          <View style={[styles.roleBadge, { backgroundColor: user?.role === 'ADMIN' ? '#EF4444' : user?.role === 'TEACHER' ? '#3B82F6' : '#F59E0B' }]}>
            <Text style={styles.roleText}>{user?.role || 'USER'}</Text>
          </View>
        </View>

        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, i) => (
                <View key={item.label} style={[styles.settingRow, i < section.items.length - 1 && styles.settingBorder]}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                  <Text style={styles.settingLabel}>{item.label}</Text>
                  <Text style={styles.settingDetail}>{item.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  profileCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 3 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoImg: { width: 48, height: 48 },
  profileName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  profileEmail: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  roleBadge: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  roleText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: COLORS.white, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  settingBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.inputBorder },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text },
  settingDetail: { fontSize: 14, color: COLORS.textSecondary },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderRadius: 12, padding: 16, gap: 8, marginTop: 10 },
  logoutText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
});
