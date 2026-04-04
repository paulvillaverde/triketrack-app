import { Text, View } from 'react-native';
import { AppIcon, type AppIconName } from '../ui';

type MetricTileProps = {
  label: string;
  value: string;
  icon: AppIconName;
  styles: Record<string, any>;
};

export function MetricTile({ label, value, icon, styles }: MetricTileProps) {
  return (
    <View style={styles.metricTile}>
      <View style={styles.metricIconWrap}>
        <AppIcon name={icon} size={14} color="#57c7a8" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}
