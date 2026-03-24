import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MapView, { AnimatedRegion, MarkerAnimated, Polygon, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Avatar } from '../components/ui';
import { DriverVehicleMarker } from '../components/maps/DriverVehicleMarker';
import { GeofenceViolationBanner } from '../components/maps/GeofenceViolationBanner';
import {
  OBRERO_GEOFENCE,
  dedupeSequentialPoints,
  distanceBetweenMeters,
  headingBetweenDeg,
  interpolatePoint,
  isPointInsidePolygon,
  LatLngPoint,
  shortestAngleDelta,
} from '../lib/mapTracking';

type SimulationScreenProps = {
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  onBack: () => void;
};

type DemoScenario = 'normal' | 'violation';

const ROAD_MATCH_API_BASE_URL =
  process.env.EXPO_PUBLIC_ROAD_MATCH_API_BASE_URL ?? 'https://router.project-osrm.org';
const SIMULATION_SPEED_METERS_PER_SECOND = 8.5;
const CAMERA_FOLLOW_INTERVAL_MS = 250;

const NORMAL_ROUTE_TEMPLATES: LatLngPoint[][] = [
  [
    { latitude: 7.08348, longitude: 125.61247 },
    { latitude: 7.08391, longitude: 125.61295 },
    { latitude: 7.08442, longitude: 125.61353 },
    { latitude: 7.08492, longitude: 125.61404 },
    { latitude: 7.08541, longitude: 125.61431 },
    { latitude: 7.08603, longitude: 125.61444 },
  ],
  [
    { latitude: 7.08355, longitude: 125.61258 },
    { latitude: 7.08396, longitude: 125.61302 },
    { latitude: 7.08436, longitude: 125.61347 },
    { latitude: 7.08482, longitude: 125.61393 },
    { latitude: 7.08526, longitude: 125.61422 },
    { latitude: 7.08574, longitude: 125.61439 },
  ],
  [
    { latitude: 7.08344, longitude: 125.61254 },
    { latitude: 7.08376, longitude: 125.61289 },
    { latitude: 7.08414, longitude: 125.6133 },
    { latitude: 7.08459, longitude: 125.61377 },
    { latitude: 7.08506, longitude: 125.61414 },
    { latitude: 7.08563, longitude: 125.61441 },
  ],
];

const VIOLATION_ROUTE_TEMPLATES: LatLngPoint[][] = [
  [
    { latitude: 7.08352, longitude: 125.61256 },
    { latitude: 7.08396, longitude: 125.61303 },
    { latitude: 7.08439, longitude: 125.61351 },
    { latitude: 7.08505, longitude: 125.61412 },
    { latitude: 7.08604, longitude: 125.61444 },
    { latitude: 7.08735, longitude: 125.61462 },
    { latitude: 7.08874, longitude: 125.61484 },
  ],
  [
    { latitude: 7.08346, longitude: 125.61248 },
    { latitude: 7.08383, longitude: 125.6129 },
    { latitude: 7.08427, longitude: 125.61339 },
    { latitude: 7.08489, longitude: 125.61401 },
    { latitude: 7.08575, longitude: 125.61436 },
    { latitude: 7.08681, longitude: 125.61456 },
    { latitude: 7.0881, longitude: 125.61473 },
  ],
];

const buildRandomSimulationWaypoints = (scenario: DemoScenario) => {
  const templates = scenario === 'violation' ? VIOLATION_ROUTE_TEMPLATES : NORMAL_ROUTE_TEMPLATES;
  const template =
    templates[Math.floor(Math.random() * templates.length)] ??
    templates[0] ??
    [];
  return scenario === 'normal' && Math.random() >= 0.5 ? [...template].reverse() : [...template];
};

const normalizeScenarioRoute = (points: LatLngPoint[], scenario: DemoScenario) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length === 0 || scenario !== 'violation') {
    return cleanPoints;
  }

  const firstInsideIndex = cleanPoints.findIndex((point) => isPointInsidePolygon(point, OBRERO_GEOFENCE));
  if (firstInsideIndex <= 0) {
    return cleanPoints;
  }

  return cleanPoints.slice(firstInsideIndex);
};

const fetchNearestRoadPoint = async (point: LatLngPoint) => {
  const url =
    `${ROAD_MATCH_API_BASE_URL}/nearest/v1/driving/${point.longitude},${point.latitude}` +
    '?number=1';
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as { waypoints?: Array<{ location?: [number, number] }> };
  const location = json.waypoints?.[0]?.location;
  if (!location || location.length < 2) {
    return null;
  }
  return { latitude: location[1], longitude: location[0] };
};

const fetchRoutedRoadPath = async (points: LatLngPoint[]) => {
  const snappedWaypoints = await Promise.all(
    dedupeSequentialPoints(points).map(async (point) => (await fetchNearestRoadPoint(point)) ?? point),
  );
  const cleanPoints = dedupeSequentialPoints(snappedWaypoints);
  if (cleanPoints.length < 2) {
    return null;
  }

  const coordinates = cleanPoints.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url =
    `${ROAD_MATCH_API_BASE_URL}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&steps=false&continue_straight=true';
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
  };
  const geometry = json.routes?.[0]?.geometry?.coordinates;
  if (!geometry || geometry.length < 2) {
    return null;
  }

  return dedupeSequentialPoints(
    geometry.map((point) => ({
      latitude: point[1],
      longitude: point[0],
    })),
  );
};

const getRouteRegion = (routePath: LatLngPoint[]) => {
  const allPoints = routePath.length > 0 ? [...routePath, ...OBRERO_GEOFENCE] : OBRERO_GEOFENCE;
  const lats = allPoints.map((point) => point.latitude);
  const lngs = allPoints.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.01),
  };
};

export function SimulationScreen({
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  onBack,
}: SimulationScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const markerCoordinate = useRef(
    new AnimatedRegion({
      latitude: OBRERO_GEOFENCE[0].latitude,
      longitude: OBRERO_GEOFENCE[0].longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;
  const animationFrameRef = useRef<number | null>(null);
  const cameraFollowTimestampRef = useRef(0);
  const hasEnteredGeofenceRef = useRef(false);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingAnimValue = useRef(0);
  const alertPulse = useRef(new Animated.Value(0)).current;
  const [routePath, setRoutePath] = useState<LatLngPoint[]>([]);
  const [travelPath, setTravelPath] = useState<LatLngPoint[]>([]);
  const [currentPoint, setCurrentPoint] = useState<LatLngPoint | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [cameraFollowEnabled, setCameraFollowEnabled] = useState(true);
  const [shouldTrackMarkerViewChanges, setShouldTrackMarkerViewChanges] = useState(true);
  const [scenario, setScenario] = useState<DemoScenario>('normal');
  const [isOutsideGeofence, setIsOutsideGeofence] = useState(false);
  const [hasViolationTriggered, setHasViolationTriggered] = useState(false);

  const routeRegion = useMemo(() => getRouteRegion(routePath), [routePath]);

  useEffect(() => {
    void prepareRoute();
  }, [scenario]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setShouldTrackMarkerViewChanges(true);
    const timeout = setTimeout(() => {
      setShouldTrackMarkerViewChanges(false);
    }, 1200);
    return () => clearTimeout(timeout);
  }, [profileImageUri, profileName, scenario, routePath.length]);

  useEffect(() => {
    if (!isSimulating) {
      return;
    }
    setShouldTrackMarkerViewChanges(true);
  }, [isSimulating]);

  useEffect(() => {
    if (!hasViolationTriggered) {
      alertPulse.stopAnimation();
      alertPulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(alertPulse, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(alertPulse, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
      alertPulse.stopAnimation();
    };
  }, [alertPulse, hasViolationTriggered]);

  const rotateVehicleTo = (nextHeading: number) => {
    const current = headingAnimValue.current;
    const delta = shortestAngleDelta(current, nextHeading);
    const target = current + delta;
    headingAnimValue.current = target;
    Animated.timing(headingAnim, {
      toValue: target,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const prepareRoute = async () => {
    setIsLoadingRoute(true);
    setIsSimulating(false);
    setHasViolationTriggered(false);
    setIsOutsideGeofence(false);
    hasEnteredGeofenceRef.current = false;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      const waypoints = buildRandomSimulationWaypoints(scenario);
      const routedPath = normalizeScenarioRoute(
        (await fetchRoutedRoadPath(waypoints)) ?? dedupeSequentialPoints(waypoints),
        scenario,
      );
      const firstPoint = routedPath[0] ?? OBRERO_GEOFENCE[0];
      const startsInsideGeofence = isPointInsidePolygon(firstPoint, OBRERO_GEOFENCE);

      setRoutePath(routedPath);
      setTravelPath(firstPoint ? [firstPoint] : []);
      setCurrentPoint(firstPoint);
      setIsOutsideGeofence(!startsInsideGeofence);
      hasEnteredGeofenceRef.current = startsInsideGeofence;
      markerCoordinate.setValue({
        latitude: firstPoint.latitude,
        longitude: firstPoint.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      headingAnim.setValue(0);
      headingAnimValue.current = 0;

      requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates([...OBRERO_GEOFENCE, ...routedPath], {
          edgePadding: { top: 120, right: 48, bottom: 260, left: 48 },
          animated: true,
        });
      });
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const startSimulation = () => {
    if (routePath.length < 2 || isSimulating) {
      return;
    }

    const segmentLengths = routePath.slice(1).map((point, index) => distanceBetweenMeters(routePath[index], point));
    const cumulativeMeters = routePath.reduce<number[]>((acc, point, index) => {
      if (index === 0) {
        return [0];
      }
      return [...acc, acc[index - 1] + segmentLengths[index - 1]];
    }, []);
    const totalMeters = cumulativeMeters[cumulativeMeters.length - 1] ?? 0;
    const startedAt = Date.now();

    setIsSimulating(true);
    setHasViolationTriggered(false);
    setTravelPath([routePath[0]]);

    const animate = () => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const travelledMeters = Math.min(elapsedSeconds * SIMULATION_SPEED_METERS_PER_SECOND, totalMeters);

      let segmentIndex = 0;
      while (
        segmentIndex < cumulativeMeters.length - 1 &&
        cumulativeMeters[segmentIndex + 1] < travelledMeters
      ) {
        segmentIndex += 1;
      }

      const fromPoint = routePath[segmentIndex] ?? routePath[routePath.length - 1];
      const toPoint = routePath[Math.min(segmentIndex + 1, routePath.length - 1)] ?? fromPoint;
      const segmentStart = cumulativeMeters[segmentIndex] ?? 0;
      const segmentEnd = cumulativeMeters[Math.min(segmentIndex + 1, cumulativeMeters.length - 1)] ?? segmentStart;
      const segmentDistance = Math.max(segmentEnd - segmentStart, 0.0001);
      const progress = Math.max(0, Math.min((travelledMeters - segmentStart) / segmentDistance, 1));
      const interpolatedPoint = interpolatePoint(fromPoint, toPoint, progress);
      rotateVehicleTo(headingBetweenDeg(fromPoint, toPoint));

      markerCoordinate.setValue({
        latitude: interpolatedPoint.latitude,
        longitude: interpolatedPoint.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      setCurrentPoint(interpolatedPoint);
      setTravelPath([...routePath.slice(0, segmentIndex + 1), interpolatedPoint]);
      const insideGeofence = isPointInsidePolygon(interpolatedPoint, OBRERO_GEOFENCE);
      if (insideGeofence) {
        hasEnteredGeofenceRef.current = true;
      }
      const outside = !insideGeofence;
      setIsOutsideGeofence(outside);
      if (scenario === 'violation' && outside && hasEnteredGeofenceRef.current) {
        setHasViolationTriggered(true);
      }

      if (cameraFollowEnabled && Date.now() - cameraFollowTimestampRef.current >= CAMERA_FOLLOW_INTERVAL_MS) {
        cameraFollowTimestampRef.current = Date.now();
        mapRef.current?.animateCamera(
          {
            center: interpolatedPoint,
            zoom: 18,
            pitch: 0,
            heading: 0,
          },
          { duration: CAMERA_FOLLOW_INTERVAL_MS },
        );
      }

      if (travelledMeters >= totalMeters) {
        setIsSimulating(false);
        animationFrameRef.current = null;
        setTravelPath(routePath);
        setCurrentPoint(routePath[routePath.length - 1] ?? interpolatedPoint);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const stopSimulation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsSimulating(false);
    hasEnteredGeofenceRef.current = false;
  };

  const alertScale = alertPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const alertOpacity = alertPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });

  return (
    <View style={styles.screen}>
      <MapView
        ref={(ref) => {
          mapRef.current = ref;
        }}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={routeRegion}
        showsUserLocation={false}
        followsUserLocation={false}
        showsMyLocationButton={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <Polygon
          coordinates={OBRERO_GEOFENCE}
          strokeColor={hasViolationTriggered ? '#EF4444' : '#5A67D8'}
          fillColor={hasViolationTriggered ? 'rgba(239,68,68,0.08)' : 'rgba(90,103,216,0.05)'}
          strokeWidth={2}
        />
        {routePath.length > 1 ? (
          <Polyline
            coordinates={routePath}
            strokeColor="rgba(45,125,246,0.22)"
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        {travelPath.length > 1 ? (
          <Polyline
            coordinates={travelPath}
            strokeColor="#2D7DF6"
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}
        {currentPoint ? (
          <MarkerAnimated
            coordinate={markerCoordinate as any}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            tracksViewChanges={Platform.OS === 'android' ? true : shouldTrackMarkerViewChanges || isSimulating}
          >
            <DriverVehicleMarker
              heading={headingAnim.interpolate({
                inputRange: [-360, 360],
                outputRange: ['-360deg', '360deg'],
              })}
            />
          </MarkerAnimated>
        ) : null}
      </MapView>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Feather name="chevron-left" size={20} color="#0F172A" />
      </Pressable>

      <View style={styles.topCard}>
        <Text style={styles.topTitle}>Simulation Mode</Text>
        <Text style={styles.topSubtitle}>Demo-only road animation. No live GPS is used here.</Text>
      </View>

      {hasViolationTriggered ? (
        <GeofenceViolationBanner
          opacity={alertOpacity}
          scale={alertScale}
          message="The demo driver has crossed outside the geofence boundary."
        />
      ) : null}

      <View style={styles.bottomCard}>
        <View style={styles.profileRow}>
          <Avatar name={profileName} imageUri={profileImageUri} style={styles.profileAvatar} />
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileMeta}>
              {profileDriverCode} {'\u2022'} {profilePlateNumber}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusText}>
            {isLoadingRoute
              ? 'Preparing road demo route...'
              : hasViolationTriggered
                ? 'Violation alert is active'
                : isOutsideGeofence
                  ? 'Driver is currently outside the geofence'
                  : isSimulating
                    ? 'Simulation running smoothly'
                    : 'Ready for demo'}
          </Text>
          <Pressable style={styles.followToggle} onPress={() => setCameraFollowEnabled((prev) => !prev)}>
            <Feather name={cameraFollowEnabled ? 'navigation' : 'map'} size={14} color="#0F172A" />
            <Text style={styles.followToggleText}>{cameraFollowEnabled ? 'Follow On' : 'Follow Off'}</Text>
          </Pressable>
        </View>

        <View style={styles.scenarioRow}>
          <Pressable
            style={[styles.scenarioChip, scenario === 'normal' && styles.scenarioChipActive]}
            onPress={() => setScenario('normal')}
          >
            <Feather name="check-circle" size={14} color={scenario === 'normal' ? '#FFFFFF' : '#0F172A'} />
            <Text style={[styles.scenarioChipText, scenario === 'normal' && styles.scenarioChipTextActive]}>
              Normal Trip
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.scenarioChip,
              styles.violationChip,
              scenario === 'violation' && styles.violationChipActive,
            ]}
            onPress={() => setScenario('violation')}
          >
            <Feather name="alert-triangle" size={14} color={scenario === 'violation' ? '#FFFFFF' : '#B91C1C'} />
            <Text
              style={[
                styles.scenarioChipText,
                styles.violationChipText,
                scenario === 'violation' && styles.scenarioChipTextActive,
              ]}
            >
              Violation Scenario
            </Text>
          </Pressable>
        </View>

        {isLoadingRoute ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#2D7DF6" />
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <Pressable style={[styles.actionButton, styles.secondaryButton]} onPress={() => void prepareRoute()}>
            <Text style={styles.secondaryButtonText}>Shuffle Route</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={isSimulating ? stopSimulation : startSimulation}
            disabled={isLoadingRoute || routePath.length < 2}
          >
            <Text style={styles.actionButtonText}>{isSimulating ? 'Stop Demo' : 'Start Simulation'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  backButton: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topCard: {
    position: 'absolute',
    top: 52,
    left: 72,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topTitle: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 16,
    color: '#0F172A',
  },
  topSubtitle: {
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#475569',
  },
  violationBanner: {
    position: 'absolute',
    top: 132,
    left: 16,
    right: 16,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(220,38,38,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.9)',
  },
  violationDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  violationTitle: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 15,
    color: '#FFFFFF',
  },
  violationText: {
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#FEE2E2',
  },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  profileTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  profileName: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 18,
    color: '#0F172A',
  },
  profileMeta: {
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#475569',
  },
  scenarioRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  scenarioChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
  },
  scenarioChipActive: {
    backgroundColor: '#2D7DF6',
  },
  scenarioChipText: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#0F172A',
  },
  scenarioChipTextActive: {
    color: '#FFFFFF',
  },
  violationChip: {
    backgroundColor: '#FEE2E2',
  },
  violationChipActive: {
    backgroundColor: '#DC2626',
  },
  violationChipText: {
    color: '#B91C1C',
  },
  statusRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusText: {
    flex: 1,
    fontFamily: 'CircularStdMedium500',
    fontSize: 13,
    color: '#334155',
  },
  followToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  followToggleText: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 12,
    color: '#0F172A',
  },
  loadingWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  buttonRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D7DF6',
  },
  actionButtonText: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 14,
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: '#E2E8F0',
  },
  secondaryButtonText: {
    fontFamily: 'CircularStdMedium500',
    fontSize: 14,
    color: '#0F172A',
  },
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleMarkerShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleMarker: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2D7DF6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  driverBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  markerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  markerPointer: {
    width: 14,
    height: 14,
    backgroundColor: '#2D7DF6',
    transform: [{ rotate: '45deg' }],
    marginTop: -6,
  },
  markerPulse: {
    width: 24,
    height: 8,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: 'rgba(45,125,246,0.16)',
  },
});
