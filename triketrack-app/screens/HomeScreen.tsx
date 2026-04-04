import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  Circle,
  MarkerAnimated,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { HomeDashboardSheet } from '../components/home/HomeDashboardSheet';
import { StartTripPanel } from '../components/home/StartTripPanel';
import { TripNavigationPanel } from '../components/home/TripNavigationPanel';
import { AppleMapPinMarker } from '../components/maps/AppleMapPinMarker';
import { GeofenceViolationBanner } from '../components/maps/GeofenceViolationBanner';
import {
  NotificationCenterModal,
  OutsideGeofenceModal,
  TripSummaryModal,
  type NotificationCenterItem,
} from '../components/modals';
import { AppIcon } from '../components/ui';
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
  ACTIVE_CAMERA_ACCURACY_METERS,
  ACTIVE_LOCATION_ACCURACY,
  GPS_DISTANCE_INTERVAL_METERS,
  GPS_STALE_SAMPLE_THRESHOLD_MS,
  formatPeso,
  HIGH_CONFIDENCE_ACCURACY_METERS,
  IDLE_CAMERA_ACCURACY_METERS,
  IDLE_GPS_DISTANCE_INTERVAL_METERS,
  IDLE_GPS_STALE_SAMPLE_THRESHOLD_MS,
  IDLE_LOCATION_ACCURACY,
  IDLE_WATCH_LOCATION_INTERVAL_MS,
  INITIAL_LOCATION_TIMEOUT_MS,
  INITIAL_VISIBLE_ACCURACY_METERS,
  isPointInsidePolygon,
  isValidCoordinate,
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
  ROAD_MATCH_OVERLAP_POINTS,
  type MapTypeOption,
  TRIP_CAMERA_FOLLOW_INTERVAL_MS,
  WEAK_GPS_RECOVERY_ACCURACY_METERS,
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
  onRequestTripNavigation?: () => void;
  onExitTripNavigation?: () => void;
  onOpenSimulation?: () => void;
  locationEnabled: boolean;
  tripOpenPending?: boolean;
  onLocationVisibilityChange?: (visible: boolean) => void;
  notifications: NotificationCenterItem[];
  unreadNotificationCount: number;
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onTripComplete: (payload: {
    fare: number;
    distanceKm: number;
    durationSeconds: number;
    routePath: Array<{ latitude: number; longitude: number }>;
    endLocation: { latitude: number; longitude: number } | null;
    rawTelemetry?: import('../lib/tripPathReconstruction').RawTripTelemetryPoint[];
  }) => void;
  onTripStart?: (payload: { startLocation: { latitude: number; longitude: number } | null }) => void;
  onTripPointRecord?: (payload: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
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
  tripNavigationMode?: boolean;
};


export function HomeScreen({
  onLogout,
  onNavigate,
  isTripScreen,
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  onBackToHome,
  onRequestTripNavigation,
  onExitTripNavigation,
  onOpenSimulation,
  locationEnabled,
  tripOpenPending = false,
  onLocationVisibilityChange,
  notifications,
  unreadNotificationCount,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
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
  tripNavigationMode = false,
}: HomeScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const [hasCentered, setHasCentered] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [farePickerOpen, setFarePickerOpen] = useState(false);
  const [showOutsideGeofenceModal, setShowOutsideGeofenceModal] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [currentAreaLabel, setCurrentAreaLabel] = useState('Live route tracking');
  const [selectedFare, setSelectedFare] = useState(10);
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [isSimulatingTrip, setIsSimulatingTrip] = useState(false);
  const [tripPanelHeight, setTripPanelHeight] = useState(0);
  const [tripSummary, setTripSummary] = useState<{
    durationText: string;
    distanceText: string;
    speedText: string;
    statusText: string;
  } | null>(null);
  const [completedTripPreviewPath, setCompletedTripPreviewPath] = useState<LatLngPoint[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [isResolvingAccurateLocation, setIsResolvingAccurateLocation] = useState(false);
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
  const roadMatchCarryoverRef = useRef<LatLngPoint[]>([]);
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
  const lastGeocodeAtRef = useRef(0);
  const lastGeocodedPointRef = useRef<LatLngPoint | null>(null);

  const isDarkMap = mapTypeOption === 'dark';
  const activeMapType: 'standard' | 'satellite' = mapTypeOption === 'satellite' ? 'satellite' : 'standard';
  const hasValidCoords = isValidCoordinate(coords);
  const isNetworkAvailable = Boolean(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const tripPanelBottom = (isTripStarted ? 26 : 104) + (insets.bottom || 0);
  const activeTripPanelHeight = isTripStarted ? Math.max(tripPanelHeight, 240) : Math.max(tripPanelHeight, 242);
  const mapControlsBottom = tripPanelBottom + activeTripPanelHeight + 18;
  const topControlTop = Platform.OS === 'android' ? (insets.top || 0) + 12 : Math.max((insets.top || 0) + 6, 52);
  const homeMapTypeTop = !isDriverOnline
    ? 108
    : tripOpenPending
      ? 214
      : isResolvingAccurateLocation
        ? 162
        : 66;
  const isDedicatedTripNavigation = isTripScreen && tripNavigationMode;
  const shouldShowTripNavigationMode = isTripScreen && (tripNavigationMode || isTripStarted);
  const isHighPriorityTracking = locationEnabled && (isDriverOnline || isTripStarted);
  const trackerAccuracy: Location.Accuracy = isHighPriorityTracking
    ? ACTIVE_LOCATION_ACCURACY
    : IDLE_LOCATION_ACCURACY;
  const trackerWatchIntervalMs = isHighPriorityTracking
    ? WATCH_LOCATION_INTERVAL_MS
    : IDLE_WATCH_LOCATION_INTERVAL_MS;
  const trackerDistanceIntervalMeters = isHighPriorityTracking
    ? GPS_DISTANCE_INTERVAL_METERS
    : IDLE_GPS_DISTANCE_INTERVAL_METERS;
  const trackerStaleSampleThresholdMs = isHighPriorityTracking
    ? GPS_STALE_SAMPLE_THRESHOLD_MS
    : IDLE_GPS_STALE_SAMPLE_THRESHOLD_MS;
  const isLowGpsAccuracy =
    displayAccuracyMeters !== null && displayAccuracyMeters > ACTIVE_CAMERA_ACCURACY_METERS;

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
      setCurrentAreaLabel('Live route tracking');
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
      lastGeocodedPointRef.current = null;
      lastGeocodeAtRef.current = 0;
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

  useEffect(() => {
    if (!isTripScreen || !coords) {
      if (!isTripStarted) {
        setCurrentAreaLabel('Live route tracking');
      }
      return;
    }

    const now = Date.now();
    const lastPoint = lastGeocodedPointRef.current;
    const movedEnough = !lastPoint || distanceBetweenKm(lastPoint, coords) >= 0.05;
    const waitedEnough = now - lastGeocodeAtRef.current >= 15000;

    if (!movedEnough && !waitedEnough) {
      return;
    }

    let cancelled = false;
    lastGeocodeAtRef.current = now;

    void (async () => {
      try {
        const results = await Location.reverseGeocodeAsync(coords);
        if (cancelled) {
          return;
        }

        const first = results[0];
        const pieces = [
          first?.street,
          first?.district ?? first?.subregion,
          first?.city,
        ].filter((value): value is string => Boolean(value && value.trim().length > 0));

        if (pieces.length > 0) {
          setCurrentAreaLabel(pieces.slice(0, 2).join(', '));
          lastGeocodedPointRef.current = coords;
        }
      } catch {
        // Keep the last known area label if reverse geocoding is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords, isTripScreen, isTripStarted]);

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

  const hasAutoStartedTripNavigationRef = useRef(false);

  useEffect(() => {
    if (!isDedicatedTripNavigation || isTripStarted || hasAutoStartedTripNavigationRef.current) {
      return;
    }

    hasAutoStartedTripNavigationRef.current = true;
    void beginTripSession(coords ?? latestActualCoordsRef.current ?? null);
  }, [coords, isDedicatedTripNavigation, isTripStarted]);

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
    speedKmh,
  }: {
    point: LatLngPoint;
    accuracy?: number | null;
    speedKmh?: number | null;
  }) => {
    const previousAccepted = lastAcceptedSampleRef.current?.point ?? null;
    if (!previousAccepted) {
      recentAcceptedPointsRef.current = [point];
      return point;
    }

    const movedKm = distanceBetweenKm(previousAccepted, point);
    if (movedKm >= 0.018) {
      recentAcceptedPointsRef.current = [point];
      return point;
    }

    const nextBuffer = [...recentAcceptedPointsRef.current.slice(-3), point];
    recentAcceptedPointsRef.current = nextBuffer;

    const weightedAverage = nextBuffer.reduce<{
      latitude: number;
      longitude: number;
      weight: number;
    }>(
      (sum, entry, index) => {
        const weight = index + 1;
        return {
          latitude: sum.latitude + entry.latitude * weight,
          longitude: sum.longitude + entry.longitude * weight,
          weight: sum.weight + weight,
        };
      },
      { latitude: 0, longitude: 0, weight: 0 },
    );

    const averagedPoint = {
      latitude: weightedAverage.latitude / weightedAverage.weight,
      longitude: weightedAverage.longitude / weightedAverage.weight,
    };

    const accuracyBlend =
      typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? accuracy <= HIGH_CONFIDENCE_ACCURACY_METERS
          ? 0.9
          : accuracy <= MAX_ACCEPTED_ACCURACY_METERS
            ? 0.76
            : 0.5
        : 0.72;
    const motionBlend =
      speedKmh !== null && typeof speedKmh === 'number'
        ? speedKmh >= 24
          ? 0.94
          : speedKmh >= 10
            ? 0.84
            : 0.7
        : 0.66;
    const blendFactor = Math.max(accuracyBlend, motionBlend);

    const stabilizedPoint = {
      latitude:
        previousAccepted.latitude + (averagedPoint.latitude - previousAccepted.latitude) * blendFactor,
      longitude:
        previousAccepted.longitude + (averagedPoint.longitude - previousAccepted.longitude) * blendFactor,
    };

    recentAcceptedPointsRef.current = [...nextBuffer.slice(0, -1), stabilizedPoint];
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
    const speedKmh =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
    const accuracyLimit = previousAccepted
      ? MAX_ACCEPTED_ACCURACY_METERS
      : INITIAL_VISIBLE_ACCURACY_METERS;
    const canUseWeakGpsRecovery =
      Boolean(previousAccepted) &&
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy > accuracyLimit &&
      accuracy <= WEAK_GPS_RECOVERY_ACCURACY_METERS &&
      sampleTimestampMs - (previousAccepted?.timestampMs ?? 0) >= (isHighPriorityTracking ? 1800 : 2500);
    if (
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy > accuracyLimit &&
      !canUseWeakGpsRecovery
    ) {
      setDisplayAccuracyMeters(accuracy);
      setLastLocationTimestampMs(sampleTimestampMs);
      setIsResolvingAccurateLocation(false);
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
        setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
        setLastLocationTimestampMs(sampleTimestampMs);
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
      speedKmh,
    });
    if (canUseWeakGpsRecovery && previousAccepted) {
      stablePoint = {
        latitude: previousAccepted.point.latitude + (stablePoint.latitude - previousAccepted.point.latitude) * 0.22,
        longitude:
          previousAccepted.point.longitude + (stablePoint.longitude - previousAccepted.point.longitude) * 0.22,
      };
    }
    const lastDisplayPoint = lastDisplayPointRef.current ?? previousAccepted?.point ?? null;
    if (!isTripStartedRef.current && !isSimulatingTripRef.current && lastDisplayPoint) {
      const displayGapKm = distanceBetweenKm(lastDisplayPoint, stablePoint);
      const accuracyBufferKm =
        typeof accuracy === 'number' && Number.isFinite(accuracy)
          ? Math.max((accuracy / 1000) * 0.35, MIN_TRACK_MOVE_KM * 0.45)
          : MIN_TRACK_MOVE_KM;
      const likelyStationary =
        displayGapKm < accuracyBufferKm ||
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
    const cameraAccuracyThreshold = isHighPriorityTracking
      ? ACTIVE_CAMERA_ACCURACY_METERS
      : IDLE_CAMERA_ACCURACY_METERS;
    const canRecenterCamera =
      typeof accuracy !== 'number' ||
      !Number.isFinite(accuracy) ||
      accuracy <= cameraAccuracyThreshold;
    if (mapRef.current && !hasCenteredRef.current) {
      if (canRecenterCamera) {
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
      }
    } else if (
      mapRef.current &&
      !isSimulatingTripRef.current &&
      !isTripStartedRef.current &&
      canRecenterCamera &&
      Date.now() - lastCameraFollowAtRef.current >= (isHighPriorityTracking ? 700 : 1500)
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
      const shouldUseHeading =
        (speedKmh !== null && speedKmh >= 6) ||
        (previousAccepted ? distanceBetweenKm(previousAccepted.point, stablePoint) >= 0.004 : false);
      if (shouldUseHeading) {
        liveHeadingRef.current = heading;
        setHeadingDeg(heading);
      }
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
        const overlapPoints = roadMatchCarryoverRef.current;
        const inputPoints = dedupeSequentialPoints([
          ...(anchorPoint ? [anchorPoint] : []),
          ...overlapPoints,
          ...batchPoints,
        ]);
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
          roadMatchCarryoverRef.current = rawSegment.slice(
            Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
          );
          appendRouteSegment(rawSegment);
          updateMarkerPosition(latestRawPoint);
          snappedCoordsRef.current = latestRawPoint;
          lastTrackPointRef.current = latestRawPoint;
          setLastTrackPoint(latestRawPoint);
          setDistanceKm((prev) => prev + rawSegmentDistanceKm);
          return;
        }

        const latestRawPoint = rawSegment[rawSegment.length - 1];
        const roadMatchedSegment =
          rawSegment.length >= MIN_ROAD_MATCH_POINTS
            ? await fetchMatchedRoadPath(rawSegment)
            : null;
        const snappedStartPoint = anchorPoint
          ? (await fetchNearestRoadPoint(anchorPoint)) ?? anchorPoint
          : rawSegment[0];
        const snappedEndPoint = (await fetchNearestRoadPoint(latestRawPoint)) ?? latestRawPoint;
        const snappedWaypoints = dedupeSequentialPoints([snappedStartPoint, snappedEndPoint]);
        const routedSegment =
          snappedWaypoints.length >= 2 ? await fetchRoutedRoadPath(snappedWaypoints) : null;
        let segment = dedupeSequentialPoints(roadMatchedSegment ?? routedSegment ?? snappedWaypoints);

        if (segment.length >= 2) {
          const latestSnappedPoint = segment[segment.length - 1];
          const snappedDistanceKm = polylineDistanceKm(segment);
          const endpointOffsetKm = distanceBetweenKm(latestSnappedPoint, latestRawPoint);
          const looksOverRouted =
            rawSegmentDistanceKm > 0 &&
            snappedDistanceKm > Math.max(rawSegmentDistanceKm * 1.45, rawSegmentDistanceKm + 0.02);
          const endpointTooFar = endpointOffsetKm > (roadMatchedSegment ? 0.02 : 0.03);
          if (looksOverRouted || endpointTooFar) {
            segment = dedupeSequentialPoints(routedSegment ?? snappedWaypoints);
          }
        }

        if (segment.length < 2) {
          const fallbackPoint = batchPoints[batchPoints.length - 1];
          if (rawSegment.length >= 2) {
            roadMatchCarryoverRef.current = rawSegment.slice(
              Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
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
        roadMatchCarryoverRef.current = rawSegment.slice(
          Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
        );

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
            const nextHeading =
              isDedicatedTripNavigation && liveHeadingRef.current !== null ? liveHeadingRef.current : 0;
            mapRef.current.animateCamera(
              {
                center: latestPoint,
                zoom: isDedicatedTripNavigation ? 18.6 : 18,
                heading: nextHeading,
                pitch: isDedicatedTripNavigation ? 52 : 0,
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
        speed: speedFromGpsKmh,
        heading:
          typeof coordinate.heading === 'number' && Number.isFinite(coordinate.heading)
            ? coordinate.heading
            : null,
        accuracy: gpsAccuracyMeters,
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

      const canFollowTripCamera =
        gpsAccuracyMeters === null || gpsAccuracyMeters <= ACTIVE_CAMERA_ACCURACY_METERS;

      if (
        mapRef.current &&
        canFollowTripCamera &&
        Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
      ) {
        const displayPoint = snappedCoordsRef.current ?? next;
        lastCameraFollowAtRef.current = Date.now();
        const nextHeading =
          isDedicatedTripNavigation && liveHeadingRef.current !== null ? liveHeadingRef.current : 0;
        mapRef.current.animateCamera(
          {
            center: displayPoint,
            zoom: isDedicatedTripNavigation ? 18.6 : 18,
            heading: nextHeading,
            pitch: isDedicatedTripNavigation ? 52 : 0,
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
        initialTimeoutMs: INITIAL_LOCATION_TIMEOUT_MS,
        accuracy: trackerAccuracy,
        watchIntervalMs: trackerWatchIntervalMs,
        distanceIntervalMeters: trackerDistanceIntervalMeters,
        staleSampleThresholdMs: trackerStaleSampleThresholdMs,
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
  }, [
    locationEnabled,
    trackerAccuracy,
    trackerDistanceIntervalMeters,
    trackerStaleSampleThresholdMs,
    trackerWatchIntervalMs,
  ]);

  const minutesText = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const kmText = distanceKm.toFixed(2);

  const beginTripSession = async (startLocation = coords) => {
    setTripSummary(null);
    setCompletedTripPreviewPath([]);
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
    roadMatchCarryoverRef.current = [];
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
          zoom: isDedicatedTripNavigation ? 18.6 : 18,
          heading: isDedicatedTripNavigation && liveHeadingRef.current !== null ? liveHeadingRef.current : 0,
          pitch: isDedicatedTripNavigation ? 52 : 0,
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
    const completedDurationSeconds = elapsedSeconds;
    const averageSpeed =
      completedDurationSeconds > 0
        ? completedDistanceKm / (completedDurationSeconds / 3600)
        : speedKmh;

    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = null;
    }

    setIsTripStarted(false);
    setIsSimulatingTrip(false);
    setCompletedTripPreviewPath(completedRoutePath);
    setTripSummary({
      durationText: `${Math.floor(completedDurationSeconds / 60)}:${String(
        completedDurationSeconds % 60,
      ).padStart(2, '0')}`,
      distanceText: `${completedDistanceKm.toFixed(2)} km`,
      speedText: `${Math.max(0, averageSpeed).toFixed(1)} km/h`,
      statusText: isSimulatingTripRef.current ? 'Simulation completed' : 'Trip saved successfully',
    });
    setLastTrackPoint(null);
    lastTrackPointRef.current = null;
    lastRawTrackPointRef.current = null;
    pendingRawPointsRef.current = [];
    roadMatchCarryoverRef.current = [];
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
      durationSeconds: completedDurationSeconds,
      routePath: completedRoutePath,
      endLocation,
    });

    if (openTripHistory) {
      return;
    }
  };

  const handleTripButtonPress = async () => {
    if (!isTripStarted) {
      if (isTripScreen && !tripNavigationMode) {
        if (!locationEnabled) {
          Alert.alert('Location required', 'Allow location access before starting a trip.');
          return;
        }
        if (!isDriverOnline) {
          Alert.alert('Go online first', 'Use the route action to go online before starting a trip.');
          return;
        }
        onRequestTripNavigation?.();
        return;
      }
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
          void finishTripSession();
          return;
        }

        const nextRoutePath = simulationPoints.slice(0, index + 1);
        simulationPointsRef.current = nextRoutePath;
        setSimulationRouteProgress(nextRoutePath);
        const previousPoint = simulationPoints[index - 1] ?? point;
        const segmentHeading = headingBetweenDeg(previousPoint, point);

        if (index > 0) {
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
              zoom: isDedicatedTripNavigation ? 18.6 : 18,
              heading: isDedicatedTripNavigation ? segmentHeading : 0,
              pitch: isDedicatedTripNavigation ? 52 : 0,
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
        zoom: isTripStarted ? (isDedicatedTripNavigation ? 18.6 : 18) : 15,
        heading: isDedicatedTripNavigation && liveHeadingRef.current !== null ? liveHeadingRef.current : 0,
        pitch: isDedicatedTripNavigation && isTripStarted ? 52 : 0,
      },
      { duration: 450 },
    );
  };
  const tripRouteForDisplay =
    isTripScreen && !isTripStarted && completedTripPreviewPath.length > 1
      ? completedTripPreviewPath
      : travelPath;
  const tripHeaderTitle = isTripStarted ? 'Trip in Progress' : 'Trip started';
  const tripHeaderSubtitle = currentAreaLabel || 'Live route tracking';
  const tripStatusTone = isLowGpsAccuracy
    ? 'GPS recovering'
    : isSimulatingTrip
      ? 'Simulation running'
      : isTripStarted
        ? 'Tracking live'
        : 'Waiting for movement';

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
              strokeColor="rgba(45, 125, 246, 0.24)"
              fillColor="rgba(45, 125, 246, 0.08)"
            />
          ) : null}
          {isTripScreen && tripRouteForDisplay.length > 1 ? (
            <Polyline
              coordinates={tripRouteForDisplay}
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
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: 0 }}
            flat={false}
            zIndex={30}
            tracksViewChanges={Platform.OS === 'android'}
          >
            <AppleMapPinMarker color="#38BDF8" iconName="radio" size="md" />
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
            { top: isTripScreen ? topControlTop : homeMapTypeTop },
          ]}
          onPress={() => onChangeMapTypeOption(nextMapTypeOption(mapTypeOption))}
        >
          <AppIcon
            name={mapTypeOption === 'dark' ? 'moon' : mapTypeOption === 'satellite' ? 'globe' : 'map'}
            size={16}
            color="#0F172A"
          />
          <Text style={localStyles.mapTypeToggleText}>
            {mapTypeLabel(mapTypeOption)}
          </Text>
        </Pressable>

        {shouldShowTripNavigationMode ? (
          <View style={[localStyles.tripNavigationHeader, { top: topControlTop }]}>
            <View style={localStyles.tripNavigationHeaderMain}>
              <Text style={localStyles.tripNavigationTitle}>{tripHeaderTitle}</Text>
              <Text style={localStyles.tripNavigationSubtitle} numberOfLines={1}>
                {tripHeaderSubtitle}
              </Text>
            </View>
            <View style={localStyles.tripNavigationHeaderStatus}>
              <AppIcon
                name={isLowGpsAccuracy ? 'alert-circle' : 'navigation'}
                size={14}
                color={isLowGpsAccuracy ? '#9A3412' : '#147D64'}
                active
              />
              <Text
                style={[
                  localStyles.tripNavigationHeaderStatusText,
                  isLowGpsAccuracy
                    ? localStyles.tripNavigationHeaderStatusTextWarning
                    : localStyles.tripNavigationHeaderStatusTextActive,
                ]}
              >
                {tripStatusTone}
              </Text>
            </View>
          </View>
        ) : null}

        {isTripScreen && locationEnabled && isDriverOnline ? (
          <View style={[localStyles.mapControls, { bottom: mapControlsBottom }]}>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(1)}>
              <AppIcon name="plus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(-1)}>
              <AppIcon name="minus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={handleTrackLocation}>
              <AppIcon name="crosshair" size={17} color="#0F172A" />
            </Pressable>
          </View>
        ) : null}

        {!isTripScreen ? (
          <HomeDashboardSheet
            isDriverOnline={isDriverOnline}
            onGoOnline={onGoOnline}
            onGoOffline={onGoOffline}
            onOpenNotifications={() => setShowNotificationCenter(true)}
            unreadNotificationCount={unreadNotificationCount}
            isResolvingAccurateLocation={isResolvingAccurateLocation}
            tripOpenPending={tripOpenPending}
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
            {!shouldShowTripNavigationMode ? (
              <>
                <Pressable style={[styles.routeBackButton, { top: topControlTop }]} onPress={onBackToHome}>
                  <AppIcon name="chevron-left" size={20} color="#030318" />
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
                  onLayout={(event) => setTripPanelHeight(event.nativeEvent.layout.height)}
                />
              </>
            ) : (
              <TripNavigationPanel
                styles={styles}
                localStyles={localStyles}
                insetsBottom={insets.bottom || 0}
                minutesText={minutesText}
                kmText={kmText}
                speedKmh={speedKmh}
                isInsideGeofence={isInsideGeofence}
                isLowGpsAccuracy={isLowGpsAccuracy}
                isSimulatingTrip={isSimulatingTrip}
                onEndTripPress={handleTripButtonPress}
                onLayout={(event) => setTripPanelHeight(event.nativeEvent.layout.height)}
              />
            )}
          </>
        )}
      </View>

      {!shouldShowTripNavigationMode ? (
        <HomeNavigationCard
          activeTab={isTripScreen ? 'trip' : 'home'}
          onNavigate={onNavigate}
          showCenterRoute={!isTripScreen}
          styles={styles}
        />
      ) : null}

      <OutsideGeofenceModal
        visible={showOutsideGeofenceModal}
        onRequestClose={() => setShowOutsideGeofenceModal(false)}
        onAcknowledge={() => setShowOutsideGeofenceModal(false)}
      />
      <NotificationCenterModal
        visible={showNotificationCenter}
        onRequestClose={() => setShowNotificationCenter(false)}
        notifications={notifications}
        unreadCount={unreadNotificationCount}
        onPressNotification={onMarkNotificationRead}
        onMarkAllRead={onMarkAllNotificationsRead}
      />
      <TripSummaryModal
        visible={Boolean(tripSummary)}
        durationText={tripSummary?.durationText ?? '0:00'}
        distanceText={tripSummary?.distanceText ?? '0.00 km'}
        speedText={tripSummary?.speedText ?? '0.0 km/h'}
        statusText={tripSummary?.statusText ?? 'Trip saved successfully'}
        onClose={() => {
          setTripSummary(null);
          setCompletedTripPreviewPath([]);
          if (tripNavigationMode) {
            onExitTripNavigation?.();
          }
        }}
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
    position: 'relative',
    overflow: 'visible',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'CircularStdMedium500',
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
  statusToggleLocked: {
    opacity: 0.72,
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
  navigationMetaRow: {
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  navigationMetaText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  metaActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 1,
  },
  metaStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E6F8F1',
  },
  metaStatusChipText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#147D64',
    fontFamily: 'CircularStdMedium500',
  },
  simulationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FBFF',
  },
  simulationChipText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#2D7DF6',
    fontFamily: 'CircularStdMedium500',
  },
  mapTypeToggle: {
    position: 'absolute',
    right: 14,
    minHeight: 48,
    borderRadius: 20,
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
  mapTypeToggleText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    gap: 8,
    zIndex: 14,
  },
  mapControlButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tripNavigationHeader: {
    position: 'absolute',
    left: 16,
    right: 92,
    minHeight: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tripNavigationHeaderMain: {
    paddingRight: 6,
  },
  tripNavigationTitle: {
    fontSize: 19,
    lineHeight: 22,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationHeaderStatus: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
  },
  tripNavigationHeaderStatusText: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationHeaderStatusTextActive: {
    color: '#147D64',
  },
  tripNavigationHeaderStatusTextWarning: {
    color: '#9A3412',
  },
  tripNavigationPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  tripNavigationHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 14,
  },
  tripNavigationStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tripNavigationStatCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    alignItems: 'center',
  },
  tripNavigationStatValue: {
    fontSize: 18,
    lineHeight: 21,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationStatLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationStatusRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tripNavigationStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tripNavigationStatusPrimary: {
    backgroundColor: '#E8FBF6',
  },
  tripNavigationStatusPrimaryText: {
    color: '#147D64',
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationStatusInside: {
    backgroundColor: '#ECFDF5',
  },
  tripNavigationStatusOutside: {
    backgroundColor: '#FEF2F2',
  },
  tripNavigationStatusGoodGps: {
    backgroundColor: '#EFF6FF',
  },
  tripNavigationStatusWeakGps: {
    backgroundColor: '#FFF7ED',
  },
  tripNavigationStatusText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationStatusTextInside: {
    color: '#047857',
  },
  tripNavigationStatusTextOutside: {
    color: '#B91C1C',
  },
  tripNavigationStatusTextGoodGps: {
    color: '#1D4ED8',
  },
  tripNavigationStatusTextWeakGps: {
    color: '#9A3412',
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


