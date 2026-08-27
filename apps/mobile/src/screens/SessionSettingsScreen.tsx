import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { COLORS } from '../theme';

const SESSION_LABELS = ['Session 1', 'Session 2', 'Session 3', 'Session 4'];

export default function SessionSettingsScreen({ navigation }: any) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [staffConfigs, setStaffConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'student' | 'staff'>('student');

  useEffect(() => { loadConfigs(); }, []);

  const loadConfigs = async () => {
    try {
      const [globalRes, staffRes] = await Promise.all([
        fetchWithAuth('/session-config/global'),
        fetchWithAuth('/session-config/staff'),
      ]);
      if (globalRes.ok) setConfigs(await globalRes.json());
      if (staffRes.ok) setStaffConfigs(await staffRes.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  const formatTime = (t: string) => {
    if (!t) return '--:--';
    return t.slice(0, 5);
  };

  const getTypeIcon = (type?: string): keyof typeof Ionicons.glyphMap => {
    switch (type?.toLowerCase()) {
      case 'full_day': return 'sunny-outline';
      case 'morning': return 'partly-sunny-outline';
      case 'afternoon': return 'cloudy-outline';
      case 'evening': return 'moon-outline';
      case 'night': return 'cloudy-night-outline';
      default: return 'time-outline';
    }
  };

  const activeConfigs = tab === 'student' ? configs : staffConfigs;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Session Settings</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'student' && styles.tabBtnActive]}
          onPress={() => setTab('student')}
        >
          <Text style={[styles.tabText, tab === 'student' && styles.tabTextActive]}>Student</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'staff' && styles.tabBtnActive]}
          onPress={() => setTab('staff')}
        >
          <Text style={[styles.tabText, tab === 'staff' && styles.tabTextActive]}>Staff</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={activeConfigs}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadConfigs(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No session configurations</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.configCard}>
              <View style={styles.configHeader}>
                <Ionicons name={getTypeIcon(item.type)} size={20} color={COLORS.primary} />
                <Text style={styles.configSession}>{SESSION_LABELS[item.session - 1] || `Session ${item.session}`}</Text>
                {item.type && (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{item.type?.replace('_', ' ')}</Text>
                  </View>
                )}
              </View>
              <View style={styles.timeRow}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Start</Text>
                  <Text style={styles.timeValue}>{formatTime(item.startTime)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textLight} />
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>End</Text>
                  <Text style={styles.timeValue}>{formatTime(item.endTime)}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, flex: 1 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 10 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.white, alignItems: 'center', borderWidth: 1, borderColor: COLORS.inputBorder },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.white },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  configCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  configHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  configSession: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1 },
  typeBadge: { backgroundColor: COLORS.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600', color: COLORS.primary, textTransform: 'capitalize' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  timeBlock: { alignItems: 'center' },
  timeLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  timeValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
