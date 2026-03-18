import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '../ui';

type HomeHeaderCardProps = {
  onPressNotification?: () => void;
  styles: Record<string, any>;
};

export function HomeHeaderCard({ onPressNotification, styles }: HomeHeaderCardProps) {
  return (
    <View style={styles.homeHeaderSticky}>
      <View style={styles.homeHeaderCard}>
        <View style={styles.homeHeaderRow}>
          <View style={styles.homeHeaderIdentity}>
            <View style={styles.homeAvatarWrap}>
              <Avatar name="Juan Dela Cruz" style={styles.homeAvatarImage} />
            </View>

            <View style={styles.homeHeaderText}>
              <Text style={styles.homeName}>Juan Dela Cruz</Text>
              <Text style={styles.homeHeaderSubText}>TRC-2024-8472</Text>
            </View>
          </View>

          <Pressable style={styles.homeHeaderAction} onPress={onPressNotification}>
            <Feather name="bell" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
