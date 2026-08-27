import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, SafeAreaView, Platform, RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

export default function ClassesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => { loadClasses(); }, []);

  const loadClasses = async () => {
    try {
      const teacherId = user?.role === 'TEACHER' ? user.id : undefined;
      const url = teacherId ? `/classes?teacherId=${teacherId}` : '/classes';
      const res = await fetchWithAuth(url);
      if (res.ok) setClasses(await res.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  const viewStudents = async (cls: any) => {
    setSelectedClass(cls);
    setStudentsLoading(true);
    try {
      const res = await fetchWithAuth(`/classes/${cls.id}/students`);
      if (res.ok) setStudents(await res.json());
    } catch {} finally { setStudentsLoading(false); }
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
        <Text style={styles.headerTitle}>
          {user?.role === 'TEACHER' ? 'My Classes' : 'Manage Classes'}
        </Text>
        <Text style={styles.countBadge}>{classes.length}</Text>
      </View>

      <FlatList
        data={classes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadClasses(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No classes found</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.classCard} onPress={() => viewStudents(item)} activeOpacity={0.7}>
            <View style={styles.classIcon}>
              <Ionicons name="book" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.classInfo}>
              <Text style={styles.className}>{item.name}</Text>
              {item.subject && <Text style={styles.classSubject}>{item.subject}</Text>}
              {item.teacher && <Text style={styles.classTeacher}>👨‍🏫 {item.teacher.name}</Text>}
            </View>
            <View style={styles.studentCount}>
              <Text style={styles.studentCountNum}>{item._count?.students || 0}</Text>
              <Text style={styles.studentCountLabel}>students</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selectedClass} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setSelectedClass(null); setStudents([]); }}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedClass?.name}</Text>
            <Text style={styles.countBadge}>{students.length}</Text>
          </View>
          {studentsLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={students}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={48} color={COLORS.textLight} />
                  <Text style={styles.emptyText}>No students in this class</Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <View style={styles.studentCard}>
                  <View style={styles.studentNum}>
                    <Text style={styles.studentNumText}>{index + 1}</Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{item.name}</Text>
                    {item.sex && <Text style={styles.studentDetail}>Gender: {item.sex}</Text>}
                    {item.phone && <Text style={styles.studentDetail}>📱 {item.phone}</Text>}
                  </View>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? 40 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, flex: 1 },
  countBadge: { backgroundColor: COLORS.primary, color: COLORS.white, fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, overflow: 'hidden' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  classCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  classIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  classInfo: { flex: 1 },
  className: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  classSubject: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  classTeacher: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  studentCount: { alignItems: 'center', marginRight: 8 },
  studentCountNum: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  studentCountLabel: { fontSize: 10, color: COLORS.textSecondary },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12 },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, flex: 1 },
  studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 10, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  studentNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  studentNumText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  studentDetail: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});
