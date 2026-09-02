import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset } from '../api';
import { COLORS } from '../theme';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      Alert.alert('Check your email', 'If this account exists, password-reset instructions have been sent.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (error: any) {
      Alert.alert('Unable to send', error.message || 'Check your school address and connection, then try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Teal Header */}
      <View style={styles.header}>
        <SafeAreaView style={styles.headerInner}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Forgot Password</Text>
        </SafeAreaView>
      </View>

      {/* White Card */}
      <View style={styles.card}>
        <Text style={styles.heading}>Reset Password?</Text>
        <Text style={styles.description}>
          Enter your account email and we will send a secure reset link if the account exists.
        </Text>

        <Text style={styles.label}>Enter Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="example@example.com"
          placeholderTextColor={COLORS.textLight}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitButtonText}>{loading ? 'Sending…' : 'Send Reset Link'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerInner: {
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: Platform.OS === 'ios' ? 10 : 0,
    padding: 8,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 20,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 40,
    paddingHorizontal: 30,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 40,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    height: 50,
    backgroundColor: COLORS.inputBg,
    borderRadius: 25,
    paddingHorizontal: 20,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  buttonContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  submitButton: {
    width: '60%',
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
