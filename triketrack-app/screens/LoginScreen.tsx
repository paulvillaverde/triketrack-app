import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatedButton, InputField } from '../components/ui';

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
        placeholder="Password"
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

      <View style={styles.forgotPasswordRow}>
        <Pressable onPress={onCreatePassword}>
          <Text style={styles.smallLinkDark}>Don't have password?</Text>
        </Pressable>
      </View>

      <View style={styles.loginButtonBottomSpacer} />
      <AnimatedButton
        style={[styles.primaryButton, styles.loginPrimaryButtonLower]}
        onPress={() => onLogin(driverCode.trim().toUpperCase(), password)}
      >
        <Text style={styles.primaryButtonText}>{isAuthenticating ? 'Signing in...' : 'Login'}</Text>
      </AnimatedButton>
    </View>
  );
}
