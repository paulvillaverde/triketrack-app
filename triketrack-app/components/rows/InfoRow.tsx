import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

type InfoRowProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  isLast?: boolean;
  onPress?: () => void;
  showChevron?: boolean;
  styles: Record<string, any>;
};

export function InfoRow({ icon, label, value, isLast = false, onPress, showChevron = false, styles }: InfoRowProps) {
  const Container: any = onPress ? Pressable : View;
  return (
    <Container
      style={[styles.infoRow, isLast && styles.infoRowLast]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.infoIconWrap}>
        <Feather name={icon} size={16} color="#111827" />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      {showChevron ? (
        <View style={{ width: 22, alignItems: 'flex-end', justifyContent: 'center', paddingTop: 3 }}>
          <Feather name="chevron-right" size={16} color="#94A3B8" />
        </View>
      ) : null}
    </Container>
  );
}
