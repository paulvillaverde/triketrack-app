import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Screen = 'login' | 'createAccount' | 'forgotPassword';

type InputFieldProps = {
  icon: string;
  placeholder: string;
  secureTextEntry?: boolean;
  trailingIcon?: string;
};

function InputField({
  icon,
  placeholder,
  secureTextEntry = false,
  trailingIcon,
}: InputFieldProps) {
  return (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputIcon}>{icon}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#9AA0A6"
        secureTextEntry={secureTextEntry}
        style={styles.input}
      />
      {trailingIcon ? <Text style={styles.trailingIcon}>{trailingIcon}</Text> : null}
    </View>
  );
}

function SocialRow() {
  return (
    <>
      <View style={styles.divider} />
      <Text style={styles.helperText}>Or Continue With Account</Text>
      <View style={styles.socialRow}>
        <View style={styles.socialBadge}>
          <Text style={styles.socialText}>f</Text>
        </View>
        <View style={styles.socialBadge}>
          <Text style={styles.socialText}>G</Text>
        </View>
        <View style={styles.socialBadge}>
          <Text style={styles.socialText}></Text>
        </View>
      </View>
    </>
  );
}

const SCREEN_CONTENT: Record<Screen, { title: string; subtitle: string }> = {
  login: {
    title: 'Log in',
    subtitle:
      'Enter your email and password to securely access\nyour account and manage your services.',
  },
  createAccount: {
    title: 'Create Account',
    subtitle:
      'Create a new account to get started and enjoy\nseamless access to our features.',
  },
  forgotPassword: {
    title: 'Forgot Password',
    subtitle:
      'Enter your email address to receive a reset link and\nregain access to your account.',
  },
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const content = useMemo(() => SCREEN_CONTENT[screen], [screen]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={styles.grow}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false}>
          <View style={styles.phoneCard}>
            <Pressable onPress={() => setScreen('login')} style={styles.backButton}>
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>

            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>

            {screen === 'login' ? (
              <>
                <InputField icon="✉" placeholder="Email address" />
                <InputField
                  icon="🔒"
                  placeholder="Password"
                  secureTextEntry
                  trailingIcon="◌"
                />

                <View style={styles.rowBetween}>
                  <Text style={styles.smallMuted}>☐ Remember me</Text>
                  <Pressable onPress={() => setScreen('forgotPassword')}>
                    <Text style={styles.smallLinkDark}>Forgot Password</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Login</Text>
                </Pressable>

                <View style={styles.rowCenter}>
                  <Text style={styles.helperText}>Don't have an account? </Text>
                  <Pressable onPress={() => setScreen('createAccount')}>
                    <Text style={styles.greenLink}>Sign Up here</Text>
                  </Pressable>
                </View>

                <SocialRow />
              </>
            ) : null}

            {screen === 'createAccount' ? (
              <>
                <InputField icon="👤" placeholder="Name" />
                <InputField icon="✉" placeholder="Email address" />
                <InputField
                  icon="🔒"
                  placeholder="Password"
                  secureTextEntry
                  trailingIcon="◌"
                />
                <InputField
                  icon="🔒"
                  placeholder="Confirm Password"
                  secureTextEntry
                  trailingIcon="◌"
                />

                <Pressable style={[styles.primaryButton, styles.buttonGapTop]}>
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                </Pressable>

                <View style={styles.rowCenter}>
                  <Text style={styles.helperText}>Already have an account? </Text>
                  <Pressable onPress={() => setScreen('login')}>
                    <Text style={styles.greenLink}>Sign In here</Text>
                  </Pressable>
                </View>

                <SocialRow />
              </>
            ) : null}

            {screen === 'forgotPassword' ? (
              <>
                <InputField icon="✉" placeholder="Email address" />
                <Pressable style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EDEFF2',
  },
  grow: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  phoneCard: {
    width: '100%',
    maxWidth: 370,
    minHeight: 700,
    backgroundColor: '#F5F6F8',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  backButtonText: {
    fontSize: 26,
    color: '#232323',
    marginTop: -2,
  },
  title: {
    textAlign: 'center',
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: '#6D7480',
    marginBottom: 24,
  },
  inputWrapper: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  inputIcon: {
    width: 18,
    fontSize: 14,
    color: '#7A7A7A',
  },
  input: {
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
    color: '#1F2937',
  },
  trailingIcon: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
    marginBottom: 16,
  },
  smallMuted: {
    fontSize: 13,
    color: '#666',
  },
  smallLinkDark: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  primaryButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#38BF84',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 22,
    lineHeight: 24,
  },
  rowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  helperText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
  },
  greenLink: {
    fontSize: 14,
    color: '#26B97B',
    fontWeight: '700',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#DADDE2',
    marginTop: 8,
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
  },
  socialBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialText: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  },
  buttonGapTop: {
    marginTop: 12,
  },
});
