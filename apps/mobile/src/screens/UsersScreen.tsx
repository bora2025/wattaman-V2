import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { COLORS } from '../theme';

const USER_ROLES = ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
const OFFICER_ROLES = [
  'OFFICER', 'STAFF', 'OFFICE_HEAD', 'DEPUTY_OFFICE_HEAD',
  'DEPARTMENT_HEAD', 'DEPUTY_DEPARTMENT_HEAD',
  'GENERAL_DEPARTMENT_DIRECTOR', 'DEPUTY_GENERAL_DEPARTMENT_DIRECTOR',
  'PRIMARY_SCHOOL_PRINCIPAL', 'SECONDARY_SCHOOL_PRINCIPAL',
  'HIGH_SCHOOL_PRINCIPAL', 'UNIVERSITY_RECTOR',
  'COMPANY_CEO', 'PROJECT_MANAGER', 'BRANCH_MANAGER',
  'EXECUTIVE_DIRECTOR', 'HR_MANAGER', 'CREDIT_OFFICER',
  'SECURITY_GUARD', 'JANITOR', 'TRAINER',
  'ATHLETE_MALE', 'ATHLETE_FEMALE',
  'BARISTA', 'CASHIER', 'RECEPTIONIST', 'GENERAL_MANAGER',
];

export default function UsersScreen({ navigation, route }: any) {
  const userType = route?.params?.userType || 'users'; // 'users' or 'officers'
  const isOfficerMode = userType === 'officers';
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('ALL');

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await fetchWithAuth('/auth/users');
      if (res.ok) {
        const all = await res.json();
        // Filter based on mode: users (core roles) vs officers (staff roles)
        const filtered = isOfficerMode
          ? all.filter((u: any) => !USER_ROLES.includes(u.role))
          : all.filter((u: any) => USER_ROLES.includes(u.role));
        setUsers(filtered);
      }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  const filterChips = isOfficerMode ? ['ALL'] : ['ALL', ...USER_ROLES];
  const filtered = selectedRole === 'ALL' ? users : users.filter(u => u.role === selectedRole);

  const getRoleIcon = (role: string): keyof typeof Ionicons.glyphMap => {
    switch (role) {
      case 'ADMIN': return 'shield-outline';
      case 'TEACHER': return 'school-outline';
      case 'STUDENT': return 'person-outline';
      case 'PARENT': return 'people-outline';
      default: return 'briefcase-outline';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return '#EF4444';
      case 'TEACHER': return '#3B82F6';
      case 'STUDENT': return '#10B981';
      case 'PARENT': return '#8B5CF6';
      default: return '#F59E0B';
    }
  };

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 100 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isOfficerMode ? 'Manage Officers' : 'Manage Users'}</Text>
        <Text style={styles.countBadge}>{filtered.length}</Text>
      </View>

      <View style={styles.filterRow}>
        {filterChips.map(role => (
          <TouchableOpacity
            key={role}
            style={[styles.filterChip, selectedRole === role && styles.filterChipActive]}
            onPress={() => setSelectedRole(role)}
          >
            <Text style={[styles.filterText, selectedRole === role && styles.filterTextActive]}>
              {role === 'ALL' ? 'All' : role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={[styles.roleIndicator, { backgroundColor: getRoleColor(item.role) }]} />
            <View style={styles.avatar}>
              <Ionicons name={getRoleIcon(item.role)} size={22} color={getRoleColor(item.role)} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.name}</Text>
              <Text style={styles.userEmail}>{item.email}</Text>
              {item.phone && <Text style={styles.userPhone}>📱 {item.phone}</Text>}
            </View>
            <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + '20' }]}>
              <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, flex: 1 },
  countBadge: { backgroundColor: COLORS.primary, color: COLORS.white, fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.inputBorder },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.white },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  roleIndicator: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  userEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  userPhone: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  roleText: { fontSize: 11, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
