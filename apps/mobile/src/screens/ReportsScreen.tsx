import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

export default function ReportsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [grid, setGrid] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gridLoading, setGridLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadClasses(); }, []);

  const loadClasses = async () => {
    try {
      const teacherId = user?.role === 'TEACHER' ? user.id : undefined;
      const url = teacherId ? `/classes?teacherId=${teacherId}` : '/classes';
      const res = await fetchWithAuth(url);
      if (res.ok) setClasses(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const loadReport = async (cls: any) => {
    setSelectedClass(cls);
    setGridLoading(true);
    try {
      const [gridRes, totalsRes] = await Promise.all([
        fetchWithAuth(`/reports/attendance-grid?classId=${cls.id}&date=${dateStr}`),
        fetchWithAuth(`/reports/attendance-totals?classId=${cls.id}&date=${dateStr}`),
      ]);
      if (gridRes.ok) setGrid(await gridRes.json());
      if (totalsRes.ok) setTotals(await totalsRes.json());
    } catch {} finally { setGridLoading(false); }
  };

  const changeDate = (days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    const newDate = d.toISOString().split('T')[0];
    setDateStr(newDate);
    if (selectedClass) {
      setGridLoading(true);
      Promise.all([
        fetchWithAuth(`/reports/attendance-grid?classId=${selectedClass.id}&date=${newDate}`),
        fetchWithAuth(`/reports/attendance-totals?classId=${selectedClass.id}&date=${newDate}`),
      ]).then(async ([gridRes, totalsRes]) => {
        if (gridRes.ok) setGrid(await gridRes.json());
        if (totalsRes.ok) setTotals(await totalsRes.json());
      }).catch(() => {}).finally(() => setGridLoading(false));
    }
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

  const getStatusLabel = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PRESENT': return 'P';
      case 'ABSENT': return 'A';
      case 'LATE': return 'L';
      case 'PERMISSION': return 'PM';
      default: return '-';
    }
  };

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 100 }} />
    </SafeAreaView>
  );

  if (!selectedClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Student Reports</Text>
        </View>
        <Text style={styles.subtitle}>Select a class to view reports</Text>
        <FlatList
          data={classes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.classCard} onPress={() => loadReport(item)} activeOpacity={0.7}>
              <View style={styles.classIcon}>
                <Ionicons name="bar-chart" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.classInfo}>
                <Text style={styles.className}>{item.name}</Text>
                <Text style={styles.classDetail}>{item._count?.students || 0} students</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { setSelectedClass(null); setGrid([]); setTotals(null); }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{selectedClass.name}</Text>
      </View>

      <View style={styles.dateRow}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.dateText}>{dateStr}</Text>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateBtn}>
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

      {gridLoading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={grid}
          keyExtractor={(item, i) => item.studentId || String(i)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReport(selectedClass).then(() => setRefreshing(false)); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No attendance data for this date</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.studentRow}>
              <Text style={styles.studentNum}>{index + 1}</Text>
              <Text style={styles.studentName} numberOfLines={1}>{item.studentName || item.name || 'Student'}</Text>
              <View style={styles.sessionsRow}>
                {[1, 2, 3, 4].map(s => {
                  const sess = item.sessions?.[s] || item[`s${s}`];
                  const status = sess?.status || sess || '-';
                  return (
                    <View key={s} style={[styles.sessionBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
                      <Text style={[styles.sessionText, { color: getStatusColor(status) }]}>
                        {getStatusLabel(status)}
                      </Text>
                    </View>
                  );
                })}
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
  subtitle: { fontSize: 14, color: COLORS.textSecondary, paddingHorizontal: 20, marginBottom: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  classCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  classIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  classInfo: { flex: 1 },
  className: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  classDetail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 16 },
  dateBtn: { padding: 8, backgroundColor: COLORS.white, borderRadius: 8 },
  dateText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  summaryItem: { flex: 1, backgroundColor: COLORS.white, borderRadius: 10, padding: 10, alignItems: 'center', borderBottomWidth: 3 },
  summaryNum: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  studentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 10, padding: 12, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  studentNum: { width: 24, fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  studentName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text, marginRight: 8 },
  sessionsRow: { flexDirection: 'row', gap: 4 },
  sessionBadge: { width: 30, height: 26, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  sessionText: { fontSize: 11, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
