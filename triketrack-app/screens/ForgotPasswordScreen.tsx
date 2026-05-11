import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AnimatedButton, AppIcon, InputField } from '../components/ui';
import type { DriverPasswordResetStatusRecord } from '../supabase';
import { MAXIM_UI_SUBTLE_DARK, MAXIM_UI_TEXT_DARK } from './homeScreenShared';

type ForgotPasswordScreenProps = {
  onSubmit: (driverCode: string) => Promise<boolean> | boolean;
  onCheckStatus: (driverCode: string) => Promise<DriverPasswordResetStatusRecord | null>;
  onApproved: (driverCode: string) => void;
  isSubmitting?: boolean;
  styles: Record<string, any>;
  isDarkMode?: boolean;
};

export function ForgotPasswordScreen({
  onSubmit,
  onCheckStatus,
  onApproved,
  isSubmitting = false,
  styles,
  isDarkMode = false,
}: ForgotPasswordScreenProps) {
  const [driverCode, setDriverCode] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [resetRequest, setResetRequest] = useState<DriverPasswordResetStatusRecord | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const handleSubmit = async () => {
    const normalizedDriverCode = driverCode.trim().toUpperCase();
    if (!normalizedDriverCode) {
      Alert.alert('Missing Driver Code', 'Enter your Driver Code to request a password reset.');
      return;
    }

    const wasSent = await onSubmit(normalizedDriverCode);
    if (wasSent) {
      setRequestSent(true);
      const latest = await onCheckStatus(normalizedDriverCode);
      setResetRequest(latest);
    } else {
      Alert.alert(
        'Request not sent',
        'Unable to send the password reset request. Please verify your Driver Code and try again.',
      );
    }
  };

  const refreshStatus = async () => {
    const normalizedDriverCode = driverCode.trim().toUpperCase();
    if (!normalizedDriverCode) return;
    setIsCheckingStatus(true);
    const latest = await onCheckStatus(normalizedDriverCode);
    setIsCheckingStatus(false);
    setResetRequest(latest);
    if (latest?.status === 'approved') {
      onApproved(normalizedDriverCode);
    }
  };

  useEffect(() => {
    if (!requestSent || resetRequest?.status === 'approved') {
      return;
    }

    const timer = setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => clearInterval(timer);
  }, [requestSent, resetRequest?.status, driverCode]);

  if (requestSent) {
    if (resetRequest?.status === 'approved') {
      return (
        <View style={styles.loginFormContainer}>
          <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null]}>
            Your password reset request was approved.
          </Text>
          <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
            Return to Login and enter your Driver Code with the one-time temporary password shown after approval.
          </Text>

          <View style={styles.loginButtonBottomSpacer} />
          <AnimatedButton
            style={[styles.primaryButton, styles.loginPrimaryButtonLower]}
            onPress={() => onApproved(driverCode.trim().toUpperCase())}
          >
            <Text style={styles.primaryButtonText}>Back to Login</Text>
          </AnimatedButton>
        </View>
      );
    }

    return (
      <View style={styles.loginFormContainer}>
        <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null]}>
          Password reset request sent.
        </Text>
        <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
          Please wait for the TODA or Barangay administrator to verify and approve your request.
        </Text>
        <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
          Keep this screen open or tap Check Approval Status. TrikeTrack will show a local notification after approval when notifications are allowed.
        </Text>
        {resetRequest?.status === 'denied' || resetRequest?.status === 'expired' ? (
          <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null]}>
            Request status: {resetRequest.status}. Submit a new request if needed.
          </Text>
        ) : null}
        <View style={styles.loginButtonBottomSpacer} />
        <AnimatedButton
          style={[styles.primaryButton, styles.loginPrimaryButtonLower]}
          onPress={refreshStatus}
        >
          <Text style={styles.primaryButtonText}>
            {isCheckingStatus ? 'Checking...' : 'Check Approval Status'}
          </Text>
        </AnimatedButton>
      </View>
    );
  }

  return (
    <View style={styles.loginFormContainer}>
      <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
        Enter your Driver Code to request a password reset from the TODA or Barangay administrator.
      </Text>
      <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
        For security purposes, only the authorized admin can approve your password reset after verifying
        your registered driver information.
      </Text>
      <Text style={[styles.forgotPasswordBody, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null]}>
        Once approved, use Check Approval Status to continue the password reset process. If notifications are
        allowed, TrikeTrack will also show a local approval notification.
      </Text>

      <InputField
        icon={<AppIcon name="credit-card" size={16} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'} />}
        placeholder="Driver Code"
        placeholderTextColor={isDarkMode ? MAXIM_UI_SUBTLE_DARK : undefined}
        value={driverCode}
        onChangeText={setDriverCode}
        autoCapitalize="characters"
        autoCorrect={false}
        styles={styles}
      />

      <View style={styles.loginButtonBottomSpacer} />
      <AnimatedButton
        style={[styles.primaryButton, styles.loginPrimaryButtonLower]}
        onPress={handleSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? 'Sending request...' : 'Send Password Reset Request'}
        </Text>
      </AnimatedButton>
    </View>
  );
}
