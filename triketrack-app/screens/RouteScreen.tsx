import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { AppleMapPinMarker } from '../components/maps/AppleMapPinMarker';
import { AppIcon } from '../components/ui';

type RouteScreenProps = {
  onNavigate?: (tab: BottomTab) => void;
  locationEnabled: boolean;
  onEnableLocation: () => void;
  onTripComplete: (fare: number) => void;
  styles: Record<string, any>;
};

const OBRERO_GEOFENCE = [
  { latitude: 7.0849408, longitude: 125.6121403 }, // 1) McDonald's Davao Bajada (Lacson St)
  { latitude: 7.0861485, longitude: 125.6130254 }, // 2) San Roque Central Elementary School
  { latitude: 7.09253, longitude: 125.61713 }, // 3) Queensland Hotel Davao (Dacudao area)
  { latitude: 7.0832297, longitude: 125.6242034 }, // 4) AUB Agdao
  { latitude: 7.0771506, longitude: 125.6170807 }, // 5) Sta. Ana Shrine Parish Church
  { latitude: 7.0776251, longitude: 125.6141467 }, // 6) Gaisano Mall of Davao
  { latitude: 7.0835656, longitude: 125.6126754 }, // 7) Bajada Suites
];

const isPointInsidePolygon = (
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>,
) => {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

export function RouteScreen({
  onNavigate,
  locationEnabled,
  onEnableLocation,
  onTripComplete,
  styles,
}: RouteScreenProps) {
  const [showEnableScreen, setShowEnableScreen] = useState(!locationEnabled);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [hasCentered, setHasCentered] = useState(false);
  const [farePickerOpen, setFarePickerOpen] = useState(false);
  const [selectedFare, setSelectedFare] = useState(10);
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [isInsideGeofence, setIsInsideGeofence] = useState(true);
  const [lastTrackPoint, setLastTrackPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const hasShownExitAlert = useRef(false);
  const fareOptions = [10, 20, 30, 40, 50];

  const fallbackCenter = {
    latitude: 7.0731,
    longitude: 125.6128,
  };

  const handleEnableLocation = () => {
    Alert.alert(
      'Enable Location',
      'Allow location access and continue to map view?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            onEnableLocation();
            setShowEnableScreen(false);
            setHasCentered(false);
          },
        },
      ],
      { cancelable: true },
    );
  };

  const toRad = (value: number) => (value * Math.PI) / 180;

  const distanceBetweenKm = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    const earthRadiusKm = 6371;
    const dLat = toRad(to.latitude - from.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  useEffect(() => {
    if (!isTripStarted) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTripStarted]);

  const minutesText = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const kmText = distanceKm.toFixed(2);

  const handleTripButtonPress = () => {
    if (!isTripStarted) {
      setIsTripStarted(true);
      setElapsedSeconds(0);
      setDistanceKm(0);
      setLastTrackPoint(coords ?? fallbackCenter);
      return;
    }

    setIsTripStarted(false);
    setLastTrackPoint(null);
    setElapsedSeconds(0);
    setDistanceKm(0);
    onTripComplete(selectedFare);
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        {showEnableScreen ? (
          <View style={styles.routeScreenContainer}>
            <View style={styles.routeMapBackground}>
              <View style={[styles.routeMapLine, styles.routeMapLineA]} />
              <View style={[styles.routeMapLine, styles.routeMapLineB]} />
              <View style={[styles.routeMapLine, styles.routeMapLineC]} />
              <View style={[styles.routeMapLine, styles.routeMapLineD]} />
              <View style={[styles.routeMapCircle, styles.routeMapCircleA]} />
              <View style={[styles.routeMapCircle, styles.routeMapCircleB]} />
            </View>

            <View style={styles.routeScreenBody}>
              <View style={styles.routePinWrap}>
                <AppIcon name="map-pin" size={44} color="#57c7a8" />
              </View>

              <Text style={styles.routeTitle}>Enable Location</Text>
              <Text style={styles.routeSubtitle}>Enable location service to use your route tracking easily</Text>
            </View>

            <Pressable style={styles.routeEnableButton} onPress={handleEnableLocation}>
              <Text style={styles.routeEnableButtonText}>Enable Location</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.routeMapScreen}>
            <Pressable style={styles.routeBackButton} onPress={() => setShowEnableScreen(true)}>
              <AppIcon name="chevron-left" size={20} color="#030318" />
            </Pressable>

            <MapView
              ref={(ref) => {
                mapRef.current = ref;
              }}
              style={styles.routeMap}
              initialRegion={{
                latitude: (coords ?? fallbackCenter).latitude,
                longitude: (coords ?? fallbackCenter).longitude,
                latitudeDelta: 0.022,
                longitudeDelta: 0.022,
              }}
              showsUserLocation
              followsUserLocation
              showsMyLocationButton
              onUserLocationChange={(event) => {
                const coordinate = event.nativeEvent.coordinate;
                if (!coordinate) {
                  return;
                }

                const next = {
                  latitude: coordinate.latitude,
                  longitude: coordinate.longitude,
                };

                setCoords(next);
                const insideBoundary = isPointInsidePolygon(next, OBRERO_GEOFENCE);
                setIsInsideGeofence(insideBoundary);

                if (isTripStarted && lastTrackPoint) {
                  const movedKm = distanceBetweenKm(lastTrackPoint, next);
                  // Ignore GPS jitter; count movement after at least ~4 meters.
                  if (movedKm >= 0.004) {
                    setDistanceKm((prev) => prev + movedKm);
                    setLastTrackPoint(next);
                  }
                }
                if (isTripStarted && !insideBoundary && !hasShownExitAlert.current) {
                  hasShownExitAlert.current = true;
                  Alert.alert(
                    'Geofence Alert',
                    'You are outside the Obrero geofence boundary.',
                  );
                }
                if (insideBoundary) {
                  hasShownExitAlert.current = false;
                }

                if (!hasCentered && mapRef.current) {
                  mapRef.current.animateToRegion(
                    {
                      ...next,
                      latitudeDelta: 0.012,
                      longitudeDelta: 0.012,
                    },
                    500,
                  );
                  setHasCentered(true);
                }
              }}
            >
              <Polygon
                coordinates={OBRERO_GEOFENCE}
                strokeColor="#5A67D8"
                fillColor="rgba(90,103,216,0.04)"
                strokeWidth={2}
              />
              {coords ? (
                <Marker
                  coordinate={coords}
                  title="Your Location"
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges
                >
                  <AppleMapPinMarker color="#38BDF8" iconName="radio" size="md" />
                </Marker>
              ) : null}
            </MapView>

            <View style={styles.routeTripPanel}>
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
                <View style={styles.routeTripStatsRow}>
                  <View style={styles.routeTripStatPill}>
                    <Text style={styles.routeTripStatValue}>{minutesText}</Text>
                    <Text style={styles.routeTripStatLabel}>mins</Text>
                  </View>
                  <View style={styles.routeTripStatPill}>
                    <Text style={styles.routeTripStatValue}>{kmText}</Text>
                    <Text style={styles.routeTripStatLabel}>km</Text>
                  </View>
                <Pressable style={styles.routeTripStatPill} onPress={() => setFarePickerOpen((prev) => !prev)}>
                  <Text style={styles.routeTripStatValue}>₱{selectedFare}</Text>
                  <Text style={styles.routeTripStatLabel}>fare</Text>
                </Pressable>
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
                        ₱{value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable style={styles.routeStartTripButton} onPress={handleTripButtonPress}>
                <Text style={styles.routeStartTripText}>{isTripStarted ? 'End Trip' : 'Start Trip'}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <HomeNavigationCard activeTab="route" onNavigate={onNavigate} styles={styles} />
    </View>
  );
}
