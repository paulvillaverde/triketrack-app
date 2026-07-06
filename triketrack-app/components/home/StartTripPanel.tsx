import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_GREEN_BORDER_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../screens/homeScreenShared';

type StartTripPanelProps = {
  styles: Record<string, any>;
  localStyles: Record<string, any>;
  insetsBottom: number;
  isInsideGeofence: boolean;
  minutesText: string;
  kmText: string;
  selectedFare: number;
  fareOptions: number[];
  farePickerOpen: boolean;
  setFarePickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedFare: (value: number) => void;
  speedKmh: number;
  isTripStarted: boolean;
  onTripButtonPress: () => void | Promise<void>;
  onLayout?: (event: LayoutChangeEvent) => void;
  isLowBatteryMapMode?: boolean;
};

export function StartTripPanel({
  styles,
  localStyles,
  insetsBottom,
  isInsideGeofence,
  minutesText,
  kmText,
  selectedFare,
  fareOptions,
  farePickerOpen,
  setFarePickerOpen,
  setSelectedFare,
  speedKmh,
  isTripStarted,
  onTripButtonPress,
  onLayout,
  isLowBatteryMapMode = false,
}: StartTripPanelProps) {
  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={[
        styles.routeTripPanel,
        isLowBatteryMapMode
          ? {
              backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
              borderColor: MAXIM_UI_BORDER_DARK,
              shadowOpacity: 0,
              elevation: 0,
            }
          : null,
        { bottom: 104 + (insetsBottom || 0) },
      ]}
      onLayout={onLayout}
    >
      <View style={styles.routeGeofenceStatusRow}>
        <Text
          style={[
            styles.routeGeofenceStatusLabel,
            isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
          ]}
        >
          Obrero Geofence
        </Text>
        <View
          style={[
            styles.routeGeofencePill,
            isInsideGeofence ? styles.routeGeofencePillInside : styles.routeGeofencePillOutside,
          ]}
        >
          <Text
            style={[
              styles.routeGeofencePillText,
              isInsideGeofence
                ? styles.routeGeofencePillTextInside
                : styles.routeGeofencePillTextOutside,
            ]}
          >
            {isInsideGeofence ? 'Inside' : 'Outside'}
          </Text>
        </View>
      </View>

      <View style={[styles.routeTripStatsRow, localStyles.tripStatsRow, isWeb ? webStyles.tripStatsRow : null]}>
        <View
          style={[
            styles.routeTripStatPill,
            localStyles.tripStatPill,
            isWeb ? webStyles.tripStatPill : null,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                }
              : null,
          ]}
        >
          <Text
            style={[
              styles.routeTripStatValue,
              isWeb ? webStyles.tripStatValue : null,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
            numberOfLines={1}
          >
            {minutesText}
          </Text>
          <Text
            style={[
              styles.routeTripStatLabel,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            mins
          </Text>
        </View>
        <View
          style={[
            styles.routeTripStatPill,
            localStyles.tripStatPill,
            isWeb ? webStyles.tripStatPill : null,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                }
              : null,
          ]}
        >
          <Text
            style={[
              styles.routeTripStatValue,
              isWeb ? webStyles.tripStatValue : null,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
            numberOfLines={1}
          >
            {kmText}
          </Text>
          <Text
            style={[
              styles.routeTripStatLabel,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            km
          </Text>
        </View>
        <Pressable
          style={[
            styles.routeTripStatPill,
            localStyles.tripStatPill,
            isWeb ? webStyles.tripStatPill : null,
            isLowBatteryMapMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                }
              : null,
          ]}
          onPress={() => setFarePickerOpen((prev) => !prev)}
        >
          <Text
            style={[
              styles.routeTripStatValue,
              isWeb ? webStyles.tripStatValue : null,
              isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
            ]}
            numberOfLines={1}
          >
            {'\u20B1'}{selectedFare}
          </Text>
          <Text
            style={[
              styles.routeTripStatLabel,
              isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            fare
          </Text>
        </Pressable>
      </View>

      <View style={localStyles.navigationMetaRow}>
        <Text
          style={[
            localStyles.navigationMetaText,
            isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
          ]}
        >
          Speed {speedKmh.toFixed(1)} km/h
        </Text>
        <View style={localStyles.metaActionsRow}>
          <View
            style={[
              localStyles.metaStatusChip,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_GREEN_SOFT_DARK,
                    borderWidth: 1,
                    borderColor: MAXIM_UI_GREEN_BORDER_DARK,
                  }
                : null,
            ]}
          >
            <AppIcon name="navigation" size={12} color="#147D64" />
            <Text style={localStyles.metaStatusChipText}>Auto-reroute on</Text>
          </View>
        </View>
      </View>

      {farePickerOpen ? (
        <View style={styles.routeFareList}>
          {fareOptions.map((value) => (
            <Pressable
              key={value}
              style={[
                styles.routeFareOption,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
                value === selectedFare && styles.routeFareOptionActive,
                value === selectedFare && isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_GREEN_SOFT_DARK,
                      borderColor: '#57c7a8',
                    }
                  : null,
              ]}
              onPress={() => {
                setSelectedFare(value);
                setFarePickerOpen(false);
              }}
            >
              <Text
                style={[
                  styles.routeFareOptionText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  value === selectedFare && styles.routeFareOptionTextActive,
                ]}
              >
                {'\u20B1'}{value}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable style={styles.routeStartTripButton} onPress={onTripButtonPress}>
        <Text style={styles.routeStartTripText}>{isTripStarted ? 'End Trip' : 'Start Trip'}</Text>
      </Pressable>
    </View>
  );
}

const webStyles = StyleSheet.create({
  tripStatsRow: {
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 0,
    width: '100%',
  },
  tripStatPill: {
    flexBasis: '31%',
    flexGrow: 0,
    flexShrink: 1,
    width: '31%',
    minWidth: 0,
    marginHorizontal: 0,
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  tripStatValue: {
    width: '100%',
    minWidth: 0,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 20,
  },
});
