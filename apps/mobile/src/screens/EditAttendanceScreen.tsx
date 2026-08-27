import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'PERMISSION'];

export default function EditAttendanceScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const isStaff = route?.params?.isStaff || false;
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    if (isStaff) {
      loadStaffRecords();
    } else {
      loadClasses();
    }
  }, []);

  const loadClasses = async () => {
    try {
      const teacherId = user?.role === 'TEACHER' ? user.id : undefined;
      const url = teacherId ? `/classes?teacherId=${teacherId}` : '/classes';
      const res = await fetchWithAuth(url);
      if (res.ok) setClasses(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const loadRecords = async (cls: any) => {
    setSelectedClass(cls);
    setRecordsLoading(true);
    try {
      const res = await fetchWithAuth(`/attendance/records?classId=${cls.id}&date=${dateStr}`);
      if (res.ok) setRecords(await res.json());
    } catch {} finally { setRecordsLoading(false); }
  };

  const loadStaffRecords = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/attendance/staff/records?date=${dateStr}`);
      if (res.ok) setRecords(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const changeDate = (days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    const newDate = d.toISOString().split('T')[0];
    setDateStr(newDate);
    if (isStaff) {
      setLoading(true);
      fetchWithAuth(`/attendance/staff/records?date=${newDate}`)
        .then(async res => { if (res.ok) setRecords(await res.json()); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (selectedClass) {
      setRecordsLoading(true);
      fetchWithAuth(`/attendance/records?classId=${selectedClass.id}&date=${newDate}`)
        .then(async res => { if (res.ok) setRecords(await res.json()); })
        .catch(() => {})
        .finally(() => setRecordsLoading(false));
    }
  };

  const updateStatus = async (record: any, newStatus: string) => {
    const endpoint = isStaff ? '/attendance/staff/update' : '/attendance/update';
    const body = isStaff
      ? { staffAttendanceId: record.id, status: newStatus }
      : { attendanceId: record.id, status: newStatus };

    try {
      const res = await fetchWithAuth(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
      if (res.ok) {
        setRecords(prev => prev.map(r => r.id === record.id ? { ...r, status: newStatus } : r));
      } else {
        Alert.alert('Error', 'Failed to update status');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    }
  };

  const showStatusPicker = (record: any) => {
    Alert.alert(
      'Change Status',
      `${record.student?.name || record.user?.name || 'Record'}`,
      STATUSES.map(status => ({
        text: status,
        onPress: () => updateStatus(record, status),
      })).concat([{ text: 'Cancel', onPress: () => {}, style: 'cancel' } as any]),
    );
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

  if (loading && !isStaff) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!isStaff && !selectedClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Attendance</Text>
        </View>
        <Text style={styles.subtitle}>Select a class</Text>
        <FlatList
          data={classes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.classCard} onPress={() => loadRecords(item)} activeOpacity={0.7}>
              <View style={styles.classIcon}>
                <Ionicons name="create" size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
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
        <TouchableOpacity onPress={() => {
          if (isStaff) navigation.goBack();
          else { setSelectedClass(null); setRecords([]); }
        }} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isStaff ? 'Edit Officer Attendance' : selectedClass?.name}
        </Text>
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

      <Text style={styles.hint}>Tap a status badge to change it</Text>

      {(recordsLoading || loading) ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No attendance records for this date</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.recordRow}>
              <Text style={styles.recordNum}>{index + 1}</Text>
              <Text style={styles.recordName} numberOfLines={1}>
                {item.student?.name || item.user?.name || 'Unknown'}
              </Text>
              <TouchableOpacity
                style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
                onPress={() => showStatusPicker(item)}
              >
                <Text style={styles.statusText}>{item.status}</Text>
                <Ionicons name="pencil" size={12} color={COLORS.white} />
              </TouchableOpacity>
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
  hint: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: 20, marginBottom: 8, fontStyle: 'italic' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 16 },
  dateBtn: { padding: 8, backgroundColor: COLORS.white, borderRadius: 8 },
  dateText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  classCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  classIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  className: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  classDetail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  recordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 10, padding: 12, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  recordNum: { width: 28, fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  recordName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text, marginRight: 8 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 4 },
  statusText: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
