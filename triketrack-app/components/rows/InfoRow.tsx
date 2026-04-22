import { Pressable, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../ui';
import { MAXIM_UI_MUTED_DARK, MAXIM_UI_TEXT_DARK } from '../../screens/homeScreenShared';

type InfoRowProps = {
  icon: AppIconName;
  label: string;
  value: string;
  isLast?: boolean;
  onPress?: () => void;
  showChevron?: boolean;
  styles: Record<string, any>;
  isLowBatteryMapMode?: boolean;
};

export function InfoRow({
  icon,
  label,
  value,
  isLast = false,
  onPress,
  showChevron = false,
  styles,
  isLowBatteryMapMode = false,
}: InfoRowProps) {
  const Container: any = onPress ? Pressable : View;
  return (
    <Container
      style={[styles.infoRow, isLast && styles.infoRowLast]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.infoIconWrap}>
        <AppIcon name={icon} size={16} color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#111827'} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={[styles.infoLabel, isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
          {label}
        </Text>
        <Text style={[styles.infoValue, isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null]}>
          {value}
        </Text>
      </View>
      {showChevron ? (
        <View style={{ width: 22, alignItems: 'flex-end', justifyContent: 'center', paddingTop: 3 }}>
          <AppIcon
            name="chevron-right"
            size={16}
            color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#94A3B8'}
          />
        </View>
      ) : null}
    </Container>
  );
}
