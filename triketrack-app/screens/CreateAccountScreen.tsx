import { Pressable, Text, View } from 'react-native';
import { AnimatedButton, AppIcon, InputField } from '../components/ui';

type CreateAccountScreenProps = {
  onLogin: () => void;
  styles: Record<string, any>;
};

export function CreateAccountScreen({ onLogin, styles }: CreateAccountScreenProps) {
  return (
    <View style={styles.createAccountContent}>
      <View style={styles.createAccountLowered}>
      <InputField
        icon={<AppIcon name="user" size={16} color="#111827" />}
        placeholder="Name"
        styles={styles}
      />
      <InputField
        icon={<AppIcon name="mail" size={16} color="#111827" />}
        placeholder="Email address"
        styles={styles}
      />
      <InputField
        icon={<AppIcon name="lock" size={16} color="#111827" />}
        placeholder="Password"
        secureTextEntry
        trailingIcon={<AppIcon name="eye-off" size={16} color="#111827" />}
        styles={styles}
      />
      <InputField
        icon={<AppIcon name="lock" size={16} color="#111827" />}
        placeholder="Confirm Password"
        secureTextEntry
        trailingIcon={<AppIcon name="eye-off" size={16} color="#111827" />}
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
