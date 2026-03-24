import { Pressable, Text, View } from 'react-native';

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
}: StartTripPanelProps) {
  return (
    <View style={[styles.routeTripPanel, { bottom: 104 + (insetsBottom || 0) }]}>
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
        <Text style={localStyles.navigationMetaText}>Auto-reroute on</Text>
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

      {enableTripSimulation && !isTripStarted ? (
        <Pressable
          style={[styles.routeStartTripButton, localStyles.simulationButton]}
          onPress={onOpenSimulation}
        >
          <Text style={styles.routeStartTripText}>Start Simulation</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.routeStartTripButton} onPress={onTripButtonPress}>
        <Text style={styles.routeStartTripText}>{isTripStarted ? 'End Trip' : 'Start Trip'}</Text>
      </Pressable>
    </View>
  );
}
