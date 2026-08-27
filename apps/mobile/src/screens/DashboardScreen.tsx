import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Dimensions,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { fetchWithAuth } from '../api';
import { COLORS } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 20;
const CARD_GAP = 10;
const NUM_COLS = 4;
const CARD_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - CARD_GAP * (NUM_COLS + 1)) / NUM_COLS;

interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  navigateTo?: string;
  params?: any;
}

const adminActions: QuickAction[] = [
  { label: 'Search', icon: 'search-outline', navigateTo: 'Search' },
  { label: 'Manage\nUsers', icon: 'people-outline', navigateTo: 'Users', params: { userType: 'users' } },
  { label: 'Manage\nOfficer', icon: 'briefcase-outline', navigateTo: 'Users', params: { userType: 'officers' } },
  { label: 'Manage\nClasses', icon: 'book-outline', navigateTo: 'Classes' },
  { label: 'Take\nAttendance', icon: 'camera-outline', navigateTo: 'Scanner', params: { scanMode: 'student' } },
  { label: 'Officer\nAttendance', icon: 'scan-outline', navigateTo: 'StaffAttendance' },
  { label: 'Edit\nAttendance', icon: 'create-outline', navigateTo: 'EditAttendance' },
  { label: 'Edit Officer\nAttendance', icon: 'document-text-outline', navigateTo: 'EditAttendance', params: { isStaff: true } },
  { label: 'Student\nReport', icon: 'bar-chart-outline', navigateTo: 'Reports' },
  { label: 'Officer\nReport', icon: 'analytics-outline', navigateTo: 'StaffReports' },
  { label: 'Card\nDesigner', icon: 'card-outline' },
  { label: 'ID Card', icon: 'reader-outline' },
  { label: 'Session\nSettings', icon: 'time-outline', navigateTo: 'SessionSettings' },
  { label: 'Holidays', icon: 'calendar-outline', navigateTo: 'Holidays' },
  { label: 'Settings', icon: 'settings-outline', navigateTo: 'Settings' },
];

const teacherActions: QuickAction[] = [
  { label: 'Search', icon: 'search-outline', navigateTo: 'Search' },
  { label: 'My Classes', icon: 'book-outline', navigateTo: 'Classes' },
  { label: 'Take\nAttendance', icon: 'camera-outline', navigateTo: 'Scanner', params: { scanMode: 'student' } },
  { label: 'Scan\nAttendance', icon: 'scan-outline', navigateTo: 'Scanner', params: { scanMode: 'self' } },
  { label: 'Student\nReport', icon: 'bar-chart-outline', navigateTo: 'Reports' },
  { label: 'My Reports', icon: 'analytics-outline', navigateTo: 'MyReports' },
  { label: 'Settings', icon: 'settings-outline', navigateTo: 'Settings' },
];

const employeeActions: QuickAction[] = [
  { label: 'Scan\nAttendance', icon: 'camera-outline', navigateTo: 'Scanner', params: { scanMode: 'self' } },
  { label: 'My Reports', icon: 'bar-chart-outline', navigateTo: 'MyReports' },
  { label: 'My ID Card', icon: 'card-outline' },
  { label: 'Settings', icon: 'settings-outline', navigateTo: 'Settings' },
];

const studentActions: QuickAction[] = [
  { label: 'My\nAttendance', icon: 'calendar-outline', navigateTo: 'MyReports' },
  { label: 'Settings', icon: 'settings-outline', navigateTo: 'Settings' },
];

interface SystemStatus {
  lastUpdated: string | null;
  totalStudents: number;
  totalClasses: number;
  totalUsers: number;
}

type TabName = 'home' | 'search' | 'profile' | 'camera' | 'settings';

interface BottomTab {
  name: TabName;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

const adminTabs: BottomTab[] = [
  { name: 'home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'search', icon: 'search-outline', activeIcon: 'search' },
  { name: 'profile', icon: 'person-outline', activeIcon: 'person' },
  { name: 'camera', icon: 'camera-outline', activeIcon: 'camera' },
  { name: 'settings', icon: 'settings-outline', activeIcon: 'settings' },
];

const simpleTabs: BottomTab[] = [
  { name: 'home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'profile', icon: 'person-outline', activeIcon: 'person' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m Ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h Ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d Ago`;
}

function formatCambodiaTime(iso: string): string {
  const d = new Date(iso);
  const cambodia = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const date = cambodia.toISOString().split('T')[0];
  const time = cambodia.toISOString().slice(11, 16);
  return `${date} ${time} (GMT+7)`;
}

export default function DashboardScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [refreshing, setRefreshing] = useState(false);

  const role = user?.role || 'TEACHER';
  const isAdmin = role === 'ADMIN';
  const isTeacher = role === 'TEACHER';
  const isStudent = role === 'STUDENT';
  // All other roles (OFFICER, STAFF, SECURITY_GUARD, etc.) are treated as employees
  const quickActions = isAdmin ? adminActions : isTeacher ? teacherActions : isStudent ? studentActions : employeeActions;
  const tabs = isAdmin ? adminTabs : simpleTabs;

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/reports/system-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const handleAction = (action: QuickAction) => {
    if (action.navigateTo) {
      navigation.navigate(action.navigateTo, action.params || {});
    } else {
      Alert.alert(action.label.replace('\n', ' '), 'This feature is coming soon.');
    }
  };

  const handleTabPress = (tab: TabName) => {
    if (tab === 'camera') {
      navigation.navigate('Scanner', { scanMode: 'student' });
      return;
    }
    if (tab === 'search') {
      navigation.navigate('Search');
      return;
    }
    if (tab === 'settings') {
      navigation.navigate('Settings');
      return;
    }
    setActiveTab(tab);
  };

  // Profile view
  if (activeTab === 'profile') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.profileContainer}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.profileName}>{user?.name || 'User'}</Text>
          <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          <View style={styles.profileBadge}>
            <Text style={styles.profileRole}>{role}</Text>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={signOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={COLORS.white} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Tabs */}
        <View style={styles.bottomBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.name}
              style={[styles.tabItem, activeTab === tab.name && styles.tabItemActive]}
              onPress={() => handleTabPress(tab.name)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={activeTab === tab.name ? tab.activeIcon : tab.icon}
                size={24}
                color={activeTab === tab.name ? COLORS.white : COLORS.text}
              />
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // Dashboard view (home)
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeTitle}>Hi, Welcome Back</Text>
            <Text style={styles.greeting}>{getGreeting()}</Text>
          </View>
          <TouchableOpacity style={styles.notifButton}>
            <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* System Status */}
        {status && (
          <View style={styles.statusBar}>
            <View style={styles.statusLeft}>
              <View style={styles.statusOnline}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                <Text style={styles.statusOnlineText}> System Online</Text>
              </View>
              {status.lastUpdated && (
                <Text style={styles.statusUpdated}>
                  Last Updated: {timeAgo(status.lastUpdated)}
                  {'\n'}
                  <Text style={styles.statusTime}>({formatCambodiaTime(status.lastUpdated)})</Text>
                </Text>
              )}
            </View>
            <View style={styles.statusRight}>
              <View style={styles.statusTotal}>
                <Ionicons name="albums-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.statusTotalLabel}> Total</Text>
              </View>
              {role === 'ADMIN' && (
                <Text style={styles.statusItem}>
                  👥 <Text style={styles.statusValue}>{status.totalUsers}</Text> Users
                </Text>
              )}
              <Text style={styles.statusItem}>
                🎓 <Text style={styles.statusValue}>{status.totalStudents}</Text> Students
              </Text>
              <Text style={styles.statusItem}>
                📖 <Text style={styles.statusValue}>{status.totalClasses}</Text> Classes
              </Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <View style={styles.quickActionsContainer}>
          <View style={styles.grid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.actionCard}
                onPress={() => handleAction(action)}
                activeOpacity={0.7}
              >
                <Ionicons name={action.icon} size={28} color={COLORS.iconColor} />
                <Text style={styles.actionLabel} numberOfLines={2}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={styles.bottomBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.name}
            style={[styles.tabItem, activeTab === tab.name && styles.tabItemActive]}
            onPress={() => handleTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={activeTab === tab.name ? tab.activeIcon : tab.icon}
              size={24}
              color={activeTab === tab.name ? COLORS.white : COLORS.text}
            />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    paddingBottom: 16,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notifButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statusLeft: {
    flex: 1,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: COLORS.inputBorder,
  },
  statusOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  statusOnlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusUpdated: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  statusTime: {
    fontSize: 9,
    color: COLORS.textLight,
  },
  statusRight: {
    flex: 1,
    paddingLeft: 12,
  },
  statusTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusTotalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  statusItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  statusValue: {
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Quick Actions
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  quickActionsContainer: {
    marginHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: GRID_PADDING - 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  actionCard: {
    width: CARD_SIZE,
    height: CARD_SIZE + 10,
    borderWidth: 1.5,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    margin: CARD_GAP / 2,
    backgroundColor: COLORS.white,
    paddingHorizontal: 2,
  },
  actionLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
    lineHeight: 11,
  },

  // Bottom Tab Bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 201, 167, 0.08)',
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    borderTopWidth: 0,
  },
  tabItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: COLORS.primary,
  },

  // Profile View
  profileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  profileAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  profileBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 40,
  },
  profileRole: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoutText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
