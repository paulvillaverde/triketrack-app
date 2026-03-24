import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MapView, {
  AnimatedRegion,
  Circle,
  MarkerAnimated,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { HomeDashboardSheet } from '../components/home/HomeDashboardSheet';
import { StartTripPanel } from '../components/home/StartTripPanel';
import { DriverAvatarMarker } from '../components/maps/DriverAvatarMarker';
import { GeofenceViolationBanner } from '../components/maps/GeofenceViolationBanner';
import { OutsideGeofenceModal } from '../components/modals';
import { getMotionDurationMs, shortestAngleDelta } from '../lib/mapTracking';
import {
  dedupeSequentialPoints,
  fetchMatchedRoadPath,
  fetchNearestRoadPoint,
  fetchRoutedRoadPath,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from '../lib/roadPath';
import { startLiveGpsTracker } from '../lib/liveGpsTracker';
import {
  averagePoints,
  buildRandomSimulationWaypoints,
  COARSE_FIRST_FIX_ACCURACY_METERS,
  DARK_MAP_STYLE,
  ENABLE_TRIP_SIMULATION,
  FAST_START_REQUIRED_ACCURACY_METERS,
  formatPeso,
  HIGH_CONFIDENCE_ACCURACY_METERS,
  INITIAL_LOCATION_TIMEOUT_MS,
  INITIAL_VISIBLE_ACCURACY_METERS,
  isPointInsidePolygon,
  isValidCoordinate,
  LAST_KNOWN_MAX_AGE_MS,
  LAST_KNOWN_REQUIRED_ACCURACY_METERS,
  MAP_TYPE_OPTIONS,
  MAX_ACCEPTED_ACCURACY_METERS,
  MAX_ACCEPTED_SPEED_KMH,
  MAX_LOCATION_JUMP_KM,
  MAX_POINT_GAP_KM,
  MAX_STATIONARY_SPEED_KMH,
  mergeRouteSegment,
  MIN_ROAD_MATCH_POINTS,
  MIN_SNAPPED_MOVE_KM,
  MIN_TRACK_MOVE_KM,
  MOVEMENT_CONFIRMATION_COUNT,
  NORMAL_CAMERA,
  OBRERO_GEOFENCE,
  ROAD_MATCH_BATCH_SIZE,
  type MapTypeOption,
  TRIP_CAMERA_FOLLOW_INTERVAL_MS,
  WATCH_LOCATION_INTERVAL_MS,
} from './homeScreenShared';

export type { MapTypeOption } from './homeScreenShared';

type HomeScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  isTripScreen: boolean;
  isDriverOnline: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onBackToHome: () => void;
  onOpenSimulation?: () => void;
  locationEnabled: boolean;
  tripOpenPending?: boolean;
  onLocationVisibilityChange?: (visible: boolean) => void;
  onTripComplete: (payload: {
    fare: number;
    distanceKm: number;
    durationSeconds: number;
    routePath: Array<{ latitude: number; longitude: number }>;
    endLocation: { latitude: number; longitude: number } | null;
  }) => void;
  onTripStart?: (payload: { startLocation: { latitude: number; longitude: number } | null }) => void;
  onTripPointRecord?: (payload: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  }) => void;
  onGeofenceExit?: (payload: { location: { latitude: number; longitude: number } | null }) => void;
  totalEarnings: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalMinutes: number;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  mapTypeOption: MapTypeOption;
  onChangeMapTypeOption: (value: MapTypeOption) => void;
  styles: Record<string, any>;
};


export function HomeScreen({
  onLogout,
  onNavigate,
  isTripScreen,
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  onBackToHome,
  onOpenSimulation,
  locationEnabled,
  tripOpenPending = false,
  onLocationVisibilityChange,
  onTripComplete,
  onTripStart,
  onTripPointRecord,
  onGeofenceExit,
  totalEarnings,
  totalTrips,
  totalDistanceKm,
  totalMinutes,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  mapTypeOption,
  onChangeMapTypeOption,
  styles,
}: HomeScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const [hasCentered, setHasCentered] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [farePickerOpen, setFarePickerOpen] = useState(false);
  const [showOutsideGeofenceModal, setShowOutsideGeofenceModal] = useState(false);
  const [selectedFare, setSelectedFare] = useState(10);
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [isSimulatingTrip, setIsSimulatingTrip] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [isResolvingAccurateLocation, setIsResolvingAccurateLocation] = useState(false);
  const [shouldTrackMarkerViewChanges, setShouldTrackMarkerViewChanges] = useState(true);
  const [displayAccuracyMeters, setDisplayAccuracyMeters] = useState<number | null>(null);
  const [firstFixDurationMs, setFirstFixDurationMs] = useState<number | null>(null);
  const [lastLocationTimestampMs, setLastLocationTimestampMs] = useState<number | null>(null);
  const [locationFreshnessSeconds, setLocationFreshnessSeconds] = useState(0);
  const [lastTrackPoint, setLastTrackPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [travelPath, setTravelPath] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [startConnectorPoints, setStartConnectorPoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isInsideGeofence, setIsInsideGeofence] = useState(true);
  const [hasGeofenceViolation, setHasGeofenceViolation] = useState(false);
  const [headingDeg, setHeadingDeg] = useState(0);
  const isTripStartedRef = useRef(isTripStarted);
  const hasCenteredRef = useRef(hasCentered);
  const lastTrackPointRef = useRef(lastTrackPoint);
  const lastRawTrackPointRef = useRef<LatLngPoint | null>(null);
  const pendingRawPointsRef = useRef<LatLngPoint[]>([]);
  const recentAcceptedPointsRef = useRef<LatLngPoint[]>([]);
  const routePointsRef = useRef<Array<LatLngPoint>>([]);
  const travelPathRef = useRef<Array<LatLngPoint>>([]);
  const locationWatchRef = useRef<{ stop: () => void } | null>(null);
  const roadSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const snappedCoordsRef = useRef<LatLngPoint | null>(null);
  const simulationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simulationPointsRef = useRef<LatLngPoint[]>([]);
  const latestActualCoordsRef = useRef<LatLngPoint | null>(null);
  const lastCameraFollowAtRef = useRef(0);
  const markerInitializedRef = useRef(false);
  const hasShownExitAlert = useRef(false);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingAnimValue = useRef(0);
  const alertPulse = useRef(new Animated.Value(0)).current;
  const liveHeadingRef = useRef<number | null>(null);
  const lastTrackTimestampMsRef = useRef<number | null>(null);
  const lastAcceptedSampleRef = useRef<{ point: LatLngPoint; timestampMs: number } | null>(null);
  const isSimulatingTripRef = useRef(isSimulatingTrip);
  const fareOptions = [10, 20, 30, 40, 50, 60, 70];
  const animatedMarkerCoordinate = useRef(
    new AnimatedRegion({
      latitude: OBRERO_GEOFENCE[0].latitude,
      longitude: OBRERO_GEOFENCE[0].longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;
  const lastAnimatedMarkerPointRef = useRef<LatLngPoint | null>(null);
  const firstFixStartedAtRef = useRef<number | null>(null);
  const firstFixCapturedRef = useRef(false);
  const hasLoggedLowAccuracyRef = useRef(false);
  const hasLoggedInvalidSampleRef = useRef(false);
  const hasLoggedJumpSampleRef = useRef(false);
  const lastDisplayPointRef = useRef<LatLngPoint | null>(null);
  const movementConfirmationCountRef = useRef(0);

  const isDarkMap = mapTypeOption === 'dark';
  const activeMapType: 'standard' | 'satellite' = mapTypeOption === 'satellite' ? 'satellite' : 'standard';
  const hasValidCoords = isValidCoordinate(coords);
  const isNetworkAvailable = Boolean(netInfo.isConnected && netInfo.isInternetReachable !== false);

  const mapTypeLabel = (value: MapTypeOption) => {
    if (value === 'satellite') return 'Satellite';
    if (value === 'dark') return 'Dark';
    return 'Default';
  };

  const nextMapTypeOption = (value: MapTypeOption) => {
    const idx = MAP_TYPE_OPTIONS.indexOf(value);
    const nextIdx = idx >= 0 ? (idx + 1) % MAP_TYPE_OPTIONS.length : 0;
    return MAP_TYPE_OPTIONS[nextIdx] ?? 'default';
  };
  const geofenceStrokeColor = isDarkMap ? '#A3E635' : '#5A67D8';
  const geofenceFillColor = isDarkMap ? 'rgba(163,230,53,0.10)' : 'rgba(90,103,216,0.04)';

  useEffect(() => {
    isTripStartedRef.current = isTripStarted;
  }, [isTripStarted]);

  useEffect(() => {
    isSimulatingTripRef.current = isSimulatingTrip;
  }, [isSimulatingTrip]);

  useEffect(() => {
    hasCenteredRef.current = hasCentered;
  }, [hasCentered]);

  useEffect(() => {
    lastTrackPointRef.current = lastTrackPoint;
  }, [lastTrackPoint]);

  useEffect(() => {
    routePointsRef.current = routePoints;
  }, [routePoints]);

  useEffect(() => {
    travelPathRef.current = travelPath;
  }, [travelPath]);

  useEffect(() => {
    if (travelPath.length > 0 && startConnectorPoints.length > 0) {
      setStartConnectorPoints([]);
    }
  }, [travelPath.length, startConnectorPoints.length]);

  useEffect(() => {
    snappedCoordsRef.current = coords;
    lastDisplayPointRef.current = coords;
  }, [coords]);

  useEffect(() => {
    onLocationVisibilityChange?.(hasValidCoords);
  }, [hasValidCoords, onLocationVisibilityChange]);

  useEffect(() => {
    setShouldTrackMarkerViewChanges(true);
    const timeout = setTimeout(() => {
      setShouldTrackMarkerViewChanges(false);
    }, 1800);

    return () => clearTimeout(timeout);
  }, [profileImageUri, profileName]);

  useEffect(() => {
    if (!hasValidCoords) {
      return;
    }

    console.info('[HomeScreen] Rendering driver marker at', coords);
    setShouldTrackMarkerViewChanges(true);
    const timeout = setTimeout(() => {
      setShouldTrackMarkerViewChanges(false);
    }, 1800);

    return () => clearTimeout(timeout);
  }, [coords, hasValidCoords]);

  useEffect(() => {
    if (!hasValidCoords) {
      markerInitializedRef.current = false;
      lastAnimatedMarkerPointRef.current = null;
      return;
    }

    const nextCoordinate = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
    const animationDuration = getMotionDurationMs({
      from: lastAnimatedMarkerPointRef.current,
      to: nextCoordinate,
      speedMetersPerSecond: speedKmh > 0 ? speedKmh / 3.6 : null,
    });

    if (!markerInitializedRef.current) {
      markerInitializedRef.current = true;
      animatedMarkerCoordinate.setValue({
        ...nextCoordinate,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      lastAnimatedMarkerPointRef.current = nextCoordinate;
      return;
    }

    animatedMarkerCoordinate
      .timing({
        ...nextCoordinate,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: animationDuration,
        useNativeDriver: false,
      } as any)
      .start();
    lastAnimatedMarkerPointRef.current = nextCoordinate;
  }, [animatedMarkerCoordinate, coords, hasValidCoords]);

  useEffect(() => {
    if (!locationEnabled) {
      setIsResolvingAccurateLocation(false);
      setCoords(null);
      setDisplayAccuracyMeters(null);
      setFirstFixDurationMs(null);
      setLastLocationTimestampMs(null);
      setLocationFreshnessSeconds(0);
      setHasGeofenceViolation(false);
      firstFixStartedAtRef.current = null;
      firstFixCapturedRef.current = false;
      lastCameraFollowAtRef.current = 0;
      recentAcceptedPointsRef.current = [];
      lastAcceptedSampleRef.current = null;
      movementConfirmationCountRef.current = 0;
      lastDisplayPointRef.current = null;
      hasLoggedLowAccuracyRef.current = false;
      hasLoggedInvalidSampleRef.current = false;
      hasLoggedJumpSampleRef.current = false;
    }
  }, [locationEnabled]);

  useEffect(() => {
    if (!lastLocationTimestampMs) {
      setLocationFreshnessSeconds(0);
      return;
    }

    const updateFreshness = () => {
      setLocationFreshnessSeconds(Math.max(0, Math.floor((Date.now() - lastLocationTimestampMs) / 1000)));
    };

    updateFreshness();
    const timer = setInterval(updateFreshness, 1000);
    return () => clearInterval(timer);
  }, [lastLocationTimestampMs]);

  const fallbackCenter = {
    latitude: 7.0849408,
    longitude: 125.6121403,
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

  useEffect(() => {
    if (!isTripScreen) {
      if (simulationTimeoutRef.current) {
        clearTimeout(simulationTimeoutRef.current);
        simulationTimeoutRef.current = null;
      }
      setIsSimulatingTrip(false);
      setIsTripStarted(false);
      setElapsedSeconds(0);
      setDistanceKm(0);
      setSpeedKmh(0);
      setLastTrackPoint(null);
      setRoutePoints([]);
      setTravelPath([]);
      setStartConnectorPoints([]);
      lastTrackPointRef.current = null;
      lastRawTrackPointRef.current = null;
      pendingRawPointsRef.current = [];
      routePointsRef.current = [];
      travelPathRef.current = [];
      roadSnapQueueRef.current = Promise.resolve();
      setHeadingDeg(0);
      headingAnimValue.current = 0;
      headingAnim.setValue(0);
      setIsResolvingAccurateLocation(false);
      setDisplayAccuracyMeters(null);
      recentAcceptedPointsRef.current = [];
      lastAcceptedSampleRef.current = null;
      movementConfirmationCountRef.current = 0;
      lastDisplayPointRef.current = null;
      simulationPointsRef.current = [];
      setFarePickerOpen(false);
      lastTrackTimestampMsRef.current = null;
      setHasCentered(false);
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(OBRERO_GEOFENCE, {
          edgePadding: { top: 70, right: 50, bottom: 170, left: 50 },
          animated: true,
        });
      }
    }
  }, [isTripScreen]);

  useEffect(() => {
    return () => {
      if (simulationTimeoutRef.current) {
        clearTimeout(simulationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTripScreen || !mapRef.current || isTripStarted) {
      return;
    }
    if (hasValidCoords) {
      mapRef.current.animateCamera(
        {
          center: coords,
          zoom: 17,
          heading: 0,
          pitch: 0,
        },
        { duration: 450 },
      );
      hasCenteredRef.current = true;
      setHasCentered(true);
      return;
    }

    mapRef.current.fitToCoordinates(OBRERO_GEOFENCE, {
      edgePadding: { top: 110, right: 52, bottom: 260, left: 52 },
      animated: true,
    });
    hasCenteredRef.current = false;
    setHasCentered(false);
  }, [coords, hasValidCoords, isTripScreen, isTripStarted]);

  useEffect(() => {
    const nextHeading = ((headingDeg % 360) + 360) % 360;
    const current = headingAnimValue.current;
    let delta = nextHeading - current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const target = current + delta;
    headingAnimValue.current = target;
    Animated.timing(headingAnim, {
      toValue: target,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headingDeg, headingAnim]);

  useEffect(() => {
    if (!hasGeofenceViolation) {
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
  }, [alertPulse, hasGeofenceViolation]);

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
  const headingBetweenDeg = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const appendRouteSegment = (segment: LatLngPoint[]) => {
    const mergedRaw = mergeRouteSegment(routePointsRef.current, segment);
    routePointsRef.current = mergedRaw;
    const smoothedDisplayPath = smoothDisplayedRoutePath(mergedRaw);
    travelPathRef.current = smoothedDisplayPath;
    setRoutePoints(mergedRaw);
    setTravelPath(smoothedDisplayPath);
  };

  const setSimulationRouteProgress = (points: LatLngPoint[]) => {
    const dedupedPoints = dedupeSequentialPoints(points);
    const smoothedDisplayPath = smoothDisplayedRoutePath(dedupedPoints);
    routePointsRef.current = dedupedPoints;
    travelPathRef.current = smoothedDisplayPath;
    setRoutePoints(dedupedPoints);
    setTravelPath(smoothedDisplayPath);
    const latestPoint = smoothedDisplayPath[smoothedDisplayPath.length - 1] ?? dedupedPoints[dedupedPoints.length - 1] ?? null;
    lastTrackPointRef.current = latestPoint;
    setLastTrackPoint(latestPoint);
    snappedCoordsRef.current = latestPoint;
    if (latestPoint) {
      setCoords(latestPoint);
    }
  };

  const updateMarkerPosition = (point: LatLngPoint) => {
    setCoords((prev) => {
      if (prev && distanceBetweenKm(prev, point) < 0.0015 && !isTripStartedRef.current) {
        return prev;
      }
      return point;
    });
  };

  const getStabilizedPoint = ({
    point,
    accuracy,
  }: {
    point: LatLngPoint;
    accuracy?: number | null;
  }) => {
    const previousAccepted = lastAcceptedSampleRef.current?.point ?? null;
    if (!previousAccepted) {
      recentAcceptedPointsRef.current = [point];
      return point;
    }

    const movedKm = distanceBetweenKm(previousAccepted, point);
    if (movedKm >= 0.02) {
      recentAcceptedPointsRef.current = [point];
      return point;
    }

    const blendFactor =
      typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? accuracy <= HIGH_CONFIDENCE_ACCURACY_METERS
          ? 0.9
          : accuracy <= MAX_ACCEPTED_ACCURACY_METERS
            ? 0.72
            : 0.55
        : 0.7;

    const stabilizedPoint = {
      latitude: previousAccepted.latitude + (point.latitude - previousAccepted.latitude) * blendFactor,
      longitude: previousAccepted.longitude + (point.longitude - previousAccepted.longitude) * blendFactor,
    };
    recentAcceptedPointsRef.current = [stabilizedPoint];
    return stabilizedPoint;
  };

  const seedVisibleLocation = ({
    latitude,
    longitude,
    accuracy,
    timestampMs,
  }: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    timestampMs?: number | null;
  }) => {
    const provisionalPoint = { latitude, longitude };
    if (!isValidCoordinate(provisionalPoint)) {
      if (!hasLoggedInvalidSampleRef.current) {
        hasLoggedInvalidSampleRef.current = true;
        console.warn('[HomeScreen] Ignored invalid seeded location.', {
          latitude,
          longitude,
          accuracy,
          timestampMs,
        });
      }
      return;
    }
    latestActualCoordsRef.current = provisionalPoint;
    if (isSimulatingTripRef.current) {
      return;
    }
    console.info('[HomeScreen] Seeded visible location.', {
      latitude,
      longitude,
      accuracy,
      timestampMs,
    });
    updateMarkerPosition(provisionalPoint);
    setIsResolvingAccurateLocation(false);
    setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
    setLastLocationTimestampMs(timestampMs ?? Date.now());
    if (!firstFixCapturedRef.current && firstFixStartedAtRef.current) {
      firstFixCapturedRef.current = true;
      setFirstFixDurationMs(Date.now() - firstFixStartedAtRef.current);
    }
    if (mapRef.current && !hasCenteredRef.current) {
      mapRef.current.animateCamera(
        {
          center: provisionalPoint,
          zoom: isTripScreen ? 18 : 16,
          heading: 0,
          pitch: 0,
        },
        { duration: 450 },
      );
      hasCenteredRef.current = true;
      setHasCentered(true);
    }
  };

  const acceptLocationSample = ({
    latitude,
    longitude,
    accuracy,
    heading,
    speed,
    timestampMs,
  }: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    timestampMs?: number;
  }) => {
    const sampleTimestampMs = timestampMs ?? Date.now();
    const previousAccepted = lastAcceptedSampleRef.current;
    const accuracyLimit = previousAccepted
      ? MAX_ACCEPTED_ACCURACY_METERS
      : INITIAL_VISIBLE_ACCURACY_METERS;
    if (
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy > accuracyLimit
    ) {
      if (
        !lastAcceptedSampleRef.current &&
        !hasValidCoords &&
        accuracy <= COARSE_FIRST_FIX_ACCURACY_METERS
      ) {
        seedVisibleLocation({
          latitude,
          longitude,
          accuracy,
          timestampMs: sampleTimestampMs,
        });
      } else if (!hasLoggedLowAccuracyRef.current) {
        hasLoggedLowAccuracyRef.current = true;
        console.warn('[HomeScreen] Rejected low-accuracy GPS sample.', {
          latitude,
          longitude,
          accuracy,
          accuracyLimit,
        });
      }
      return false;
    }
    hasLoggedLowAccuracyRef.current = false;

    const rawPoint = { latitude, longitude };
    if (!isValidCoordinate(rawPoint)) {
      if (!hasLoggedInvalidSampleRef.current) {
        hasLoggedInvalidSampleRef.current = true;
        console.warn('[HomeScreen] Rejected invalid GPS sample.', {
          latitude,
          longitude,
          accuracy,
          timestampMs: sampleTimestampMs,
        });
      }
      return false;
    }
    hasLoggedInvalidSampleRef.current = false;
    if (previousAccepted) {
      const gapKm = distanceBetweenKm(previousAccepted.point, rawPoint);
      const elapsedSec = Math.max((sampleTimestampMs - previousAccepted.timestampMs) / 1000, 0);
      if (gapKm > MAX_LOCATION_JUMP_KM && elapsedSec <= 3) {
        if (!hasLoggedJumpSampleRef.current) {
          hasLoggedJumpSampleRef.current = true;
          console.warn('[HomeScreen] Rejected GPS jump sample.', {
            latitude,
            longitude,
            gapKm,
            elapsedSec,
          });
        }
        return false;
      }
    }
    hasLoggedJumpSampleRef.current = false;

    let stablePoint = getStabilizedPoint({
      point: rawPoint,
      accuracy,
    });
    const speedKmh =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
    const lastDisplayPoint = lastDisplayPointRef.current ?? previousAccepted?.point ?? null;
    if (!isTripStartedRef.current && !isSimulatingTripRef.current && lastDisplayPoint) {
      const displayGapKm = distanceBetweenKm(lastDisplayPoint, stablePoint);
      const likelyStationary =
        displayGapKm < MIN_TRACK_MOVE_KM ||
        (speedKmh !== null && speedKmh <= MAX_STATIONARY_SPEED_KMH);

      if (likelyStationary) {
        movementConfirmationCountRef.current = 0;
        stablePoint = lastDisplayPoint;
      } else {
        movementConfirmationCountRef.current += 1;
        if (movementConfirmationCountRef.current < MOVEMENT_CONFIRMATION_COUNT) {
          stablePoint = lastDisplayPoint;
        } else {
          movementConfirmationCountRef.current = 0;
        }
      }
    }

    latestActualCoordsRef.current = stablePoint;
    lastAcceptedSampleRef.current = {
      point: stablePoint,
      timestampMs: sampleTimestampMs,
    };
    setIsResolvingAccurateLocation(false);
    setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
    setLastLocationTimestampMs(sampleTimestampMs);
    if (!firstFixCapturedRef.current && firstFixStartedAtRef.current) {
      firstFixCapturedRef.current = true;
      setFirstFixDurationMs(Date.now() - firstFixStartedAtRef.current);
      console.info('[HomeScreen] First accurate GPS fix acquired.', {
        latitude: stablePoint.latitude,
        longitude: stablePoint.longitude,
        accuracy,
        fixDurationMs: Date.now() - firstFixStartedAtRef.current,
      });
    }
    if (isSimulatingTripRef.current) {
      return true;
    }
    if (!isTripStartedRef.current) {
      updateMarkerPosition(stablePoint);
    }
    if (mapRef.current && !hasCenteredRef.current) {
      mapRef.current.animateCamera(
        {
          center: stablePoint,
          zoom: isTripScreen ? 18 : 16,
          heading: 0,
          pitch: 0,
        },
        { duration: 450 },
      );
      hasCenteredRef.current = true;
      setHasCentered(true);
    } else if (
      mapRef.current &&
      !isSimulatingTripRef.current &&
      !isTripStartedRef.current &&
      Date.now() - lastCameraFollowAtRef.current >= 800
    ) {
      lastCameraFollowAtRef.current = Date.now();
      mapRef.current.animateCamera(
        {
          center: stablePoint,
          zoom: isTripScreen ? 18 : 16,
          heading: 0,
          pitch: 0,
        },
        { duration: 500 },
      );
    }

    if (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0) {
      liveHeadingRef.current = heading;
      setHeadingDeg(heading);
    }
    if (
      typeof speed === 'number' &&
      Number.isFinite(speed) &&
      speed >= 0 &&
      !isTripStartedRef.current
    ) {
      setSpeedKmh(speedKmh ?? 0);
    } else if (!isTripStartedRef.current && speedKmh !== null && speedKmh <= MAX_STATIONARY_SPEED_KMH) {
      setSpeedKmh(0);
    }

    applyLocationUpdate({
      latitude: stablePoint.latitude,
      longitude: stablePoint.longitude,
      rawLatitude: rawPoint.latitude,
      rawLongitude: rawPoint.longitude,
      heading,
      accuracy,
      speed,
    });
    return true;
  };

  const flushBufferedRoadPoints = (force = false) => {
    if (pendingRawPointsRef.current.length === 0) {
      return roadSnapQueueRef.current;
    }

    if (!force && pendingRawPointsRef.current.length < MIN_ROAD_MATCH_POINTS) {
      return roadSnapQueueRef.current;
    }

    const anchorPoint = lastTrackPointRef.current;
    const batchPoints = pendingRawPointsRef.current.splice(
      0,
      Math.min(pendingRawPointsRef.current.length, ROAD_MATCH_BATCH_SIZE),
    );
    if (!force && batchPoints.length < MIN_ROAD_MATCH_POINTS) {
      pendingRawPointsRef.current = [...batchPoints, ...pendingRawPointsRef.current];
      return roadSnapQueueRef.current;
    }

    roadSnapQueueRef.current = roadSnapQueueRef.current
      .then(async () => {
        const inputPoints = anchorPoint ? [anchorPoint, ...batchPoints] : batchPoints;
        if (inputPoints.length < 2) {
          return;
        }

        const rawSegment = dedupeSequentialPoints(inputPoints);
        if (rawSegment.length < 2) {
          return;
        }

        const rawSegmentDistanceKm = polylineDistanceKm(rawSegment);

        if (!isNetworkAvailable) {
          const latestRawPoint = rawSegment[rawSegment.length - 1];
          appendRouteSegment(rawSegment);
          updateMarkerPosition(latestRawPoint);
          snappedCoordsRef.current = latestRawPoint;
          lastTrackPointRef.current = latestRawPoint;
          setLastTrackPoint(latestRawPoint);
          setDistanceKm((prev) => prev + rawSegmentDistanceKm);
          return;
        }

        const latestRawPoint = rawSegment[rawSegment.length - 1];
        const snappedStartPoint = anchorPoint
          ? (await fetchNearestRoadPoint(anchorPoint)) ?? anchorPoint
          : rawSegment[0];
        const snappedEndPoint = (await fetchNearestRoadPoint(latestRawPoint)) ?? latestRawPoint;
        const snappedWaypoints = dedupeSequentialPoints([snappedStartPoint, snappedEndPoint]);
        const matchedSegment =
          snappedWaypoints.length >= 2 ? await fetchRoutedRoadPath(snappedWaypoints) : null;
        let segment = dedupeSequentialPoints(matchedSegment ?? snappedWaypoints);

        if (segment.length >= 2) {
          const latestSnappedPoint = segment[segment.length - 1];
          const snappedDistanceKm = polylineDistanceKm(segment);
          const endpointOffsetKm = distanceBetweenKm(latestSnappedPoint, latestRawPoint);
          const looksOverRouted =
            rawSegmentDistanceKm > 0 &&
            snappedDistanceKm > Math.max(rawSegmentDistanceKm * 1.45, rawSegmentDistanceKm + 0.02);
          const endpointTooFar = endpointOffsetKm > 0.03;
          if (looksOverRouted || endpointTooFar) {
            segment = snappedWaypoints;
          }
        }

        if (segment.length < 2) {
          const fallbackPoint = batchPoints[batchPoints.length - 1];
          if (rawSegment.length >= 2) {
            appendRouteSegment(rawSegment);
            const latestRawPoint = rawSegment[rawSegment.length - 1];
            updateMarkerPosition(latestRawPoint);
            snappedCoordsRef.current = latestRawPoint;
            lastTrackPointRef.current = latestRawPoint;
            setLastTrackPoint(latestRawPoint);
            setDistanceKm((prev) => prev + rawSegmentDistanceKm);
          } else if (fallbackPoint) {
            updateMarkerPosition(fallbackPoint);
          }
          return;
        }

        const latestPoint = segment[segment.length - 1];
        const previousPoint = anchorPoint ?? segment[0];
        if (previousPoint && distanceBetweenKm(previousPoint, latestPoint) > MAX_POINT_GAP_KM) {
          return;
        }

        const segmentDistanceKm = polylineDistanceKm(segment);

        appendRouteSegment(segment);
        lastTrackPointRef.current = latestPoint;
        setLastTrackPoint(latestPoint);
        snappedCoordsRef.current = latestPoint;

        if (segmentDistanceKm >= MIN_SNAPPED_MOVE_KM) {
          const movementHeading = headingBetweenDeg(previousPoint, latestPoint);
          const lastLiveHeading = liveHeadingRef.current;
          const shouldUpdateHeading =
            lastLiveHeading === null || Math.abs(shortestAngleDelta(lastLiveHeading, movementHeading)) >= 4;
          if (shouldUpdateHeading) {
            liveHeadingRef.current = movementHeading;
            setHeadingDeg(movementHeading);
          }

          setDistanceKm((prev) => prev + segmentDistanceKm);
          if (
            mapRef.current &&
            Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
          ) {
            lastCameraFollowAtRef.current = Date.now();
            mapRef.current.animateCamera(
              {
                center: latestPoint,
                zoom: 18,
                heading: 0,
                pitch: 0,
              },
              { duration: 450 },
            );
          }
        }

        if (pendingRawPointsRef.current.length > 0) {
          flushBufferedRoadPoints(true);
        }
      })
      .catch(() => {
        const fallbackPoint = batchPoints[batchPoints.length - 1];
        if (fallbackPoint) {
          updateMarkerPosition(fallbackPoint);
        }
      });

    return roadSnapQueueRef.current;
  };

  const applyLocationUpdate = (coordinate: {
    latitude: number;
    longitude: number;
    rawLatitude?: number | null;
    rawLongitude?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    speed?: number | null;
  }) => {
    if (!locationEnabled || (!isDriverOnline && !isTripStartedRef.current)) {
      return;
    }

    const next = { latitude: coordinate.latitude, longitude: coordinate.longitude };

    const insideBoundary = isPointInsidePolygon(next, OBRERO_GEOFENCE);
    setIsInsideGeofence(insideBoundary);
    setHasGeofenceViolation(!insideBoundary);
    const gpsAccuracyMeters =
      typeof coordinate.accuracy === 'number' ? coordinate.accuracy : null;
    const rawTrackPoint = {
      latitude:
        typeof coordinate.rawLatitude === 'number' ? coordinate.rawLatitude : next.latitude,
      longitude:
        typeof coordinate.rawLongitude === 'number' ? coordinate.rawLongitude : next.longitude,
    };
    const speedFromGpsKmh =
      typeof coordinate.speed === 'number' && coordinate.speed >= 0
        ? coordinate.speed * 3.6
        : null;

    if (isTripStartedRef.current) {
      onTripPointRecord?.({
        latitude: rawTrackPoint.latitude,
        longitude: rawTrackPoint.longitude,
        recordedAt: new Date().toISOString(),
      });

      const prevRawPoint = lastRawTrackPointRef.current;
      if (!prevRawPoint) {
        lastRawTrackPointRef.current = next;
        pendingRawPointsRef.current = [next];
        lastTrackTimestampMsRef.current = Date.now();
      } else {
        if (
          gpsAccuracyMeters !== null &&
          gpsAccuracyMeters > MAX_ACCEPTED_ACCURACY_METERS
        ) {
          return;
        }

        const nowMs = Date.now();
        const lastMs = lastTrackTimestampMsRef.current ?? nowMs;
        const deltaSec = Math.max((nowMs - lastMs) / 1000, 0.001);
        const movedKm = distanceBetweenKm(prevRawPoint, next);
        const computedSpeedKmh = movedKm / (deltaSec / 3600);
        const effectiveSpeedKmh =
          speedFromGpsKmh !== null && Number.isFinite(speedFromGpsKmh)
            ? speedFromGpsKmh
            : computedSpeedKmh;

        if (movedKm > MAX_POINT_GAP_KM || effectiveSpeedKmh > MAX_ACCEPTED_SPEED_KMH) {
          return;
        }

        if (
          movedKm < MIN_TRACK_MOVE_KM ||
          effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH
        ) {
          setSpeedKmh(0);
          return;
        }

        setSpeedKmh(effectiveSpeedKmh);
        lastRawTrackPointRef.current = next;
        lastTrackTimestampMsRef.current = nowMs;
        pendingRawPointsRef.current.push(next);
        flushBufferedRoadPoints();
      }

      if (
        mapRef.current &&
        Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
      ) {
        const displayPoint = snappedCoordsRef.current ?? next;
        lastCameraFollowAtRef.current = Date.now();
        mapRef.current.animateCamera(
          {
            center: displayPoint,
            zoom: 18,
            heading: 0,
            pitch: 0,
          },
          { duration: 400 },
        );
      }
    }

    if (isTripStartedRef.current && !insideBoundary && !hasShownExitAlert.current) {
      hasShownExitAlert.current = true;
      onGeofenceExit?.({
        location: { latitude: next.latitude, longitude: next.longitude },
      });
    }
    if (insideBoundary) {
      hasShownExitAlert.current = false;
    }

    if (isTripScreen && isTripStartedRef.current && !hasCenteredRef.current && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: next.latitude,
          longitude: next.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        500,
      );
      hasCenteredRef.current = true;
      setHasCentered(true);
    }
  };

  useEffect(() => {
    if (!locationEnabled) {
      locationWatchRef.current?.stop();
      locationWatchRef.current = null;
      return;
    }

    let cancelled = false;

    setIsResolvingAccurateLocation(true);
    firstFixStartedAtRef.current = Date.now();
    firstFixCapturedRef.current = false;
    setFirstFixDurationMs(null);

    void (async () => {
      const tracker = await startLiveGpsTracker({
        minMoveMeters: MIN_TRACK_MOVE_KM * 1000,
        initialTimeoutMs: INITIAL_LOCATION_TIMEOUT_MS,
        watchIntervalMs: WATCH_LOCATION_INTERVAL_MS,
        lastKnownMaxAgeMs: LAST_KNOWN_MAX_AGE_MS,
        lastKnownRequiredAccuracyMeters: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
        onSeed: (sample) => {
          if (cancelled) {
            return;
          }

          const accepted = acceptLocationSample({
            latitude: sample.latitude,
            longitude: sample.longitude,
            heading: sample.heading,
            accuracy: sample.accuracy,
            speed: sample.speed,
            timestampMs: sample.timestampMs,
          });

          if (
            !accepted &&
            typeof sample.accuracy === 'number' &&
            sample.accuracy <= FAST_START_REQUIRED_ACCURACY_METERS
          ) {
            seedVisibleLocation({
              latitude: sample.latitude,
              longitude: sample.longitude,
              accuracy: sample.accuracy,
              timestampMs: sample.timestampMs,
            });
          }
        },
        onUpdate: (sample) => {
          if (cancelled) {
            return;
          }

          const accepted = acceptLocationSample({
            latitude: sample.latitude,
            longitude: sample.longitude,
            heading: sample.heading,
            accuracy: sample.accuracy,
            speed: sample.speed,
            timestampMs: sample.timestampMs,
          });

          if (
            !accepted &&
            !lastAcceptedSampleRef.current &&
            typeof sample.accuracy === 'number' &&
            sample.accuracy <= FAST_START_REQUIRED_ACCURACY_METERS
          ) {
            seedVisibleLocation({
              latitude: sample.latitude,
              longitude: sample.longitude,
              accuracy: sample.accuracy,
              timestampMs: sample.timestampMs,
            });
          }
        },
      });

      if (cancelled) {
        tracker.stop();
        return;
      }

      locationWatchRef.current?.stop();
      locationWatchRef.current = tracker;
    })();

    return () => {
      cancelled = true;
      locationWatchRef.current?.stop();
      locationWatchRef.current = null;
      setIsResolvingAccurateLocation(false);
    };
  }, [locationEnabled]);

  const minutesText = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const kmText = distanceKm.toFixed(2);

  const beginTripSession = async (startLocation = coords) => {
    setIsTripStarted(true);
    onTripStart?.({
      startLocation: startLocation ? { latitude: startLocation.latitude, longitude: startLocation.longitude } : null,
    });
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setLastTrackPoint(startLocation);
    lastTrackPointRef.current = startLocation;
    lastRawTrackPointRef.current = startLocation;
    pendingRawPointsRef.current = [];
    setRoutePoints([]);
    setTravelPath([]);
    setStartConnectorPoints([]);
    routePointsRef.current = [];
    travelPathRef.current = [];
    snappedCoordsRef.current = null;
    roadSnapQueueRef.current = Promise.resolve();
    lastTrackTimestampMsRef.current = Date.now();

      if (startLocation) {
        const nearestRoadPoint = await fetchNearestRoadPoint(startLocation);
        if (nearestRoadPoint) {
          const connectorDistanceKm = distanceBetweenKm(startLocation, nearestRoadPoint);
          if (connectorDistanceKm > 0.00002 && connectorDistanceKm <= 0.12) {
            setStartConnectorPoints([startLocation, nearestRoadPoint]);
            updateMarkerPosition(nearestRoadPoint);
            snappedCoordsRef.current = nearestRoadPoint;
            lastTrackPointRef.current = nearestRoadPoint;
            setLastTrackPoint(nearestRoadPoint);
          }
        }
      }

    if (startLocation && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: startLocation,
          zoom: 18,
          heading: 0,
          pitch: 0,
        },
        { duration: 850 },
      );
    }
  };

  const finishTripSession = async ({ openTripHistory = false }: { openTripHistory?: boolean } = {}) => {
    await flushBufferedRoadPoints(true);
    await roadSnapQueueRef.current.catch(() => undefined);

    const completedRoutePath =
      travelPathRef.current.length > 0
        ? travelPathRef.current
        : dedupeSequentialPoints(simulationPointsRef.current);
    const endLocation =
      completedRoutePath.length > 0 ? completedRoutePath[completedRoutePath.length - 1] : null;
    const completedDistanceKm =
      distanceKm > 0 ? distanceKm : polylineDistanceKm(completedRoutePath);
    const restoredActualPoint = latestActualCoordsRef.current;

    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = null;
    }

    setIsTripStarted(false);
    setIsSimulatingTrip(false);
    setLastTrackPoint(null);
    lastTrackPointRef.current = null;
    lastRawTrackPointRef.current = null;
    pendingRawPointsRef.current = [];
    setRoutePoints([]);
    setTravelPath([]);
    setStartConnectorPoints([]);
    routePointsRef.current = [];
    travelPathRef.current = [];
    snappedCoordsRef.current = coords;
    roadSnapQueueRef.current = Promise.resolve();
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setHeadingDeg(0);
    headingAnimValue.current = 0;
    headingAnim.setValue(0);
    lastTrackTimestampMsRef.current = null;
    simulationPointsRef.current = [];
    if (restoredActualPoint) {
      setCoords(restoredActualPoint);
      snappedCoordsRef.current = restoredActualPoint;
    }
    if (mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: restoredActualPoint ?? coords ?? fallbackCenter,
          zoom: NORMAL_CAMERA.zoom,
          pitch: NORMAL_CAMERA.pitch,
          heading: NORMAL_CAMERA.heading,
        },
        { duration: 700 },
      );
    }
    onTripComplete({
      fare: selectedFare,
      distanceKm: completedDistanceKm,
      durationSeconds: elapsedSeconds,
      routePath: completedRoutePath,
      endLocation,
    });

    if (openTripHistory) {
      setTimeout(() => {
        onNavigate?.('trip');
      }, 250);
    }
  };

  const handleTripButtonPress = async () => {
    if (!isTripStarted) {
      await beginTripSession(coords);
      return;
    }

    await finishTripSession();
  };

  const handleSimulateTripPress = () => {
    if (isTripStarted || isSimulatingTrip) {
      return;
    }

    void (async () => {
      const currentActualPoint = latestActualCoordsRef.current ?? coords ?? null;
      const simulationWaypoints = buildRandomSimulationWaypoints(currentActualPoint);
      const snappedSimulationRoute =
        (await fetchRoutedRoadPath(simulationWaypoints)) ??
        (await fetchMatchedRoadPath(simulationWaypoints)) ??
        dedupeSequentialPoints(simulationWaypoints);
      const simulationPoints = snappedSimulationRoute.length > 1
        ? snappedSimulationRoute
        : dedupeSequentialPoints(simulationWaypoints);
      const initialPoint = simulationPoints[0] ?? coords ?? fallbackCenter;

      simulationPointsRef.current = [initialPoint];
      setIsSimulatingTrip(true);
      setCoords(initialPoint);
      await beginTripSession(initialPoint);

      let index = 0;
      const pushNextPoint = () => {
        const point = simulationPoints[index];
        if (!point) {
          setIsSimulatingTrip(false);
          simulationTimeoutRef.current = null;
          void finishTripSession({ openTripHistory: true });
          return;
        }

        const nextRoutePath = simulationPoints.slice(0, index + 1);
        simulationPointsRef.current = nextRoutePath;
        setSimulationRouteProgress(nextRoutePath);

        if (index > 0) {
          const previousPoint = simulationPoints[index - 1] ?? point;
          const segmentHeading = headingBetweenDeg(previousPoint, point);
          liveHeadingRef.current = segmentHeading;
          setHeadingDeg(segmentHeading);
          setDistanceKm(polylineDistanceKm(nextRoutePath));
          setSpeedKmh(18);
        } else {
          setSpeedKmh(0);
        }

        if (mapRef.current) {
          mapRef.current.animateCamera(
            {
              center: point,
              zoom: 18,
              heading: 0,
              pitch: 0,
            },
            { duration: 650 },
          );
        }

        index += 1;
        simulationTimeoutRef.current = setTimeout(pushNextPoint, 700);
      };

      simulationTimeoutRef.current = setTimeout(pushNextPoint, 250);
    })();
  };

  const distanceSummaryKm = totalDistanceKm.toFixed(2);
  const alertScale = alertPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });
  const alertOpacity = alertPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });
  const gpsDebugText = [
    firstFixDurationMs !== null ? `Fix ${Math.max(0, Math.round(firstFixDurationMs / 100) / 10)}s` : 'Fix --',
    displayAccuracyMeters !== null ? `Acc ${Math.round(displayAccuracyMeters)}m` : 'Acc --',
    `Fresh ${locationFreshnessSeconds}s`,
  ].join('  •  ');
  const handleAdjustZoom = async (delta: number) => {
    if (!mapRef.current) {
      return;
    }
    try {
      const camera = await mapRef.current.getCamera();
      const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : NORMAL_CAMERA.zoom;
      const nextZoom = Math.max(10, Math.min(20, currentZoom + delta));
      mapRef.current.animateCamera({ ...camera, zoom: nextZoom }, { duration: 220 });
    } catch {
      // Ignore camera read errors.
    }
  };
  const handleTrackLocation = () => {
    if (!mapRef.current || !coords) {
      return;
    }
    mapRef.current.animateCamera(
      {
        center: coords,
        zoom: isTripStarted ? 18 : 15,
        heading: 0,
        pitch: 0,
      },
      { duration: 450 },
    );
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <MapView
          ref={(ref) => {
            mapRef.current = ref;
          }}
          style={localStyles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          mapType={activeMapType}
          customMapStyle={isDarkMap ? (DARK_MAP_STYLE as any) : []}
          initialRegion={{
            latitude: fallbackCenter.latitude,
            longitude: fallbackCenter.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          showsUserLocation={false}
          followsUserLocation={false}
          showsMyLocationButton={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          <Polygon
            coordinates={OBRERO_GEOFENCE}
            strokeColor={hasGeofenceViolation ? '#EF4444' : geofenceStrokeColor}
            fillColor={hasGeofenceViolation ? 'rgba(239,68,68,0.08)' : geofenceFillColor}
            strokeWidth={2}
          />
          {coords && displayAccuracyMeters ? (
            <Circle
              center={coords}
              radius={Math.max(displayAccuracyMeters, 6)}
              strokeColor="rgba(45, 125, 246, 0.35)"
              fillColor="rgba(45, 125, 246, 0.12)"
            />
          ) : null}
          {isTripScreen && travelPath.length > 1 ? (
            <Polyline
              coordinates={travelPath}
              strokeColor="#2D7DF6"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {isTripScreen && startConnectorPoints.length === 2 ? (
            <Polyline
              coordinates={startConnectorPoints}
              strokeColor="rgba(15,23,42,0.72)"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={[6, 6]}
            />
          ) : null}
        {hasValidCoords ? (
          <MarkerAnimated
            ref={markerRef}
            coordinate={animatedMarkerCoordinate as any}
            title="Your Location"
            anchor={{ x: 0.5, y: 0.82 }}
            centerOffset={{ x: 0, y: 0 }}
            tracksViewChanges={Platform.OS === 'android' ? true : shouldTrackMarkerViewChanges}
          >
            <DriverAvatarMarker
              heading={headingAnim.interpolate({
                inputRange: [-360, 360],
                outputRange: ['-360deg', '360deg'],
                })}
                profileName={profileName}
                profileImageUri={profileImageUri}
              />
            </MarkerAnimated>
          ) : null}
        </MapView>

        {hasGeofenceViolation ? (
          <GeofenceViolationBanner
            opacity={alertOpacity}
            scale={alertScale}
            message="The driver is currently outside the geofence boundary."
          />
        ) : null}

        <Pressable
          style={[
            localStyles.mapTypeToggle,
            isTripScreen && localStyles.mapTypeToggleTrip,
            !isTripScreen && !isDriverOnline && localStyles.mapTypeToggleOffline,
          ]}
          onPress={() => onChangeMapTypeOption(nextMapTypeOption(mapTypeOption))}
        >
          <Feather
            name={mapTypeOption === 'dark' ? 'moon' : mapTypeOption === 'satellite' ? 'globe' : 'map'}
            size={16}
            color="#0F172A"
          />
          <Text style={localStyles.mapTypeToggleText}>
            {mapTypeLabel(mapTypeOption)}
          </Text>
        </Pressable>

        {isTripScreen && locationEnabled && isDriverOnline ? (
          <View style={localStyles.mapControls}>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(1)}>
              <Feather name="plus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(-1)}>
              <Feather name="minus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={handleTrackLocation}>
              <Feather name="crosshair" size={17} color="#0F172A" />
            </Pressable>
          </View>
        ) : null}

        {!isTripScreen ? (
          <HomeDashboardSheet
            isDriverOnline={isDriverOnline}
            onGoOnline={onGoOnline}
            onGoOffline={onGoOffline}
            isResolvingAccurateLocation={isResolvingAccurateLocation}
            tripOpenPending={tripOpenPending}
            firstFixDurationMs={firstFixDurationMs}
            displayAccuracyMeters={displayAccuracyMeters}
            locationFreshnessSeconds={locationFreshnessSeconds}
            gpsDebugText={gpsDebugText}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            totalEarnings={totalEarnings}
            totalTrips={totalTrips}
            distanceSummaryKm={distanceSummaryKm}
            formatPeso={formatPeso}
            localStyles={localStyles}
            insetsBottom={insets.bottom || 0}
          />
        ) : (
          <>
            <Pressable style={styles.routeBackButton} onPress={onBackToHome}>
              <Feather name="chevron-left" size={20} color="#030318" />
            </Pressable>
            <StartTripPanel
              styles={styles}
              localStyles={localStyles}
              insetsBottom={insets.bottom || 0}
              isInsideGeofence={isInsideGeofence}
              minutesText={minutesText}
              kmText={kmText}
              selectedFare={selectedFare}
              fareOptions={fareOptions}
              farePickerOpen={farePickerOpen}
              setFarePickerOpen={setFarePickerOpen}
              setSelectedFare={setSelectedFare}
              speedKmh={speedKmh}
              enableTripSimulation={ENABLE_TRIP_SIMULATION}
              isTripStarted={isTripStarted}
              onOpenSimulation={onOpenSimulation}
              onTripButtonPress={handleTripButtonPress}
            />
          </>
        )}
      </View>

      {!isTripScreen ? (
        <HomeNavigationCard
          activeTab="home"
          onNavigate={onNavigate}
          showCenterRoute
          styles={styles}
        />
      ) : null}

      <OutsideGeofenceModal
        visible={showOutsideGeofenceModal}
        onRequestClose={() => setShowOutsideGeofenceModal(false)}
        onAcknowledge={() => setShowOutsideGeofenceModal(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  statusBarCard: {
    position: 'absolute',
    top: 8,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
  },
  statusTitle: {
    fontSize: 16,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    backgroundColor: '#FFFFFF',
  },
  statusToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  statusToggleOn: {
    backgroundColor: '#57c7a8',
  },
  statusToggleOff: {
    backgroundColor: '#CBD5E1',
  },
  statusToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  statusToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  statusToggleThumbOff: {
    alignSelf: 'flex-start',
  },
  offlineBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 58,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#57c7a8',
  },
  offlineBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  locationWarmupBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 110,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
  },
  locationWarmupBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  tripGateBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 162,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(45, 125, 246, 0.92)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(191, 219, 254, 0.45)',
  },
  tripGateBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  gpsDebugBadge: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 214,
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.92)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  gpsDebugText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  dashboardSheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 118,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#57c7a8',
    backgroundColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  driverMeta: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  todayText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  statsCard: {
    marginTop: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricCard: {
    alignItems: 'center',
    width: '31%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  metricPesoIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricPesoIconText: {
    color: '#57c7a8',
    fontSize: 14,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  metricLabel: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  tripStatsRow: {
    justifyContent: 'space-between',
    gap: 8,
  },
  tripStatPill: {
    flex: 0,
    width: '31%',
    marginHorizontal: 0,
  },
  simulationButton: {
    marginBottom: 10,
    backgroundColor: '#2D7DF6',
  },
  navigationMetaRow: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navigationMetaText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  mapTypeToggle: {
    position: 'absolute',
    top: 58,
    right: 14,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapTypeToggleTrip: {
    top: 66,
  },
  mapTypeToggleOffline: {
    top: 108,
  },
  mapTypeToggleText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    top: 114,
    gap: 8,
    zIndex: 10,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  navMarkerWrap: {
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
    borderWidth: 2,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  driverBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navMarkerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  navMarkerPointer: {
    marginTop: -6,
    width: 14,
    height: 14,
    backgroundColor: '#2D7DF6',
    transform: [{ rotate: '45deg' }],
    borderBottomLeftRadius: 4,
  },
  navMarkerPulse: {
    width: 24,
    height: 8,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: 'rgba(45,125,246,0.16)',
  },
  violationBanner: {
    position: 'absolute',
    top: 106,
    left: 14,
    right: 14,
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
});


