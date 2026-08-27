import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { fetchWithAuth } from '../api';
import { useAuth } from '../AuthContext';
import { COLORS } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.65;

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  photo?: string | null;
}

interface StaffRecord {
  id: string;
  userId: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  session: number;
}

interface SessionConfig {
  session: number;
  type: string;
  startTime: string;
  endTime: string;
}

const SESSION_NAMES: Record<number, string> = {
  1: 'Morning 1',
  2: 'Morning 2',
  3: 'Afternoon 1',
  4: 'Afternoon 2',
};

export default function StaffAttendanceScreen({ navigation }: any) {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  // Data state
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [todayRecords, setTodayRecords] = useState<StaffRecord[]>([]);
  const [sessionConfigs, setSessionConfigs] = useState<SessionConfig[]>([]);
  const [currentSession, setCurrentSession] = useState<number>(1);
  const [scanMode, setScanMode] = useState<'check-in' | 'check-out'>('check-in');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Location state
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied' | 'unavailable'>('pending');
  const locationRef = useRef<{ latitude: number; longitude: number; locationName?: string } | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(true);
  const processingRef = useRef(false);

  // Popup state
  const [lastScanned, setLastScanned] = useState<{
    name: string;
    role?: string;
    action?: string;
    department?: string;
    status: 'success' | 'error';
    message?: string;
  } | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const popupAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const successSoundRef = useRef<Audio.Sound | null>(null);

  // ─── Init ───
  useEffect(() => {
    loadAllData();
    loadSounds();
    requestLocationPermission();
    return () => {
      successSoundRef.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (!cameraActive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [cameraActive]);

  const loadSounds = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3' },
        { shouldPlay: false }
      );
      successSoundRef.current = sound;
    } catch {}
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationStatus('granted');
        updateLocation();
      } else {
        setLocationStatus('denied');
      }
    } catch {
      setLocationStatus('unavailable');
    }
  };

  const updateLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      locationRef.current = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      // Reverse geocode
      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addr) {
          const parts = [addr.street, addr.city, addr.district].filter(Boolean);
          locationRef.current = {
            ...locationRef.current!,
            locationName: parts.join(', ') || undefined,
          };
        }
      } catch {}
    } catch {
      locationRef.current = null;
    }
  };

  // ─── Data loading ───
  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadStaff(), loadTodayRecords(), loadSessionConfigs()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStaff(), loadTodayRecords()]);
    setRefreshing(false);
  };

  const loadStaff = async () => {
    try {
      const res = await fetchWithAuth('/auth/users?roles=TEACHER,ADMIN');
      if (res.ok) setStaffList(await res.json());
    } catch (err) {
      console.error('Failed to load staff:', err);
    }
  };

  const loadTodayRecords = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetchWithAuth(`/reports/staff-attendance-grid?date=${today}`);
      if (res.ok) setTodayRecords(await res.json());
    } catch (err) {
      console.error('Failed to load today records:', err);
    }
  };

  const loadSessionConfigs = async () => {
    try {
      const res = await fetchWithAuth('/session-config/staff');
      if (res.ok) {
        const data: SessionConfig[] = await res.json();
        setSessionConfigs(data);
        autoDetectSession(data);
      }
    } catch (err) {
      console.error('Failed to load session configs:', err);
    }
  };

  const autoDetectSession = (configs: SessionConfig[]) => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Find current session
    let matched: SessionConfig | null = null;
    for (const cfg of configs) {
      if (hhmm >= cfg.startTime && hhmm <= cfg.endTime) {
        matched = cfg;
        break;
      }
    }

    if (!matched) {
      // Pick most recently ended session
      const past = configs.filter(c => c.endTime < hhmm).sort((a, b) => b.endTime.localeCompare(a.endTime));
      if (past.length > 0) {
        matched = past[0];
      } else {
        // Before any session → pick first upcoming
        const upcoming = configs.filter(c => c.startTime > hhmm).sort((a, b) => a.startTime.localeCompare(b.startTime));
        matched = upcoming[0] || configs[configs.length - 1] || null;
      }
    }

    if (matched) {
      setCurrentSession(matched.session);
      setScanMode(matched.type === 'CHECK_OUT' ? 'check-out' : 'check-in');
    }
  };

  // ─── Helpers ───
  const playSuccess = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (successSoundRef.current) {
        await successSoundRef.current.setPositionAsync(0);
        await successSoundRef.current.playAsync();
      }
    } catch {}
  };

  const playError = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  };

  const getStaffRecord = (userId: string) =>
    todayRecords.find(r => r.userId === userId && r.session === currentSession);

  const checkedInCount = todayRecords.filter(
    r => r.session === currentSession && (r.status === 'PRESENT' || r.status === 'LATE')
  ).length;
  const totalStaff = staffList.length;
  const progressPct = totalStaff > 0 ? (checkedInCount / totalStaff) * 100 : 0;

  const currentConfig = sessionConfigs.find(c => c.session === currentSession);

  // ─── Popup ───
  const showResultPopup = (result: typeof lastScanned) => {
    setLastScanned(result);
    setShowPopup(true);
    popupAnim.setValue(0);
    Animated.sequence([
      Animated.spring(popupAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.delay(2500),
      Animated.timing(popupAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setShowPopup(false);
      processingRef.current = false;
      setScanning(true);
    });
  };

  // ─── QR handler ───
  const handleQrScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setScanning(false);

      let staffId: string | null = null;
      try {
        const parsed = JSON.parse(data);
        if (parsed.staffId) staffId = parsed.staffId;
        else if (parsed.userId) staffId = parsed.userId;
      } catch {}

      if (!staffId) {
        await playError();
        showResultPopup({ name: 'Not a staff QR code', status: 'error' });
        return;
      }

      // Update location before scanning
      if (locationStatus === 'granted') {
        await updateLocation();
      }

      const loc = locationRef.current;
      try {
        const res = await fetchWithAuth('/attendance/staff/auto-scan', {
          method: 'POST',
          body: JSON.stringify({
            userId: staffId,
            ...(loc
              ? {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  location: loc.locationName || undefined,
                }
              : {}),
          }),
        });
        const result = await res.json();
        if (res.ok) {
          await playSuccess();
          // Refresh records in background
          loadTodayRecords();
          showResultPopup({
            name: result.userName || 'Staff Member',
            role: result.userRole,
            action: result.action,
            department: result.userDepartment,
            status: 'success',
          });
        } else {
          await playError();
          showResultPopup({
            name: result.message || 'Attendance failed',
            status: 'error',
          });
        }
      } catch {
        await playError();
        showResultPopup({ name: 'Network error', status: 'error' });
      }
    },
    [locationStatus]
  );

  // ─── Open camera ───
  const startScanning = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
    processingRef.current = false;
    setCameraActive(true);
  };

  // ─── CAMERA MODE ───
  if (cameraActive) {
    const scanLineTranslate = scanLineAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SCAN_AREA_SIZE - 4],
    });

    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? handleQrScanned : undefined}
        />

        <View style={styles.overlay}>
          {/* Top bar with session info */}
          <View style={styles.camTopBar}>
            <TouchableOpacity
              onPress={() => {
                setCameraActive(false);
                loadTodayRecords();
              }}
              style={styles.camCloseBtn}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={styles.camSessionInfo}>
              <View
                style={[
                  styles.camModeBadge,
                  { backgroundColor: scanMode === 'check-in' ? COLORS.primary : '#3B82F6' },
                ]}
              >
                <Text style={styles.camModeBadgeText}>
                  {scanMode === 'check-in' ? '📥 Check-In' : '📤 Check-Out'}
                </Text>
              </View>
              <Text style={styles.camSessionText}>
                {SESSION_NAMES[currentSession] || `Session ${currentSession}`}
                {currentConfig ? ` · ${currentConfig.startTime}–${currentConfig.endTime}` : ''}
              </Text>
            </View>

            <View style={styles.camProgress}>
              <Text style={styles.camProgressText}>
                {checkedInCount}/{totalStaff}
              </Text>
            </View>
          </View>

          {/* Session schedule cards */}
          {sessionConfigs.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.camSessionCards}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            >
              {sessionConfigs.map(cfg => {
                const isActive = cfg.session === currentSession;
                const now = new Date();
                const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const isCurrent = hhmm >= cfg.startTime && hhmm <= cfg.endTime;
                return (
                  <View
                    key={cfg.session}
                    style={[
                      styles.camSessionCard,
                      isActive && styles.camSessionCardActive,
                    ]}
                  >
                    {isCurrent && <View style={styles.liveDot} />}
                    <Text style={styles.camSessionCardLabel}>
                      {SESSION_NAMES[cfg.session]}
                    </Text>
                    <Text
                      style={[
                        styles.camSessionCardType,
                        { color: cfg.type === 'CHECK_IN' ? '#6EE7B7' : '#93C5FD' },
                      ]}
                    >
                      {cfg.type === 'CHECK_IN' ? '📥 In' : '📤 Out'}
                    </Text>
                    <Text style={styles.camSessionCardTime}>
                      {cfg.startTime}–{cfg.endTime}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Scan area */}
          <View style={styles.scanAreaWrapper}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View
                style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]}
              />
            </View>
            <Text style={styles.scanHint}>Point camera at staff QR code</Text>
          </View>

          {/* Bottom progress bar */}
          <View style={styles.camBottomBar}>
            <View style={styles.camBottomRow}>
              <View style={styles.camScanIndicator}>
                <View style={styles.pulseDot} />
                <Text style={styles.camScanText}>Scanning for staff QR...</Text>
              </View>
              <View style={styles.camCountRow}>
                <View style={styles.camCountBadge}>
                  <Text style={styles.camCountText}>{checkedInCount} ✓</Text>
                </View>
                <View style={[styles.camCountBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Text style={styles.camCountText}>{totalStaff} total</Text>
                </View>
              </View>
            </View>
            <View style={styles.camProgressBarBg}>
              <View style={[styles.camProgressBarFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
        </View>

        {/* Scan result popup */}
        {showPopup && lastScanned && (
          <Animated.View
            style={[
              styles.popup,
              {
                opacity: popupAnim,
                transform: [
                  {
                    scale: popupAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
              },
              lastScanned.status === 'error' ? styles.popupError : styles.popupSuccess,
            ]}
          >
            <View
              style={[
                styles.popupIcon,
                lastScanned.status === 'error' ? styles.popupIconError : styles.popupIconSuccess,
              ]}
            >
              <Text style={styles.popupIconText}>
                {lastScanned.status === 'error' ? '✗' : '✓'}
              </Text>
            </View>
            <Text style={styles.popupName}>{lastScanned.name}</Text>
            {lastScanned.status === 'success' && (
              <>
                <Text style={styles.popupAction}>
                  {lastScanned.action === 'CHECK_IN' ? '✅ Checked In' : '👋 Checked Out'}
                </Text>
                {lastScanned.role && (
                  <Text style={styles.popupRole}>{lastScanned.role}</Text>
                )}
                {lastScanned.department && (
                  <Text style={styles.popupDept}>{lastScanned.department}</Text>
                )}
              </>
            )}
            {lastScanned.status === 'error' && (
              <Text style={styles.popupAction}>❌ Error</Text>
            )}
          </Animated.View>
        )}
      </View>
    );
  }

  // ─── LANDING PAGE ───
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading staff data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Officer Attendance</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressLabel}>
            {scanMode === 'check-in' ? '📥 Check-In' : '📤 Check-Out'} · {SESSION_NAMES[currentSession]}
          </Text>
          <Text style={styles.progressCount}>
            {checkedInCount}/{totalStaff} checked in
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Session schedule */}
        {sessionConfigs.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>⏰ Session Schedule</Text>
            <View style={styles.sessionGrid}>
              {sessionConfigs.map(cfg => {
                const isActive = cfg.session === currentSession;
                const now = new Date();
                const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const isCurrent = hhmm >= cfg.startTime && hhmm <= cfg.endTime;
                return (
                  <View
                    key={cfg.session}
                    style={[
                      styles.sessionCard,
                      isActive && styles.sessionCardActive,
                    ]}
                  >
                    {isCurrent && <View style={styles.sessionLiveDot} />}
                    <Text style={styles.sessionCardName}>
                      {SESSION_NAMES[cfg.session]}
                    </Text>
                    <Text
                      style={[
                        styles.sessionCardType,
                        { color: cfg.type === 'CHECK_IN' ? COLORS.success : '#3B82F6' },
                      ]}
                    >
                      {cfg.type === 'CHECK_IN' ? '📥 Check-In' : '📤 Check-Out'}
                    </Text>
                    <Text style={styles.sessionCardTime}>
                      {cfg.startTime} – {cfg.endTime}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Location status */}
        <View
          style={[
            styles.locationCard,
            locationStatus === 'granted'
              ? styles.locationGranted
              : locationStatus === 'denied'
                ? styles.locationDenied
                : styles.locationPending,
          ]}
        >
          <Ionicons
            name={locationStatus === 'granted' ? 'location' : 'location-outline'}
            size={18}
            color={
              locationStatus === 'granted'
                ? COLORS.success
                : locationStatus === 'denied'
                  ? COLORS.error
                  : COLORS.textSecondary
            }
          />
          <Text style={styles.locationText}>
            {locationStatus === 'granted'
              ? `Location active${locationRef.current?.locationName ? ` · ${locationRef.current.locationName}` : ''}`
              : locationStatus === 'denied'
                ? 'Location denied — tap to retry'
                : locationStatus === 'unavailable'
                  ? 'Location unavailable'
                  : 'Requesting location...'}
          </Text>
          {locationStatus === 'denied' && (
            <TouchableOpacity onPress={requestLocationPermission}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Scan button */}
        <TouchableOpacity style={styles.scanButton} onPress={startScanning} activeOpacity={0.8}>
          <Ionicons name="camera" size={24} color={COLORS.white} />
          <Text style={styles.scanButtonText}>Scan Staff QR</Text>
        </TouchableOpacity>

        {/* Staff roster */}
        <View style={styles.rosterSection}>
          <View style={styles.rosterHeader}>
            <Text style={styles.rosterTitle}>Staff Roster</Text>
            <Text style={styles.rosterCount}>
              {checkedInCount}/{totalStaff} checked in
            </Text>
          </View>

          {staffList.length === 0 ? (
            <Text style={styles.emptyText}>No staff members found</Text>
          ) : (
            staffList.map(staff => {
              const record = getStaffRecord(staff.id);
              const status = record?.status || 'NOT_RECORDED';

              return (
                <View
                  key={staff.id}
                  style={[
                    styles.staffCard,
                    status === 'PRESENT' && styles.staffCardPresent,
                    status === 'LATE' && styles.staffCardLate,
                  ]}
                >
                  <View
                    style={[
                      styles.staffAvatar,
                      status === 'PRESENT' && styles.staffAvatarPresent,
                      status === 'LATE' && styles.staffAvatarLate,
                    ]}
                  >
                    <Text style={styles.staffAvatarText}>
                      {staff.name?.charAt(0)?.toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={styles.staffInfo}>
                    <Text style={styles.staffName} numberOfLines={1}>
                      {staff.name}
                    </Text>
                    <Text style={styles.staffMeta} numberOfLines={1}>
                      {staff.role === 'ADMIN' ? '🛡️' : '👨‍🏫'} {staff.role} · {staff.email}
                    </Text>
                    {record && (
                      <View style={styles.staffTimes}>
                        {record.checkInTime && (
                          <Text style={styles.staffTimeText}>
                            📥 {new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                        {record.checkOutTime && (
                          <Text style={styles.staffTimeText}>
                            📤 {new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      status === 'PRESENT' && styles.statusPresent,
                      status === 'LATE' && styles.statusLate,
                      status === 'NOT_RECORDED' && styles.statusNone,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        status === 'PRESENT' && { color: '#065F46' },
                        status === 'LATE' && { color: '#92400E' },
                        status === 'NOT_RECORDED' && { color: COLORS.textSecondary },
                      ]}
                    >
                      {status === 'PRESENT'
                        ? 'Present'
                        : status === 'LATE'
                          ? 'Late'
                          : '—'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  // Progress
  progressSection: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  progressCount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(0,201,167,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Session schedule
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  sessionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionCard: {
    width: '48%',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    position: 'relative',
  },
  sessionCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 2,
  },
  sessionLiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  sessionCardName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  sessionCardType: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  sessionCardTime: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  // Location
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  locationGranted: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  locationDenied: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  locationPending: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  // Scan button
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 20,
    gap: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanButtonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  // Staff roster
  rosterSection: {
    marginBottom: 16,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rosterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  rosterCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 40,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  staffCardPresent: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  staffCardLate: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  staffAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  staffAvatarPresent: {
    backgroundColor: '#D1FAE5',
    borderWidth: 2,
    borderColor: '#6EE7B7',
  },
  staffAvatarLate: {
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#FCD34D',
  },
  staffAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  staffInfo: {
    flex: 1,
    marginRight: 8,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  staffMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  staffTimes: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 3,
  },
  staffTimeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPresent: {
    backgroundColor: '#D1FAE5',
  },
  statusLate: {
    backgroundColor: '#FEF3C7',
  },
  statusNone: {
    backgroundColor: '#F1F5F9',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // ─── Camera styles ───
  scannerContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  camTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 10,
  },
  camCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camSessionInfo: {
    flex: 1,
  },
  camModeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 2,
  },
  camModeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  camSessionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  camProgress: {
    backgroundColor: 'rgba(0,201,167,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  camProgressText: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '700',
  },
  // Camera session cards
  camSessionCards: {
    maxHeight: 70,
    paddingVertical: 6,
  },
  camSessionCard: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  camSessionCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0,201,167,0.2)',
  },
  liveDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6EE7B7',
  },
  camSessionCardLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  camSessionCardType: {
    fontSize: 11,
    fontWeight: '700',
  },
  camSessionCardTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  // Scan area
  scanAreaWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: COLORS.primary,
    borderWidth: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  // Camera bottom bar
  camBottomBar: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  camBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  camScanIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  camScanText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  camCountRow: {
    flexDirection: 'row',
    gap: 6,
  },
  camCountBadge: {
    backgroundColor: 'rgba(0,201,167,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  camCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  camProgressBarBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  camProgressBarFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  // Popup
  popup: {
    position: 'absolute',
    top: '35%',
    left: 30,
    right: 30,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  popupSuccess: {
    backgroundColor: '#1b5e20',
  },
  popupError: {
    backgroundColor: '#b71c1c',
  },
  popupIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  popupIconSuccess: {
    backgroundColor: '#00c853',
  },
  popupIconError: {
    backgroundColor: '#ff5252',
  },
  popupIconText: {
    fontSize: 30,
    color: '#fff',
    fontWeight: 'bold',
  },
  popupName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  popupAction: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  popupRole: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  popupDept: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
});
