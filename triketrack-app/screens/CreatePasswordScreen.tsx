import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AnimatedButton, AppIcon, InputField } from '../components/ui';
import { MAXIM_UI_SUBTLE_DARK, MAXIM_UI_TEXT_DARK } from './homeScreenShared';

type CreatePasswordScreenProps = {
  onBackToLogin: () => void;
  onSubmit: (driverCode: string, password: string) => Promise<void> | void;
  isSubmitting?: boolean;
  styles: Record<string, any>;
  isDarkMode?: boolean;
};

export function CreatePasswordScreen({
  onBackToLogin,
  onSubmit,
  isSubmitting = false,
  styles,
  isDarkMode = false,
}: CreatePasswordScreenProps) {
  const [driverCode, setDriverCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [confirmPasswordHidden, setConfirmPasswordHidden] = useState(true);

  const handleSubmit = () => {
    if (!driverCode.trim() || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Enter your driver code and your new password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Password and confirm password do not match.');
      return;
    }

    void onSubmit(driverCode.trim().toUpperCase(), password);
  };

  return (
    <View style={styles.loginFormContainer}>
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
      <InputField
        icon={<AppIcon name="lock" size={16} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'} />}
        placeholder="Create password"
        placeholderTextColor={isDarkMode ? MAXIM_UI_SUBTLE_DARK : undefined}
        secureTextEntry={passwordHidden}
        value={password}
        onChangeText={setPassword}
        trailingIcon={
          <Pressable onPress={() => setPasswordHidden((prev) => !prev)}>
            <AppIcon
              name={passwordHidden ? 'eye-off' : 'eye'}
              size={16}
              color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'}
            />
          </Pressable>
        }
        styles={styles}
      />
      <InputField
        icon={<AppIcon name="lock" size={16} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'} />}
        placeholder="Confirm password"
        placeholderTextColor={isDarkMode ? MAXIM_UI_SUBTLE_DARK : undefined}
        secureTextEntry={confirmPasswordHidden}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        trailingIcon={
          <Pressable onPress={() => setConfirmPasswordHidden((prev) => !prev)}>
            <AppIcon
              name={confirmPasswordHidden ? 'eye-off' : 'eye'}
              size={16}
              color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#111827'}
            />
          </Pressable>
        }
        styles={styles}
      />

      <View style={styles.forgotPasswordRow}>
        <Pressable onPress={onBackToLogin}>
          <Text style={styles.smallLinkDark}>Back to login</Text>
        </Pressable>
      </View>

      <View style={styles.loginButtonBottomSpacer} />
      <AnimatedButton
        style={[styles.primaryButton, styles.loginPrimaryButtonLower]}
        onPress={handleSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting ? 'Saving password...' : 'Create Password'}
        </Text>
      </AnimatedButton>
    </View>
  );
}
