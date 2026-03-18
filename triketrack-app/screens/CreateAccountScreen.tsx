import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AnimatedButton, InputField } from '../components/ui';

type CreateAccountScreenProps = {
  onLogin: () => void;
  styles: Record<string, any>;
};

export function CreateAccountScreen({ onLogin, styles }: CreateAccountScreenProps) {
  return (
    <View style={styles.createAccountContent}>
      <View style={styles.createAccountLowered}>
      <InputField
        icon={<Feather name="user" size={16} color="#111827" />}
        placeholder="Name"
        styles={styles}
      />
      <InputField
        icon={<Feather name="mail" size={16} color="#111827" />}
        placeholder="Email address"
        styles={styles}
      />
      <InputField
        icon={<Feather name="lock" size={16} color="#111827" />}
        placeholder="Password"
        secureTextEntry
        trailingIcon={<Feather name="eye-off" size={16} color="#111827" />}
        styles={styles}
      />
      <InputField
        icon={<Feather name="lock" size={16} color="#111827" />}
        placeholder="Confirm Password"
        secureTextEntry
        trailingIcon={<Feather name="eye-off" size={16} color="#111827" />}
        styles={styles}
      />

      <AnimatedButton style={[styles.primaryButton, styles.buttonGapTop]}>
        <Text style={styles.primaryButtonText}>Create Account</Text>
      </AnimatedButton>

      <View style={styles.createAccountRowCenter}>
        <Text style={styles.helperText}>Already have an account? </Text>
        <Pressable onPress={onLogin}>
          <Text style={styles.greenLink}>Sign In here</Text>
        </Pressable>
      </View>
      </View>
    </View>
  );
}
