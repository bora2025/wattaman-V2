import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
  Platform,
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
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

type ScanMode = 'student' | 'self';

interface ScanResult {
  id: string;
  name: string;
  photo?: string;
  status: string;
  role?: string;
  action?: string;
}

export default function ScannerScreen({ navigation, route }: any) {
  const { user, signOut } = useAuth();
  const scanMode: ScanMode = route?.params?.scanMode || 'student';
  const [permission, requestPermission] = useCameraPermissions();
  // Student mode state
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [mode, setMode] = useState<'check-in' | 'check-out'>('check-in');
  const [session, setSession] = useState(1);
  const [scannedStudents, setScannedStudents] = useState<Map<string, ScanResult>>(new Map());
  // Shared state
  const [lastScanned, setLastScanned] = useState<ScanResult | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [scanning, setScanning] = useState(true);
  const popupAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const processingRef = useRef(false);
  const successSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (scanMode === 'student') loadClasses();
    loadSounds();
    return () => { successSoundRef.current?.unloadAsync(); };
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const loadSounds = async () => {
    try {
      const { sound: success } = await Audio.Sound.createAsync(
        { uri: 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3' },
        { shouldPlay: false }
      );
      successSoundRef.current = success;
    } catch {}
  };

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
    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
  };

  // ─── Student mode helpers ───
  const loadClasses = async () => {
    try {
      const teacherId = user.role === 'TEACHER' ? user.id : undefined;
      const url = teacherId ? `/classes?teacherId=${teacherId}` : '/classes';
      const res = await fetchWithAuth(url);
      if (res.ok) setClasses(await res.json());
    } catch (err) {
      console.error('Failed to load classes', err);
    }
  };

  const selectClass = async (cls: any) => {
    setSelectedClass(cls);
    setScannedStudents(new Map());
    try {
      const res = await fetchWithAuth(`/classes/${cls.id}/students`);
      if (res.ok) setStudents(await res.json());
    } catch (err) {
      console.error('Failed to load students', err);
    }
  };

  const showResultPopup = (result: ScanResult, autoGoBack = false) => {
    setLastScanned(result);
    setShowPopup(true);
    popupAnim.setValue(0);
    Animated.sequence([
      Animated.spring(popupAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.delay(autoGoBack ? 3000 : 2000),
      Animated.timing(popupAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setShowPopup(false);
      processingRef.current = false;
      if (autoGoBack) navigation.goBack();
    });
  };

  // ─── Employee self-scan (QR triggers attendance with GPS) ───
  const locationRef = useRef<{ latitude: number; longitude: number; locationName?: string } | null>(null);

  useEffect(() => {
    if (scanMode === 'self') {
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            locationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            try {
              const [addr] = await Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude, longitude: loc.coords.longitude,
              });
              if (addr) {
                const parts = [addr.street, addr.city, addr.district].filter(Boolean);
                if (parts.length) locationRef.current = { ...locationRef.current!, locationName: parts.join(', ') };
              }
            } catch {}
          }
        } catch {}
      })();
    }
  }, [scanMode]);

  const handleSelfScan = useCallback(async ({ data }: { data: string }) => {
    if (processingRef.current) return;
    processingRef.current = true;

    // Update GPS before submitting
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      locationRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, locationName: locationRef.current?.locationName };
    } catch {}

    const loc = locationRef.current;
    try {
      const res = await fetchWithAuth('/attendance/employee/self-scan', {
        method: 'POST',
        body: JSON.stringify({
          qrData: data,
          ...(loc ? {
            latitude: loc.latitude,
            longitude: loc.longitude,
            location: loc.locationName || `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`,
          } : {}),
        }),
      });
      const result = await res.json();
      if (res.ok) {
        await playSuccess();
        showResultPopup({
          id: user.id,
          name: result.userName || user.name || 'You',
          status: result.action === 'CHECK_OUT' ? 'checked-out' : 'present',
          action: result.action,
          role: result.userRole,
        }, true);
      } else {
        await playError();
        showResultPopup({ id: '', name: result.message || 'Scan failed', status: 'error' });
      }
    } catch {
      await playError();
      showResultPopup({ id: '', name: 'Network error', status: 'error' });
    }
  }, [user]);

  // ─── Student mode QR handler ───
  const handleStudentScan = useCallback(
    async ({ data }: { data: string }) => {
      if (processingRef.current || !selectedClass) return;
      processingRef.current = true;

      let studentId = data;
      let qrWasJson = false;
      try {
        const parsed = JSON.parse(data);
        qrWasJson = parsed !== null && typeof parsed === 'object';
        if (parsed.studentId) studentId = parsed.studentId;
      } catch {}

      // Priority-ordered matching: primary IDs first, then legacy qrCode field as fallback.
      // An exact Student.id / User.id match always wins over a stale qrCode collision (which
      // previously could cause Student A's scan to surface Student B), while still allowing
      // legacy printed cards whose QR encodes the qrCode field to scan.
      const student =
        students.find((s: any) => s.id === studentId) ||
        students.find((s: any) => s.userId === studentId) ||
        (qrWasJson
          ? students.find((s: any) => !!s.qrCode && s.qrCode === studentId)
          : students.find((s: any) => !!s.qrCode && (s.qrCode === studentId || s.qrCode === data)));

      if (!student) {
        await playError();
        showResultPopup({ id: '', name: 'Unknown Student', status: 'error' });
        return;
      }

      if (scannedStudents.has(student.id)) {
        await playError();
        showResultPopup({ id: student.id, name: student.name, status: 'duplicate' });
        return;
      }

      if (mode === 'check-out') {
        try {
          const res = await fetchWithAuth('/attendance/check-out', {
            method: 'POST',
            body: JSON.stringify({ studentId: student.id, classId: selectedClass.id, session }),
          });
          if (res.ok) {
            await playSuccess();
            const updated = new Map(scannedStudents);
            updated.set(student.id, { id: student.id, name: student.name, status: 'checked-out' });
            setScannedStudents(updated);
            showResultPopup({ id: student.id, name: student.name, photo: student.photo, status: 'checked-out' });
          } else {
            await playError();
            showResultPopup({ id: student.id, name: student.name, status: 'error' });
          }
        } catch {
          await playError();
          showResultPopup({ id: student.id, name: student.name, status: 'error' });
        }
      } else {
        try {
          const now = new Date().toISOString();
          const res = await fetchWithAuth('/attendance/record', {
            method: 'POST',
            body: JSON.stringify({
              studentId: student.id, classId: selectedClass.id,
              status: 'PRESENT', session, checkInTime: now,
            }),
          });
          if (res.ok) {
            await playSuccess();
            const updated = new Map(scannedStudents);
            updated.set(student.id, { id: student.id, name: student.name, status: 'present' });
            setScannedStudents(updated);
            showResultPopup({ id: student.id, name: student.name, photo: student.photo, status: 'present' });
          } else {
            await playError();
            showResultPopup({ id: student.id, name: student.name, status: 'error' });
          }
        } catch {
          await playError();
          showResultPopup({ id: student.id, name: student.name, status: 'error' });
        }
      }
    },
    [selectedClass, students, mode, session, scannedStudents]
  );

  // Choose handler based on mode
  const handleBarCodeScanned = handleStudentScan;

  // ─── Permission screens ───
  if (!permission) {
    return <View style={styles.container}><Text style={styles.loadingText}>Loading...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permTitle}>Camera Permission</Text>
        <Text style={styles.permText}>We need camera access to scan QR codes for attendance.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── SELF-SCAN MODE (Officer/Teacher/Employee — camera QR scan) ───
  if (scanMode === 'self') {
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
          onBarcodeScanned={scanning ? handleSelfScan : undefined}
        />

        <View style={styles.overlay}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>My Attendance</Text>
            <View style={{ width: 50 }} />
          </View>

          {/* User info banner */}
          <View style={styles.selfBanner}>
            <View style={styles.selfBannerAvatar}>
              <Ionicons name="person" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selfBannerName}>{user?.name || 'User'}</Text>
              <Text style={styles.selfBannerRole}>{user?.role || 'Employee'}</Text>
            </View>
            {locationRef.current && (
              <View style={styles.selfGpsBadge}>
                <Ionicons name="location" size={12} color={COLORS.success} />
                <Text style={styles.selfGpsText}>GPS</Text>
              </View>
            )}
          </View>

          {/* Scan area */}
          <View style={styles.scanAreaWrapper}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]} />
            </View>
            <Text style={styles.scanHint}>Scan any QR code to check in / check out</Text>
          </View>

          {/* Bottom indicator */}
          <View style={styles.selfBottomBar}>
            <View style={styles.selfScanIndicator}>
              <View style={styles.pulseDot} />
              <Text style={styles.selfScanStatusText}>Scanning...</Text>
            </View>
          </View>
        </View>

        {/* Result popup */}
        {showPopup && lastScanned && (
          <Animated.View
            style={[
              styles.popup,
              { opacity: popupAnim, transform: [{ scale: popupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
              lastScanned.status === 'error' ? styles.popupError : styles.popupSuccess,
            ]}
          >
            <View style={[styles.popupIcon, lastScanned.status === 'error' ? styles.popupIconError : styles.popupIconSuccess]}>
              <Text style={styles.popupIconText}>{lastScanned.status === 'error' ? '✗' : '✓'}</Text>
            </View>
            <Text style={styles.popupName}>{lastScanned.name}</Text>
            <Text style={styles.popupStatus}>
              {lastScanned.action === 'CHECK_IN' && '✅ Checked In'}
              {lastScanned.action === 'CHECK_OUT' && '👋 Checked Out'}
              {lastScanned.status === 'error' && '❌ Error'}
            </Text>
            {lastScanned.role && lastScanned.status !== 'error' && (
              <Text style={styles.popupRole}>{lastScanned.role}</Text>
            )}
          </Animated.View>
        )}
      </View>
    );
  }

  // ─── STUDENT SCAN MODE (class-based) ───
  // Class selection screen
  if (!selectedClass) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backNavText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Class</Text>
          <View style={{ width: 50 }} />
        </View>
        <Text style={styles.welcomeText}>Welcome, {user?.name || user?.email}</Text>

        <View style={styles.classGrid}>
          {classes.length === 0 ? (
            <Text style={styles.emptyText}>No classes found</Text>
          ) : (
            classes.map((cls: any) => (
              <TouchableOpacity
                key={cls.id}
                style={styles.classCard}
                onPress={() => selectClass(cls)}
              >
                <Text style={styles.className}>{cls.name}</Text>
                {cls.subject && <Text style={styles.classSubject}>{cls.subject}</Text>}
                <Text style={styles.classStudents}>{cls._count?.students || 0} students</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  }

  // Student scanner screen
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
        onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
      />

      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => { setSelectedClass(null); setScannedStudents(new Map()); }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{selectedClass.name}</Text>
          <Text style={styles.scanCount}>{scannedStudents.size}/{students.length}</Text>
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'check-in' && styles.modeBtnActive]}
              onPress={() => setMode('check-in')}
            >
              <Text style={[styles.modeBtnText, mode === 'check-in' && styles.modeBtnTextActive]}>Check In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'check-out' && styles.modeBtnActive]}
              onPress={() => setMode('check-out')}
            >
              <Text style={[styles.modeBtnText, mode === 'check-out' && styles.modeBtnTextActive]}>Check Out</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sessionPicker}>
            {[1, 2, 3, 4].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.sessionBtn, session === s && styles.sessionBtnActive]}
                onPress={() => setSession(s)}
              >
                <Text style={[styles.sessionBtnText, session === s && styles.sessionBtnTextActive]}>S{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.scanAreaWrapper}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineTranslate }] }]} />
          </View>
          <Text style={styles.scanHint}>Point camera at student QR code</Text>
        </View>

        {scannedStudents.size > 0 && (
          <View style={styles.recentScans}>
            <Text style={styles.recentTitle}>Recent Scans</Text>
            {Array.from(scannedStudents.values())
              .slice(-3)
              .reverse()
              .map((s, i) => (
                <View key={i} style={styles.recentItem}>
                  <View style={[styles.recentDot, { backgroundColor: s.status === 'present' || s.status === 'checked-out' ? '#00c853' : '#ff5252' }]} />
                  <Text style={styles.recentName}>{s.name}</Text>
                  <Text style={styles.recentStatus}>{s.status}</Text>
                </View>
              ))}
          </View>
        )}
      </View>

      {showPopup && lastScanned && (
        <Animated.View
          style={[
            styles.popup,
            { opacity: popupAnim, transform: [{ scale: popupAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
            lastScanned.status === 'error' || lastScanned.status === 'duplicate' ? styles.popupError : styles.popupSuccess,
          ]}
        >
          <View style={[styles.popupIcon, lastScanned.status === 'error' || lastScanned.status === 'duplicate' ? styles.popupIconError : styles.popupIconSuccess]}>
            <Text style={styles.popupIconText}>{lastScanned.status === 'error' || lastScanned.status === 'duplicate' ? '✗' : '✓'}</Text>
          </View>
          <Text style={styles.popupName}>{lastScanned.name}</Text>
          <Text style={styles.popupStatus}>
            {lastScanned.status === 'present' && '✅ Checked In'}
            {lastScanned.status === 'checked-out' && '👋 Checked Out'}
            {lastScanned.status === 'duplicate' && '⚠️ Already Scanned'}
            {lastScanned.status === 'error' && '❌ Not Found'}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  // Permission styles
  permTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 100,
  },
  permText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 30,
  },
  permButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 30,
    alignSelf: 'center',
  },
  permButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  backNavText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  logoutText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  welcomeText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginBottom: 24,
  },
  // Class selection
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  classCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    width: '47%',
    borderWidth: 1.5,
    borderColor: COLORS.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  className: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  classSubject: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  classStudents: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    width: '100%',
    marginTop: 40,
  },
  // Scanner
  scannerContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  scanCount: {
    color: '#00c853',
    fontSize: 18,
    fontWeight: '700',
  },
  // Controls
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  modeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  modeBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  sessionPicker: {
    flexDirection: 'row',
    gap: 6,
  },
  sessionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionBtnActive: {
    backgroundColor: COLORS.primary,
  },
  sessionBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
  },
  sessionBtnTextActive: {
    color: '#fff',
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
  // Recent scans
  recentScans: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  recentTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  recentName: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  recentStatus: {
    color: '#8892b0',
    fontSize: 12,
    textTransform: 'capitalize',
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
  popupStatus: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
  },
  popupRole: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  // Self-scan camera mode
  selfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  selfBannerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfBannerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  selfBannerRole: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  selfGpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  selfGpsText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '600',
  },
  selfBottomBar: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: 'center',
  },
  selfScanIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  selfScanStatusText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
  },
});
