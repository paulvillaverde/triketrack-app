import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatedButton, InputField } from '../components/ui';

type CreatePasswordScreenProps = {
  onBackToLogin: () => void;
  onSubmit: (driverCode: string, password: string) => Promise<void> | void;
  isSubmitting?: boolean;
  styles: Record<string, any>;
};

export function CreatePasswordScreen({
  onBackToLogin,
  onSubmit,
  isSubmitting = false,
  styles,
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
        icon={<Feather name="credit-card" size={16} color="#111827" />}
        placeholder="Driver Code"
        value={driverCode}
        onChangeText={setDriverCode}
        autoCapitalize="characters"
        autoCorrect={false}
        styles={styles}
      />
      <InputField
        icon={<Feather name="lock" size={16} color="#111827" />}
        placeholder="Create password"
        secureTextEntry={passwordHidden}
        value={password}
        onChangeText={setPassword}
        trailingIcon={
          <Pressable onPress={() => setPasswordHidden((prev) => !prev)}>
            <Feather name={passwordHidden ? 'eye-off' : 'eye'} size={16} color="#111827" />
          </Pressable>
        }
        styles={styles}
      />
      <InputField
        icon={<Feather name="lock" size={16} color="#111827" />}
        placeholder="Confirm password"
        secureTextEntry={confirmPasswordHidden}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        trailingIcon={
          <Pressable onPress={() => setConfirmPasswordHidden((prev) => !prev)}>
            <Feather name={confirmPasswordHidden ? 'eye-off' : 'eye'} size={16} color="#111827" />
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
