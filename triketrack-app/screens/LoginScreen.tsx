import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedButton, AppIcon, InputField } from '../components/ui';

type LoginScreenProps = {
  onCreatePassword: () => void;
  onLogin: (driverCode: string, password: string) => void;
  isAuthenticating?: boolean;
  styles: Record<string, any>;
};

export function LoginScreen({
  onCreatePassword,
  onLogin,
  isAuthenticating = false,
  styles,
}: LoginScreenProps) {
  const [driverCode, setDriverCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);

  return (
    <View style={styles.loginFormContainer}>
      <InputField
        icon={<AppIcon name="credit-card" size={16} color="#111827" />}
        placeholder="Driver Code"
        value={driverCode}
        onChangeText={setDriverCode}
        autoCapitalize="characters"
        autoCorrect={false}
        styles={styles}
      />
      <InputField
        icon={<AppIcon name="lock" size={16} color="#111827" />}
        placeholder="Password"
        secureTextEntry={passwordHidden}
        value={password}
        onChangeText={setPassword}
        trailingIcon={
          <Pressable onPress={() => setPasswordHidden((prev) => !prev)}>
            <AppIcon name={passwordHidden ? 'eye-off' : 'eye'} size={16} color="#111827" />
          </Pressable>
        }
        styles={styles}
      />

      <View style={styles.forgotPasswordRow}>
        <Pressable onPress={onCreatePassword}>
          <Text style={styles.smallLinkDark}>Don't have password?</Text>
        </Pressable>
      </View>

      <View style={styles.loginButtonBottomSpacer} />
      <AnimatedButton
        style={[styles.primaryButton, styles.loginPrimaryButtonLower, localStyles.loginButton]}
        onPress={() => onLogin(driverCode.trim().toUpperCase(), password)}
      >
        <Text style={styles.primaryButtonText}>{isAuthenticating ? 'Signing in...' : 'Login'}</Text>
      </AnimatedButton>
    </View>
  );
}

const localStyles = StyleSheet.create({
  loginButton: {
    minHeight: 60,
    height: 60,
    borderRadius: 14,
    marginTop: 0,
    marginBottom: 0,
    transform: [{ translateY: -8 }],
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
});
