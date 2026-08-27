import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

export default function MyReportsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [grid, setGrid] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadReport(); }, [dateStr]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const [gridRes, totalsRes] = await Promise.all([
        fetchWithAuth(`/reports/employee/my-daily-grid?date=${dateStr}`),
        fetchWithAuth(`/reports/employee/my-totals?date=${dateStr}`),
      ]);
      if (gridRes.ok) {
        const data = await gridRes.json();
        setGrid(Array.isArray(data) ? data : [data]);
      }
      if (totalsRes.ok) setTotals(await totalsRes.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  const changeDate = (days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    setDateStr(d.toISOString().split('T')[0]);
  };

  const changeMonth = (dir: number) => {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + dir);
    setDateStr(d.toISOString().split('T')[0]);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PRESENT': return '#22C55E';
      case 'ABSENT': return '#EF4444';
      case 'LATE': return '#F59E0B';
      case 'PERMISSION': return '#3B82F6';
      default: return COLORS.textLight;
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '--:--';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--:--'; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reports</Text>
      </View>

      <View style={styles.dateRow}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.dateBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeDate(-1)}>
          <Ionicons name="caret-back" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.dateText}>{dateStr}</Text>
        <TouchableOpacity onPress={() => changeDate(1)}>
          <Ionicons name="caret-forward" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.dateBtn}>
          <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {totals && (
        <View style={styles.summaryRow}>
          {[
            { label: 'Present', value: totals.present || 0, color: '#22C55E' },
            { label: 'Absent', value: totals.absent || 0, color: '#EF4444' },
            { label: 'Late', value: totals.late || 0, color: '#F59E0B' },
            { label: 'Perm.', value: totals.permission || 0, color: '#3B82F6' },
          ].map(s => (
            <View key={s.label} style={[styles.summaryItem, { borderBottomColor: s.color }]}>
              <Text style={[styles.summaryNum, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={grid}
          keyExtractor={(item, i) => item.id || String(i)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReport(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No attendance records found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <Text style={styles.recordDate}>{item.date || dateStr}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                  <Text style={styles.statusText}>{item.status || '-'}</Text>
                </View>
              </View>
              <View style={styles.timeRow}>
                <View style={styles.timeBlock}>
                  <Ionicons name="log-in-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.timeLabel}>Check In</Text>
                  <Text style={styles.timeValue}>{formatTime(item.checkInTime)}</Text>
                </View>
                <View style={styles.timeBlock}>
                  <Ionicons name="log-out-outline" size={16} color="#F59E0B" />
                  <Text style={styles.timeLabel}>Check Out</Text>
                  <Text style={styles.timeValue}>{formatTime(item.checkOutTime)}</Text>
                </View>
                <View style={styles.timeBlock}>
                  <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.timeLabel}>Session</Text>
                  <Text style={styles.timeValue}>{item.session || '-'}</Text>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 12 },
  dateBtn: { padding: 8, backgroundColor: COLORS.white, borderRadius: 8 },
  dateText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  summaryItem: { flex: 1, backgroundColor: COLORS.white, borderRadius: 10, padding: 10, alignItems: 'center', borderBottomWidth: 3 },
  summaryNum: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  recordCard: { backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  recordDate: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  timeRow: { flexDirection: 'row', justifyContent: 'space-around' },
  timeBlock: { alignItems: 'center', gap: 4 },
  timeLabel: { fontSize: 11, color: COLORS.textSecondary },
  timeValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
