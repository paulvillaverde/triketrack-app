import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { AppIcon } from '../ui';

type TripNavigationPanelProps = {
  styles: Record<string, any>;
  localStyles: Record<string, any>;
  insetsBottom: number;
  minutesText: string;
  kmText: string;
  speedKmh: number;
  isInsideGeofence: boolean;
  isLowGpsAccuracy: boolean;
  isSimulatingTrip: boolean;
  onEndTripPress: () => void | Promise<void>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function TripNavigationPanel({
  styles,
  localStyles,
  insetsBottom,
  minutesText,
  kmText,
  speedKmh,
  isInsideGeofence,
  isLowGpsAccuracy,
  isSimulatingTrip,
  onEndTripPress,
  onLayout,
}: TripNavigationPanelProps) {
  return (
    <View
      style={[
        localStyles.tripNavigationPanel,
        { bottom: 26 + (insetsBottom || 0) },
      ]}
      onLayout={onLayout}
    >
      <View style={localStyles.tripNavigationHandle} />

      <View style={localStyles.tripNavigationStatsRow}>
        <View style={localStyles.tripNavigationStatCard}>
          <Text style={localStyles.tripNavigationStatValue}>{minutesText}</Text>
          <Text style={localStyles.tripNavigationStatLabel}>Duration</Text>
        </View>
        <View style={localStyles.tripNavigationStatCard}>
          <Text style={localStyles.tripNavigationStatValue}>{kmText}</Text>
          <Text style={localStyles.tripNavigationStatLabel}>Distance</Text>
        </View>
        <View style={localStyles.tripNavigationStatCard}>
          <Text style={localStyles.tripNavigationStatValue}>{speedKmh.toFixed(1)}</Text>
          <Text style={localStyles.tripNavigationStatLabel}>km/h</Text>
        </View>
      </View>

      <View style={localStyles.tripNavigationStatusRow}>
        <View style={[localStyles.tripNavigationStatusChip, localStyles.tripNavigationStatusPrimary]}>
          <AppIcon name={isSimulatingTrip ? 'activity' : 'navigation'} size={13} color="#147D64" active />
          <Text style={localStyles.tripNavigationStatusPrimaryText}>
            {isSimulatingTrip ? 'Simulation active' : 'Live route tracking'}
          </Text>
        </View>
        <View
          style={[
            localStyles.tripNavigationStatusChip,
            isInsideGeofence
              ? localStyles.tripNavigationStatusInside
              : localStyles.tripNavigationStatusOutside,
          ]}
        >
          <AppIcon
            name={isInsideGeofence ? 'check-circle' : 'alert-triangle'}
            size={13}
            color={isInsideGeofence ? '#047857' : '#B91C1C'}
            active
          />
          <Text
            style={[
              localStyles.tripNavigationStatusText,
              isInsideGeofence
                ? localStyles.tripNavigationStatusTextInside
                : localStyles.tripNavigationStatusTextOutside,
            ]}
          >
            {isInsideGeofence ? 'Inside geofence' : 'Outside geofence'}
          </Text>
        </View>
      </View>

      <View style={localStyles.tripNavigationStatusRow}>
        <View
          style={[
            localStyles.tripNavigationStatusChip,
            isLowGpsAccuracy
              ? localStyles.tripNavigationStatusWeakGps
              : localStyles.tripNavigationStatusGoodGps,
          ]}
        >
          <AppIcon
            name={isLowGpsAccuracy ? 'alert-circle' : 'crosshair'}
            size={13}
            color={isLowGpsAccuracy ? '#9A3412' : '#1D4ED8'}
            active
          />
          <Text
            style={[
              localStyles.tripNavigationStatusText,
              isLowGpsAccuracy
                ? localStyles.tripNavigationStatusTextWeakGps
                : localStyles.tripNavigationStatusTextGoodGps,
            ]}
          >
            {isLowGpsAccuracy ? 'Low GPS accuracy' : 'GPS locked'}
          </Text>
        </View>
      </View>

      <Pressable style={styles.routeStartTripButton} onPress={onEndTripPress}>
        <Text style={styles.routeStartTripText}>End Trip</Text>
      </Pressable>
    </View>
  );
}
