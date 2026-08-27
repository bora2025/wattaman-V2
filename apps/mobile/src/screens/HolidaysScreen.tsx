import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { COLORS } from '../theme';

export default function HolidaysScreen({ navigation }: any) {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => { loadHolidays(); }, [selectedYear]);

  const loadHolidays = async () => {
    try {
      const res = await fetchWithAuth(`/holidays?year=${selectedYear}`);
      if (res.ok) {
        const data = await res.json();
        data.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setHolidays(data);
      }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { day: d.getDate(), month: months[d.getMonth()], weekday: days[d.getDay()] };
  };

  const isUpcoming = (iso: string) => new Date(iso) >= new Date(new Date().toISOString().split('T')[0]);

  const getTypeColor = (type?: string) => {
    switch (type?.toUpperCase()) {
      case 'PUBLIC': return '#EF4444';
      case 'SCHOOL': return '#3B82F6';
      case 'RELIGIOUS': return '#8B5CF6';
      default: return '#F59E0B';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Holidays</Text>
        <Text style={styles.countBadge}>{holidays.length}</Text>
      </View>

      <View style={styles.yearRow}>
        <TouchableOpacity onPress={() => setSelectedYear(y => y - 1)} style={styles.yearBtn}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.yearText}>{selectedYear}</Text>
        <TouchableOpacity onPress={() => setSelectedYear(y => y + 1)} style={styles.yearBtn}>
          <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={holidays}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadHolidays(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No holidays for {selectedYear}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const { day, month, weekday } = formatDate(item.date);
            const upcoming = isUpcoming(item.date);
            return (
              <View style={[styles.holidayCard, !upcoming && styles.pastCard]}>
                <View style={[styles.dateBox, { backgroundColor: upcoming ? COLORS.primary : COLORS.textLight }]}>
                  <Text style={styles.dateDay}>{day}</Text>
                  <Text style={styles.dateMonth}>{month}</Text>
                  <Text style={styles.dateWeekday}>{weekday}</Text>
                </View>
                <View style={styles.holidayInfo}>
                  <Text style={[styles.holidayName, !upcoming && styles.pastText]}>{item.name}</Text>
                  {item.description && <Text style={styles.holidayDesc} numberOfLines={2}>{item.description}</Text>}
                  {item.type && (
                    <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) + '20' }]}>
                      <Text style={[styles.typeText, { color: getTypeColor(item.type) }]}>{item.type}</Text>
                    </View>
                  )}
                </View>
                {upcoming && <View style={styles.upcomingDot} />}
              </View>
            );
          }}
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
  countBadge: { backgroundColor: COLORS.primary, color: COLORS.white, fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 20 },
  yearBtn: { padding: 8, backgroundColor: COLORS.white, borderRadius: 8 },
  yearText: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  holidayCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  pastCard: { opacity: 0.6 },
  dateBox: { width: 56, height: 66, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  dateDay: { fontSize: 22, fontWeight: '700', color: COLORS.white },
  dateMonth: { fontSize: 12, fontWeight: '600', color: COLORS.white },
  dateWeekday: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  holidayInfo: { flex: 1 },
  holidayName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  pastText: { color: COLORS.textSecondary },
  holidayDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  typeText: { fontSize: 10, fontWeight: '700' },
  upcomingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
});
