import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { AppIcon } from '../ui';

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
  enableTripSimulation: boolean;
  isTripStarted: boolean;
  onOpenSimulation?: () => void;
  onTripButtonPress: () => void | Promise<void>;
  onLayout?: (event: LayoutChangeEvent) => void;
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
  enableTripSimulation,
  isTripStarted,
  onOpenSimulation,
  onTripButtonPress,
  onLayout,
}: StartTripPanelProps) {
  const showSimulationAction = enableTripSimulation && !isTripStarted && !!onOpenSimulation;

  return (
    <View style={[styles.routeTripPanel, { bottom: 104 + (insetsBottom || 0) }]} onLayout={onLayout}>
      <View style={styles.routeGeofenceStatusRow}>
        <Text style={styles.routeGeofenceStatusLabel}>Obrero Geofence</Text>
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

      <View style={[styles.routeTripStatsRow, localStyles.tripStatsRow]}>
        <View style={[styles.routeTripStatPill, localStyles.tripStatPill]}>
          <Text style={styles.routeTripStatValue}>{minutesText}</Text>
          <Text style={styles.routeTripStatLabel}>mins</Text>
        </View>
        <View style={[styles.routeTripStatPill, localStyles.tripStatPill]}>
          <Text style={styles.routeTripStatValue}>{kmText}</Text>
          <Text style={styles.routeTripStatLabel}>km</Text>
        </View>
        <Pressable
          style={[styles.routeTripStatPill, localStyles.tripStatPill]}
          onPress={() => setFarePickerOpen((prev) => !prev)}
        >
          <Text style={styles.routeTripStatValue}>{'\u20B1'}{selectedFare}</Text>
          <Text style={styles.routeTripStatLabel}>fare</Text>
        </Pressable>
      </View>

      <View style={localStyles.navigationMetaRow}>
        <Text style={localStyles.navigationMetaText}>Speed {speedKmh.toFixed(1)} km/h</Text>
        <View style={localStyles.metaActionsRow}>
          <View style={localStyles.metaStatusChip}>
            <AppIcon name="navigation" size={12} color="#147D64" />
            <Text style={localStyles.metaStatusChipText}>Auto-reroute on</Text>
          </View>
          {showSimulationAction ? (
            <Pressable style={localStyles.simulationChip} onPress={onOpenSimulation}>
              <AppIcon name="activity" size={12} color="#2D7DF6" />
              <Text style={localStyles.simulationChipText}>Simulation</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {farePickerOpen ? (
        <View style={styles.routeFareList}>
          {fareOptions.map((value) => (
            <Pressable
              key={value}
              style={[
                styles.routeFareOption,
                value === selectedFare && styles.routeFareOptionActive,
              ]}
              onPress={() => {
                setSelectedFare(value);
                setFarePickerOpen(false);
              }}
            >
              <Text
                style={[
                  styles.routeFareOptionText,
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
