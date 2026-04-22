
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import type { HomeScreen } from './HomeScreen';
import { OsmMapView, type OsmMapViewHandle } from '../components/maps/OsmMapView';
import {
  OSM_VECTOR_DARK_STYLE,
  OSM_LIGHT_BACKGROUND,
  OSM_MAXIM_DARK_BACKGROUND,
  OSM_VECTOR_LIGHT_STYLE_URL,
} from '../components/maps/osmTheme';
import { AppIcon } from '../components/ui';
import { TripSummaryModal } from '../components/modals';
import { getMotionDurationMs, shortestAngleDelta } from '../lib/mapTracking';
import {
  buildRoadAlignedTripPathDetailed,
  dedupeSequentialPoints,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from '../lib/roadPath';
import { startLiveGpsTracker } from '../lib/liveGpsTracker';
import {
  filterAcceptedTripTelemetry,
  reconstructCompletedTripPath,
  type RawTripTelemetryPoint,
} from '../lib/tripPathReconstruction';
import {
  formatTripReceiptDistance,
  formatTripReceiptFare,
  pickPreferredRouteMatchSummary,
  type TripGpsQualitySummary,
} from '../lib/tripTransactions';
import { resolveTripDisplayLocationLabels } from '../lib/tripLocationLabels';
import { useGpsWarmupNotification } from '../lib/useGpsWarmupNotification';
import {
  selectTripEndpointFromBuildings,
  selectTripStartEndpointFromBuildings,
} from '../lib/tripEndpointSelection';
import {
  buildLiveMatchedRouteSegmentDetailed,
  buildMatchedTracePointsFromSegment,
  buildRenderedTripTrace,
  buildTripStartConnector,
  projectPointToRoadPath,
  type TripRoadProjection,
  type TripMatchedPointSource,
  type TripRouteRenderState,
  type TripTraceRawPoint,
} from '../lib/tripTrace';
import {
  ACTIVE_CAMERA_ACCURACY_METERS,
  ACTIVE_LOCATION_ACCURACY,
  COARSE_FIRST_FIX_ACCURACY_METERS,
  FAST_START_REQUIRED_ACCURACY_METERS,
  FINALIZE_LOCK_TIMEOUT_MS,
  FINALIZE_MIN_VALID_POINTS,
  FINALIZE_REQUIRED_ACCURACY_METERS,
  GPS_POINT_FILTER_DISTANCE_METERS,
  GPS_DISTANCE_INTERVAL_METERS,
  GPS_STALE_SAMPLE_THRESHOLD_MS,
  HIGH_CONFIDENCE_ACCURACY_METERS,
  INITIAL_LOCATION_TIMEOUT_MS,
  INITIAL_VISIBLE_ACCURACY_METERS,
  isPointInsidePolygon,
  isValidCoordinate,
  getAdaptiveGpsMotionThresholdKm,
  LOW_BATTERY_MAP_ACCENT,
  LOW_BATTERY_MAP_ACCENT_SOFT,
  MAXIM_ROUTE_CASING_DARK,
  MAXIM_ROUTE_CASING_LIGHT,
  MAXIM_ROUTE_CORE_DARK,
  MAXIM_ROUTE_CORE_LIGHT,
  MAXIM_ROUTE_WIDTH_CASING_NAV,
  MAXIM_ROUTE_WIDTH_CORE_NAV,
  MAX_ACCEPTED_ACCURACY_METERS,
  MAX_ACCEPTED_SPEED_KMH,
  MAX_LOCATION_JUMP_KM,
  MAX_POINT_GAP_KM,
  MAX_STATIONARY_SPEED_KMH,
  mergeRouteSegment,
  MIN_SNAPPED_MOVE_KM,
  MIN_TRACK_MOVE_KM,
  MOVEMENT_CONFIRMATION_COUNT,
  OBRERO_GEOFENCE,
  ROAD_MATCH_BATCH_SIZE,
  ROAD_MATCH_OVERLAP_POINTS,
  shouldRejectGpsBacktrack,
  shouldRequireGpsMotionConfirmation,
  WATCH_LOCATION_INTERVAL_MS,
  WEAK_GPS_RECOVERY_ACCURACY_METERS,
} from './homeScreenShared';

type RestoredTripTraceState = {
  rawStartPoint: LatLngPoint | null;
  matchedPath: LatLngPoint[];
  hasConfirmedMovement: boolean;
  startedAt: string;
};

type TripNavigationScreenProps = Omit<ComponentProps<typeof HomeScreen>, 'isTripScreen'> & {
  onTripMatchedPathRecord?: (payload: {
    points: Array<{
      latitude: number;
      longitude: number;
      recordedAt: string;
      source: TripMatchedPointSource;
    }>;
  }) => void;
  onTripStatusChange?: (payload: {
    status:
      | 'trip_started'
      | 'movement_confirmed'
      | 'trip_completed'
      | 'connectivity_offline'
      | 'connectivity_online'
      | 'app_recovered';
    recordedAt: string;
    latitude?: number | null;
    longitude?: number | null;
    metadata?: Record<string, unknown> | null;
  }) => void;
  restoredTripTrace?: RestoredTripTraceState | null;
  forceNewTripSession?: boolean;
  initialTripLocation?: (LatLngPoint & { timestampMs?: number | null }) | null;
};

type SummaryState = {
  tripNumberText: string | null;
  durationText: string;
  distanceText: string;
  speedText: string;
  statusText: string;
  pickupText: string | null;
  destinationText: string | null;
  fareText: string;
  isBusy: boolean;
};

const NAV_BLUE_DARK = '#147D64';
const NAV_INSTRUCTION_BLUE = '#57C7A8';
const NAV_LIVE_BLUE = '#147D64';
const NAV_ARROW_OUTER_GLOW = 'rgba(20, 125, 100, 0.14)';
const IDLE_CAMERA_ZOOM = 17;
const IDLE_CAMERA_PITCH = 0;
const IDLE_CAMERA_HEADING = 0;
const NAV_CAMERA_ZOOM = 18.4;
const NAV_CAMERA_PITCH = 0;
const NAV_CAMERA_ANIMATION_MS = 520;
const NAV_CAMERA_TRANSITION_MS = 760;
const GEOFENCE_STROKE = 'rgba(14, 165, 233, 0.58)';
const GEOFENCE_FILL = 'rgba(14, 165, 233, 0.045)';
const TRACE_START_MIN_DISPLACEMENT_KM = 0.003;
const TRACE_START_MIN_STEP_KM = 0.0012;
const TRACE_START_MIN_SPEED_KMH = 1.2;
const TRACE_START_REQUIRED_POINTS = 1;
const NAV_LIVE_ROUTE_MIN_BATCH_POINTS = 2;
const NAV_LIVE_ROUTE_BATCH_SIZE = 6;
const NAV_LIVE_ROUTE_FLUSH_INTERVAL_MS = 2500;
const NAV_FORCE_ROUTE_REFRESH_MIN_INTERVAL_MS = 2500;
const NAV_FORCE_ROUTE_REFRESH_MIN_DISTANCE_KM = 0.012;
const NAV_ROUTE_INTERPOLATION_STEP_KM = 0.008;
const LOCAL_CENTERLINE_PROJECTION_MAX_DISTANCE_KM = 0.03;
const TRIP_START_LOCK_TIMEOUT_MS = 6000;

export function TripNavigationScreen({
  onBackToHome,
  onExitTripNavigation,
  locationEnabled,
  onLocationVisibilityChange,
  onTripStart,
  onTripPointRecord,
  onTripMatchedPathRecord,
  onTripStatusChange,
  onTripComplete,
  onGeofenceExit,
  isLowBatteryMapMode,
  localSnapRoadPath = [],
  restoredTripTrace,
  forceNewTripSession = false,
  initialTripLocation = null,
  activeTripNumber = null,
}: TripNavigationScreenProps) {
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const mapRef = useRef<OsmMapViewHandle | null>(null);
  const locationWatchRef = useRef<{ stop: () => void } | null>(null);
  const initialTripPoint = isValidCoordinate(initialTripLocation)
    ? {
        latitude: initialTripLocation.latitude,
        longitude: initialTripLocation.longitude,
      }
    : null;
  const initialTripTimestampMs =
    initialTripPoint && typeof initialTripLocation?.timestampMs === 'number'
      ? initialTripLocation.timestampMs
      : Date.now();

  const [coords, setCoords] = useState<LatLngPoint | null>(initialTripPoint);
  const [displayAccuracyMeters, setDisplayAccuracyMeters] = useState<number | null>(null);
  const [currentAreaLabel, setCurrentAreaLabel] = useState('Locating driver');
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [tripSummary, setTripSummary] = useState<SummaryState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [routePoints, setRoutePoints] = useState<LatLngPoint[]>([]);
  const [travelPath, setTravelPath] = useState<LatLngPoint[]>([]);
  const [completedTripPreviewPath, setCompletedTripPreviewPath] = useState<LatLngPoint[]>([]);
  const [headingDeg, setHeadingDeg] = useState(0);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingAnimValueRef = useRef(0);
  const [panelHeight, setPanelHeight] = useState(164);
  const [hasConfirmedMovement, setHasConfirmedMovement] = useState(false);
  const [routeRenderState, setRouteRenderState] = useState<TripRouteRenderState>('PRE_ROAD');
  const [firstSnappedRoadPoint, setFirstSnappedRoadPoint] = useState<LatLngPoint | null>(null);
  const [startConnectorPath, setStartConnectorPath] = useState<LatLngPoint[]>([]);
  const [isInitializingTripStart, setIsInitializingTripStart] = useState(false);
  const gpsWarmupNotificationBody =
    displayAccuracyMeters !== null
      ? `Waiting for a stable location (${Math.round(displayAccuracyMeters)} m).`
      : 'Waiting for a stable location fix.';
  useGpsWarmupNotification(isInitializingTripStart, gpsWarmupNotificationBody);

  const markerInitializedRef = useRef(false);
  const lastAnimatedMarkerPointRef = useRef<LatLngPoint | null>(null);
  const hasCenteredRef = useRef(false);
  const hasStartedSessionRef = useRef(false);
  const hasFocusedTripStartCameraRef = useRef(false);
  const isTripStartedRef = useRef(false);
  const lastAcceptedSampleRef = useRef<{ point: LatLngPoint; timestampMs: number } | null>(
    initialTripPoint ? { point: initialTripPoint, timestampMs: initialTripTimestampMs } : null,
  );
  const recentAcceptedPointsRef = useRef<LatLngPoint[]>([]);
  const movementConfirmationCountRef = useRef(0);
  const lastDisplayPointRef = useRef<LatLngPoint | null>(initialTripPoint);
  const pendingRawPointsRef = useRef<TripTraceRawPoint[]>([]);
  const roadMatchCarryoverRef = useRef<TripTraceRawPoint[]>([]);
  const roadSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const roadMatchInFlightRef = useRef(false);
  const liveRouteMatchGenerationRef = useRef(0);
  const routePointsRef = useRef<LatLngPoint[]>([]);
  const travelPathRef = useRef<LatLngPoint[]>([]);
  const lastRawTrackPointRef = useRef<LatLngPoint | null>(null);
  const lastTrackTimestampMsRef = useRef<number | null>(null);
  const lastForcedRouteRefreshAtRef = useRef(0);
  const lastConnectivityStateRef = useRef<boolean | null>(null);
  const liveHeadingRef = useRef<number | null>(null);
  const latestActualCoordsRef = useRef<LatLngPoint | null>(initialTripPoint);
  const lastGeocodeAtRef = useRef(0);
  const lastGeocodedPointRef = useRef<LatLngPoint | null>(null);
  const hasShownExitAlertRef = useRef(false);
  const tripStartAnchorRef = useRef<LatLngPoint | null>(null);
  const tripStartLockOpenedAtRef = useRef<number | null>(null);
  const rawStartPointRef = useRef<LatLngPoint | null>(null);
  const lastMatchedRoadProjectionRef = useRef<TripRoadProjection | null>(null);
  const routeRenderStateRef = useRef<TripRouteRenderState>('PRE_ROAD');
  const firstSnappedRoadPointRef = useRef<LatLngPoint | null>(null);
  const startConnectorPathRef = useRef<LatLngPoint[]>([]);
  const movementValidationPointsRef = useRef<LatLngPoint[]>([]);
  const hasConfirmedMovementRef = useRef(false);
  const acceptedTelemetryRef = useRef<RawTripTelemetryPoint[]>([]);
  const displayAccuracyMetersRef = useRef<number | null>(null);
  const tripStartedAtRef = useRef<string | null>(null);
  const toRad = (value: number) => (value * Math.PI) / 180;
  const distanceBetweenKm = (from: LatLngPoint, to: LatLngPoint) => {
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
  const interpolateNavigationPath = (path: LatLngPoint[]) => {
    const cleanPath = dedupeSequentialPoints(path);
    if (cleanPath.length < 2) {
      return cleanPath;
    }

    const expandedPath: LatLngPoint[] = [cleanPath[0]];

    for (let index = 1; index < cleanPath.length; index += 1) {
      const previousPoint = cleanPath[index - 1];
      const currentPoint = cleanPath[index];
      const gapKm = distanceBetweenKm(previousPoint, currentPoint);

      if (gapKm > NAV_ROUTE_INTERPOLATION_STEP_KM) {
        const extraPointCount = Math.min(4, Math.floor(gapKm / NAV_ROUTE_INTERPOLATION_STEP_KM));
        for (let extraIndex = 1; extraIndex <= extraPointCount; extraIndex += 1) {
          const ratio = extraIndex / (extraPointCount + 1);
          expandedPath.push({
            latitude: previousPoint.latitude + (currentPoint.latitude - previousPoint.latitude) * ratio,
            longitude: previousPoint.longitude + (currentPoint.longitude - previousPoint.longitude) * ratio,
          });
        }
      }

      expandedPath.push(currentPoint);
    }

    return dedupeSequentialPoints(expandedPath);
  };

  const isDarkMap = isLowBatteryMapMode;
  const osmMapStyleUrl = isDarkMap ? OSM_VECTOR_DARK_STYLE : OSM_VECTOR_LIGHT_STYLE_URL;
  const osmBackgroundColor = isDarkMap ? OSM_MAXIM_DARK_BACKGROUND : OSM_LIGHT_BACKGROUND;
  const hasValidCoords = Boolean(coords);
  const isNetworkAvailable = Boolean(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const isLowGpsAccuracy =
    displayAccuracyMeters !== null && displayAccuracyMeters > ACTIVE_CAMERA_ACCURACY_METERS;
  const displayedPath = isTripStarted ? travelPath : completedTripPreviewPath;
  const routeTraceSource = dedupeSequentialPoints(displayedPath.length > 0 ? displayedPath : routePoints);
  const minutesText = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const kmText = distanceKm.toFixed(2);
  const areaLabel = currentAreaLabel || 'Live route tracking';
  const roadLabel = areaLabel.split(',')[0] ?? areaLabel;
  const geofenceLoop = OBRERO_GEOFENCE.length > 0 ? [...OBRERO_GEOFENCE, OBRERO_GEOFENCE[0]] : [];
  const renderedTrace = buildRenderedTripTrace({
    rawStartPoint: rawStartPointRef.current,
    matchedPoints: routeTraceSource,
    routeState: routeRenderState,
    firstSnappedPoint: firstSnappedRoadPoint,
    dashedConnector: startConnectorPath,
  });
  const liveDisplayPath = interpolateNavigationPath(renderedTrace.solidOnRoadPath);
  const shouldShowStartConnector = !isTripStarted && renderedTrace.dashedConnector.length === 2;
  const visibleTraceHasRoute = liveDisplayPath.length > 1;
  const geofenceStrokeColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT : GEOFENCE_STROKE;
  const geofenceFillColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT_SOFT : GEOFENCE_FILL;
  const routeCoreColor = isDarkMap ? MAXIM_ROUTE_CORE_DARK : MAXIM_ROUTE_CORE_LIGHT;
  const routeCasingColor = isDarkMap ? MAXIM_ROUTE_CASING_DARK : MAXIM_ROUTE_CASING_LIGHT;
  const startConnectorColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT : 'rgba(107, 114, 128, 0.78)';
  const mapPadding = {
    top: (insets.top || 0) + 116,
    right: 16,
    bottom: panelHeight + (insets.bottom || 0) + 16,
    left: 18,
  };

  useEffect(() => {
    isTripStartedRef.current = isTripStarted;
  }, [isTripStarted]);

  useEffect(() => {
    const normalizedTarget = ((headingDeg % 360) + 360) % 360;
    const current = headingAnimValueRef.current;
    const delta = shortestAngleDelta(current, normalizedTarget);
    const target = current + delta;
    headingAnimValueRef.current = target;
    Animated.timing(headingAnim, {
      toValue: target,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headingAnim, headingDeg]);

  useEffect(() => {
    if (forceNewTripSession || !restoredTripTrace || hasStartedSessionRef.current) {
      return;
    }

    hasStartedSessionRef.current = true;
    setTripSummary(null);
    setCompletedTripPreviewPath([]);
    setIsTripStarted(true);
    tripStartedAtRef.current = restoredTripTrace.startedAt;
    setHasConfirmedMovement(restoredTripTrace.hasConfirmedMovement);
    hasConfirmedMovementRef.current = restoredTripTrace.hasConfirmedMovement;
    rawStartPointRef.current = restoredTripTrace.rawStartPoint;
    tripStartAnchorRef.current = restoredTripTrace.rawStartPoint;
    const restoredMatchedPath = dedupeSequentialPoints(restoredTripTrace.matchedPath);
    const restoredFirstSnappedPoint = restoredMatchedPath[0] ?? null;
    const restoredRouteState: TripRouteRenderState =
      restoredFirstSnappedPoint ? 'ON_ROAD' : 'PRE_ROAD';
    const restoredConnector = buildTripStartConnector({
      rawStartPoint: restoredTripTrace.rawStartPoint,
      firstSnappedPoint: restoredFirstSnappedPoint,
      roadPath: restoredMatchedPath,
    });
    routeRenderStateRef.current = restoredRouteState;
    setRouteRenderState(restoredRouteState);
    firstSnappedRoadPointRef.current = restoredFirstSnappedPoint;
    setFirstSnappedRoadPoint(restoredFirstSnappedPoint);
    startConnectorPathRef.current = restoredConnector;
    setStartConnectorPath(restoredConnector);
    routePointsRef.current = restoredMatchedPath;
    travelPathRef.current = dedupeSequentialPoints(restoredMatchedPath);
    lastMatchedRoadProjectionRef.current =
      localSnapRoadPath.length >= 2 && restoredMatchedPath.length > 0
        ? (() => {
            const projection = projectPointToRoadPath(
              restoredMatchedPath[restoredMatchedPath.length - 1],
              localSnapRoadPath,
            );
            return projection && projection.distanceKm <= LOCAL_CENTERLINE_PROJECTION_MAX_DISTANCE_KM
              ? projection
              : null;
          })()
        : null;
    setRoutePoints(restoredMatchedPath);
    setTravelPath(travelPathRef.current);
    const startedAtMs = new Date(restoredTripTrace.startedAt).getTime();
    setElapsedSeconds(
      Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0,
    );
    setDistanceKm(polylineDistanceKm(restoredMatchedPath));
    const resumePoint =
      restoredMatchedPath[restoredMatchedPath.length - 1] ?? restoredTripTrace.rawStartPoint ?? null;
    if (resumePoint) {
      updateMarkerPosition(resumePoint);
      followCamera(resumePoint, true);
      lastRawTrackPointRef.current = resumePoint;
    }
    onTripStatusChange?.({
      status: 'app_recovered',
      recordedAt: new Date().toISOString(),
      latitude: resumePoint?.latitude ?? null,
      longitude: resumePoint?.longitude ?? null,
    });
  }, [forceNewTripSession, localSnapRoadPath, onTripStatusChange, restoredTripTrace]);

  useEffect(() => {
    hasConfirmedMovementRef.current = hasConfirmedMovement;
  }, [hasConfirmedMovement]);

  useEffect(() => {
    routePointsRef.current = routePoints;
  }, [routePoints]);

  useEffect(() => {
    travelPathRef.current = travelPath;
  }, [travelPath]);

  useEffect(() => {
    routeRenderStateRef.current = routeRenderState;
  }, [routeRenderState]);

  useEffect(() => {
    firstSnappedRoadPointRef.current = firstSnappedRoadPoint;
  }, [firstSnappedRoadPoint]);

  useEffect(() => {
    startConnectorPathRef.current = startConnectorPath;
  }, [startConnectorPath]);

  useEffect(() => {
    if (!isTripStarted || !coords || !mapRef.current) {
      return;
    }

    if (!hasFocusedTripStartCameraRef.current) {
      transitionCameraToNavigationMode(coords);
      return;
    }

    mapRef.current.animateCamera(
      {
        center: coords,
        zoom: NAV_CAMERA_ZOOM,
        heading: IDLE_CAMERA_HEADING,
        pitch: NAV_CAMERA_PITCH,
      },
      { duration: NAV_CAMERA_ANIMATION_MS },
    );
  }, [headingDeg, isTripStarted]);

  useEffect(() => {
    const previousConnectivity = lastConnectivityStateRef.current;
    lastConnectivityStateRef.current = isNetworkAvailable;
    if (!isTripStartedRef.current || previousConnectivity === null || previousConnectivity === isNetworkAvailable) {
      return;
    }

    onTripStatusChange?.({
      status: isNetworkAvailable ? 'connectivity_online' : 'connectivity_offline',
      recordedAt: new Date().toISOString(),
      latitude: latestActualCoordsRef.current?.latitude ?? null,
      longitude: latestActualCoordsRef.current?.longitude ?? null,
    });
  }, [isNetworkAvailable, onTripStatusChange]);

  useEffect(() => {
    onLocationVisibilityChange?.(hasValidCoords);
  }, [hasValidCoords, onLocationVisibilityChange]);

  useEffect(() => {
    if (!coords) {
      markerInitializedRef.current = false;
      lastAnimatedMarkerPointRef.current = null;
      return;
    }

    const animationDuration = getMotionDurationMs({
      from: lastAnimatedMarkerPointRef.current,
      to: coords,
      speedMetersPerSecond: speedKmh > 0 ? speedKmh / 3.6 : null,
    });

    if (!markerInitializedRef.current) {
      markerInitializedRef.current = true;
      lastAnimatedMarkerPointRef.current = coords;
      return;
    }

    lastAnimatedMarkerPointRef.current = coords;
  }, [coords, speedKmh]);

  useEffect(() => {
    if (!locationEnabled) {
      Alert.alert(
        'Location required',
        'Location access is required to start live trip navigation.',
        [{ text: 'OK', onPress: () => onExitTripNavigation?.() ?? onBackToHome() }],
      );
      return;
    }

    if (hasStartedSessionRef.current) {
      return;
    }

    if (tripStartLockOpenedAtRef.current === null) {
      tripStartLockOpenedAtRef.current = Date.now();
    }

    const startPoint =
      lastAcceptedSampleRef.current?.point ?? latestActualCoordsRef.current ?? coords ?? null;
    const hasAccurateStartLock =
      !!startPoint &&
      (displayAccuracyMeters === null ||
        displayAccuracyMeters <= FAST_START_REQUIRED_ACCURACY_METERS);
    const hasWaitedLongEnough =
      !!startPoint &&
      tripStartLockOpenedAtRef.current !== null &&
      Date.now() - tripStartLockOpenedAtRef.current >= TRIP_START_LOCK_TIMEOUT_MS;

    setIsInitializingTripStart(!hasAccurateStartLock && !hasWaitedLongEnough);

    if (!startPoint || (!hasAccurateStartLock && !hasWaitedLongEnough)) {
      return;
    }

    tripStartLockOpenedAtRef.current = null;
    setIsInitializingTripStart(false);
    hasStartedSessionRef.current = true;
    void beginTripSession(startPoint).then((started) => {
      if (!started) {
        hasStartedSessionRef.current = false;
      }
    });
  }, [coords, displayAccuracyMeters, locationEnabled, onBackToHome, onExitTripNavigation]);

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
    displayAccuracyMetersRef.current = displayAccuracyMeters;
  }, [displayAccuracyMeters]);

  useEffect(() => {
    if (!coords) {
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
        const pieces = [first?.street, first?.district ?? first?.subregion, first?.city].filter(
          (value): value is string => Boolean(value && value.trim().length > 0),
        );

        if (pieces.length > 0) {
          setCurrentAreaLabel(pieces.slice(0, 2).join(', '));
          lastGeocodedPointRef.current = coords;
        }
      } catch {
        // Keep the last known label.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coords]);

  useEffect(() => {
    if (!locationEnabled) {
      return;
    }

    let cancelled = false;
    locationWatchRef.current?.stop();
    locationWatchRef.current = null;

    void (async () => {
      const tracker = await startLiveGpsTracker({
        accuracy: ACTIVE_LOCATION_ACCURACY,
        initialTimeoutMs: INITIAL_LOCATION_TIMEOUT_MS,
        watchIntervalMs: WATCH_LOCATION_INTERVAL_MS,
        distanceIntervalMeters: GPS_DISTANCE_INTERVAL_METERS,
        minimumPointDistanceMeters: GPS_POINT_FILTER_DISTANCE_METERS,
        staleSampleThresholdMs: GPS_STALE_SAMPLE_THRESHOLD_MS,
        onSeed: (sample) => {
          if (cancelled) {
            return;
          }
          void handleIncomingSample(sample, true);
        },
        onUpdate: (sample) => {
          if (cancelled) {
            return;
          }
          void handleIncomingSample(sample, false);
        },
        onError: () => {
          // Keep the last stable state if GPS briefly fails.
        },
      });

      if (cancelled) {
        tracker.stop();
        return;
      }

      locationWatchRef.current = tracker;
    })();

    return () => {
      cancelled = true;
      locationWatchRef.current?.stop();
      locationWatchRef.current = null;
    };
  }, [locationEnabled]);

  useEffect(() => {
    return () => {
      locationWatchRef.current?.stop();
      locationWatchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isTripStarted) {
      return;
    }

    const timer = setInterval(() => {
      const shouldForceFlush =
        pendingRawPointsRef.current.length >= NAV_LIVE_ROUTE_MIN_BATCH_POINTS &&
        (Date.now() - lastForcedRouteRefreshAtRef.current >= NAV_FORCE_ROUTE_REFRESH_MIN_INTERVAL_MS ||
          getPendingRouteDistanceKm() >= NAV_FORCE_ROUTE_REFRESH_MIN_DISTANCE_KM);
      if (shouldForceFlush) {
        lastForcedRouteRefreshAtRef.current = Date.now();
      }
      void flushBufferedRoadPoints(shouldForceFlush);
    }, NAV_LIVE_ROUTE_FLUSH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isTripStarted]);

  const headingBetweenDeg = (from: LatLngPoint, to: LatLngPoint) => {
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const transitionToOnRoad = (segment: LatLngPoint[]) => {
    if (routeRenderStateRef.current === 'ON_ROAD') {
      return;
    }

    const firstSnappedPoint = segment[0] ?? null;
    routeRenderStateRef.current = 'ON_ROAD';
    setRouteRenderState('ON_ROAD');
    firstSnappedRoadPointRef.current = firstSnappedPoint;
    setFirstSnappedRoadPoint(firstSnappedPoint);
    startConnectorPathRef.current = [];
    setStartConnectorPath([]);
  };

  const appendRouteSegment = (
    segment: LatLngPoint[],
    options?: {
      rawSamples?: TripTraceRawPoint[];
      source?: TripMatchedPointSource;
    },
  ) => {
    const mergedRaw = mergeRouteSegment(routePointsRef.current, segment);
    routePointsRef.current = mergedRaw;
    const displayPath = dedupeSequentialPoints(mergedRaw);
    travelPathRef.current = displayPath;
    setRoutePoints(mergedRaw);
    setTravelPath(displayPath);
    const latestDisplayPoint = displayPath[displayPath.length - 1] ?? null;
    lastMatchedRoadProjectionRef.current =
      localSnapRoadPath.length >= 2 && latestDisplayPoint
        ? projectPointToRoadPath(latestDisplayPoint, localSnapRoadPath)
        : null;

    if (options?.rawSamples && options.rawSamples.length > 0 && options.source && onTripMatchedPathRecord) {
      const matchedTracePoints = buildMatchedTracePointsFromSegment({
        path: segment,
        rawSamples: options.rawSamples,
        source: options.source,
      });
      if (matchedTracePoints.length > 0) {
        onTripMatchedPathRecord({
          points: matchedTracePoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: point.recordedAt,
            source: point.source,
          })),
        });
      }
    }

    return displayPath;
  };

  const updateMarkerPosition = (point: LatLngPoint) => {
    latestActualCoordsRef.current = point;
    lastDisplayPointRef.current = point;
    setCoords(point);
  };

  const getStabilizedPoint = ({
    point,
    accuracy,
    speedKmh: sampleSpeedKmh,
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

    const nextBuffer = [...recentAcceptedPointsRef.current.slice(-4), point];
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
          ? 0.8
          : accuracy <= MAX_ACCEPTED_ACCURACY_METERS
            ? 0.64
            : 0.42
        : 0.58;
    const motionBlend =
      sampleSpeedKmh !== null && typeof sampleSpeedKmh === 'number'
        ? sampleSpeedKmh >= 24
          ? 0.9
          : sampleSpeedKmh >= 10
            ? 0.78
            : sampleSpeedKmh >= 4
              ? 0.6
              : 0.4
        : 0.46;
    let blendFactor = Math.max(accuracyBlend, motionBlend);
    if (movedKm <= 0.006) {
      blendFactor = Math.min(
        blendFactor,
        sampleSpeedKmh !== null &&
          typeof sampleSpeedKmh === 'number' &&
          sampleSpeedKmh >= 6
          ? 0.56
          : 0.42,
      );
    }
    blendFactor = Math.max(blendFactor, 0.24);

    const stabilizedPoint = {
      latitude:
        previousAccepted.latitude + (averagedPoint.latitude - previousAccepted.latitude) * blendFactor,
      longitude:
        previousAccepted.longitude + (averagedPoint.longitude - previousAccepted.longitude) * blendFactor,
    };

    recentAcceptedPointsRef.current = [...nextBuffer.slice(0, -1), stabilizedPoint];
    return stabilizedPoint;
  };

  const applyNavigationHeading = (nextHeading: number, blend = 0.26) => {
    const normalizedTarget = ((nextHeading % 360) + 360) % 360;
    const current = liveHeadingRef.current;
    if (current === null || !Number.isFinite(current)) {
      liveHeadingRef.current = normalizedTarget;
      setHeadingDeg(normalizedTarget);
      return;
    }

    const delta = shortestAngleDelta(current, normalizedTarget);
    const smoothed = ((current + delta * blend) % 360 + 360) % 360;
    liveHeadingRef.current = smoothed;
    setHeadingDeg(smoothed);
  };

  const seedVisibleLocation = (point: LatLngPoint, accuracy?: number | null) => {
    updateMarkerPosition(point);
    setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);

    if (mapRef.current && !hasCenteredRef.current) {
      mapRef.current.animateCamera(
        {
          center: point,
          zoom: IDLE_CAMERA_ZOOM,
          heading: IDLE_CAMERA_HEADING,
          pitch: IDLE_CAMERA_PITCH,
        },
        { duration: NAV_CAMERA_ANIMATION_MS },
      );
      hasCenteredRef.current = true;
    }
  };

  const followCamera = (point: LatLngPoint, immediate = false) => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: point,
        zoom: isTripStartedRef.current ? NAV_CAMERA_ZOOM : IDLE_CAMERA_ZOOM,
        heading: IDLE_CAMERA_HEADING,
        pitch: isTripStartedRef.current ? NAV_CAMERA_PITCH : IDLE_CAMERA_PITCH,
      },
      { duration: immediate ? 0 : NAV_CAMERA_ANIMATION_MS },
    );
    hasCenteredRef.current = true;
  };

  const transitionCameraToIdleMode = (point: LatLngPoint | null = latestActualCoordsRef.current) => {
    if (!mapRef.current || !point) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: point,
        zoom: IDLE_CAMERA_ZOOM,
        heading: IDLE_CAMERA_HEADING,
        pitch: IDLE_CAMERA_PITCH,
      },
      { duration: NAV_CAMERA_TRANSITION_MS },
    );
  };

  const transitionCameraToNavigationMode = (point: LatLngPoint | null = latestActualCoordsRef.current) => {
    if (!mapRef.current || !point) {
      return;
    }

    mapRef.current.animateCamera(
      {
        center: point,
        zoom: NAV_CAMERA_ZOOM,
        heading: IDLE_CAMERA_HEADING,
        pitch: NAV_CAMERA_PITCH,
      },
      { duration: NAV_CAMERA_TRANSITION_MS },
    );
    hasCenteredRef.current = true;
    hasFocusedTripStartCameraRef.current = true;
  };

  const handleIncomingSample = async (
    sample: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
      altitude?: number | null;
      provider?: string | null;
      timestampMs: number;
    },
    isSeed: boolean,
  ) => {
    const { latitude, longitude, accuracy, heading, speed, altitude, provider, timestampMs } = sample;
    const samplePoint = { latitude, longitude };
    const speedFromGpsKmh =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
    const recordedAt = new Date(timestampMs).toISOString();
    const previousAccepted = lastAcceptedSampleRef.current;
    const accuracyLimit = previousAccepted ? MAX_ACCEPTED_ACCURACY_METERS : INITIAL_VISIBLE_ACCURACY_METERS;
    const canUseWeakGpsRecovery =
      Boolean(previousAccepted) &&
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy > accuracyLimit &&
      accuracy <= WEAK_GPS_RECOVERY_ACCURACY_METERS &&
      timestampMs - (previousAccepted?.timestampMs ?? 0) >= 1800;

    if (
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy > accuracyLimit &&
      !canUseWeakGpsRecovery
    ) {
      setDisplayAccuracyMeters(accuracy);
      if (!previousAccepted && accuracy <= COARSE_FIRST_FIX_ACCURACY_METERS) {
        seedVisibleLocation(samplePoint, accuracy);
      }
      return;
    }

    if (previousAccepted) {
      const gapKm = distanceBetweenKm(previousAccepted.point, samplePoint);
      const elapsedSec = Math.max((timestampMs - previousAccepted.timestampMs) / 1000, 0);
      if (gapKm > MAX_LOCATION_JUMP_KM && elapsedSec <= 3) {
        setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
        return;
      }
    }

    let stablePoint = getStabilizedPoint({ point: samplePoint, accuracy, speedKmh: speedFromGpsKmh });
    if (canUseWeakGpsRecovery && previousAccepted) {
      stablePoint = {
        latitude: previousAccepted.point.latitude + (stablePoint.latitude - previousAccepted.point.latitude) * 0.22,
        longitude:
          previousAccepted.point.longitude + (stablePoint.longitude - previousAccepted.point.longitude) * 0.22,
      };
    }

    const lastDisplayPoint = lastDisplayPointRef.current ?? previousAccepted?.point ?? null;
    const derivedHeading =
      previousAccepted && distanceBetweenKm(previousAccepted.point, stablePoint) >= MIN_TRACK_MOVE_KM * 0.65
        ? headingBetweenDeg(previousAccepted.point, stablePoint)
        : null;
    const hasDirectionalSignal =
      derivedHeading !== null ||
      (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0);
    if (lastDisplayPoint) {
      const displayGapKm = distanceBetweenKm(lastDisplayPoint, stablePoint);
      const displayThresholdKm = getAdaptiveGpsMotionThresholdKm({
        accuracyMeters: accuracy,
        speedKmh: speedFromGpsKmh,
        hasDirectionalSignal,
        mode: 'display',
      });
      const likelyStationary =
        displayGapKm < displayThresholdKm ||
        (speedFromGpsKmh !== null && speedFromGpsKmh <= MAX_STATIONARY_SPEED_KMH) ||
        shouldRejectGpsBacktrack({
          movementKm: displayGapKm,
          headingDeltaDeg:
            derivedHeading !== null && liveHeadingRef.current !== null
              ? shortestAngleDelta(liveHeadingRef.current, derivedHeading)
              : null,
          accuracyMeters: accuracy,
          speedKmh: speedFromGpsKmh,
          mode: 'display',
        });

      if (likelyStationary) {
        movementConfirmationCountRef.current = 0;
        stablePoint = lastDisplayPoint;
      } else {
        const shouldConfirmMovement = shouldRequireGpsMotionConfirmation({
          movementKm: displayGapKm,
          thresholdKm: displayThresholdKm,
          speedKmh: speedFromGpsKmh,
          hasDirectionalSignal,
        });
        if (shouldConfirmMovement) {
          movementConfirmationCountRef.current += 1;
        } else {
          movementConfirmationCountRef.current = MOVEMENT_CONFIRMATION_COUNT;
        }

        if (movementConfirmationCountRef.current < MOVEMENT_CONFIRMATION_COUNT) {
          stablePoint = lastDisplayPoint;
        } else {
          movementConfirmationCountRef.current = 0;
        }
      }
    }

    lastAcceptedSampleRef.current = {
      point: stablePoint,
      timestampMs,
    };
    setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
    updateMarkerPosition(stablePoint);
    if (isTripStartedRef.current && !hasFocusedTripStartCameraRef.current) {
      transitionCameraToNavigationMode(stablePoint);
    }
    if (
      isTripStartedRef.current &&
      (typeof accuracy !== 'number' || accuracy <= ACTIVE_CAMERA_ACCURACY_METERS)
    ) {
      followCamera(stablePoint);
    }

    const movementGapKm = previousAccepted ? distanceBetweenKm(previousAccepted.point, stablePoint) : 0;
    const liveDerivedHeading =
      previousAccepted && movementGapKm >= 0.0015
        ? headingBetweenDeg(previousAccepted.point, stablePoint)
        : null;

    if (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0) {
      const shouldUseHeading =
        (speedFromGpsKmh !== null && speedFromGpsKmh >= 6) ||
        movementGapKm >= 0.002;
      if (shouldUseHeading) {
        const headingTarget =
          liveDerivedHeading === null
            ? heading
            : ((liveDerivedHeading + shortestAngleDelta(liveDerivedHeading, heading) * 0.34) % 360 + 360) % 360;
        applyNavigationHeading(headingTarget, 0.24);
      }
    } else if (liveDerivedHeading !== null) {
      if (movementGapKm >= 0.0025) {
        applyNavigationHeading(liveDerivedHeading, 0.2);
      }
    }

    const insideBoundary = isPointInsidePolygon(stablePoint, OBRERO_GEOFENCE);
    if (isTripStartedRef.current && !insideBoundary && !hasShownExitAlertRef.current) {
      hasShownExitAlertRef.current = true;
      onGeofenceExit?.({ location: stablePoint });
    }
    if (insideBoundary) {
      hasShownExitAlertRef.current = false;
    }

    if (!isTripStartedRef.current) {
      if (!isSeed && mapRef.current && !hasCenteredRef.current) {
        seedVisibleLocation(stablePoint, accuracy);
      }
      return;
    }

    const previousRawPoint = lastRawTrackPointRef.current;
    const nowMs = timestampMs;
    const lastMs = lastTrackTimestampMsRef.current ?? nowMs;
    const deltaSec = Math.max((nowMs - lastMs) / 1000, 0.001);
    const movedFromLastTrackKm = previousRawPoint ? distanceBetweenKm(previousRawPoint, stablePoint) : 0;
    const computedSpeedKmh = previousRawPoint ? movedFromLastTrackKm / (deltaSec / 3600) : 0;
    const effectiveSpeedKmh =
      speedFromGpsKmh !== null && Number.isFinite(speedFromGpsKmh) ? speedFromGpsKmh : computedSpeedKmh;
    const anchorPoint = tripStartAnchorRef.current ?? stablePoint;
    if (!tripStartAnchorRef.current) {
      tripStartAnchorRef.current = stablePoint;
    }
    const displacementFromAnchorKm = distanceBetweenKm(anchorPoint, stablePoint);
    const hasGoodAccuracy =
      typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? accuracy <= MAX_ACCEPTED_ACCURACY_METERS
        : false;
    const traceThresholdKm = getAdaptiveGpsMotionThresholdKm({
      accuracyMeters: accuracy,
      speedKmh: effectiveSpeedKmh,
      hasDirectionalSignal,
      mode: 'trace',
    });
    const hasMeaningfulStep = movedFromLastTrackKm >= Math.max(TRACE_START_MIN_STEP_KM, traceThresholdKm * 0.9);
    const hasMeaningfulDisplacement = displacementFromAnchorKm >= TRACE_START_MIN_DISPLACEMENT_KM;
    const hasSustainedSpeed = effectiveSpeedKmh >= TRACE_START_MIN_SPEED_KMH;

    onTripPointRecord?.({
      latitude: samplePoint.latitude,
      longitude: samplePoint.longitude,
      speed: effectiveSpeedKmh,
      heading: derivedHeading ?? (typeof heading === 'number' ? heading : null),
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      altitude: typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
      provider: provider ?? null,
      recordedAt,
    });
    const acceptedTelemetryPoint = {
      latitude: samplePoint.latitude,
      longitude: samplePoint.longitude,
      speed: effectiveSpeedKmh,
      heading: derivedHeading ?? (typeof heading === 'number' ? heading : null),
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      altitude: typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
      provider: provider ?? null,
      recordedAt,
    };
    acceptedTelemetryRef.current = [...acceptedTelemetryRef.current, acceptedTelemetryPoint];

    if (!hasConfirmedMovementRef.current) {
      if (
        hasGoodAccuracy &&
        hasMeaningfulStep &&
        hasMeaningfulDisplacement &&
        hasSustainedSpeed &&
        hasDirectionalSignal
      ) {
        movementValidationPointsRef.current = dedupeSequentialPoints([
          ...movementValidationPointsRef.current,
          stablePoint,
        ]).slice(-TRACE_START_REQUIRED_POINTS);
      } else if (
        !hasGoodAccuracy ||
        effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH ||
        displacementFromAnchorKm < TRACE_START_MIN_DISPLACEMENT_KM * 0.65
      ) {
        movementValidationPointsRef.current = [];
        if (effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH) {
          setSpeedKmh(0);
        }
      }

      if (movementValidationPointsRef.current.length < TRACE_START_REQUIRED_POINTS) {
        return;
      }

      hasConfirmedMovementRef.current = true;
      setHasConfirmedMovement(true);
      onTripStatusChange?.({
        status: 'movement_confirmed',
        recordedAt,
        latitude: stablePoint.latitude,
        longitude: stablePoint.longitude,
        metadata: {
          validationPoints: TRACE_START_REQUIRED_POINTS,
        },
      });
      pendingRawPointsRef.current = movementValidationPointsRef.current.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAt,
      }));
      movementValidationPointsRef.current = [];
      lastRawTrackPointRef.current = stablePoint;
      lastTrackTimestampMsRef.current = nowMs;
      lastForcedRouteRefreshAtRef.current = nowMs;
      if (pendingRawPointsRef.current.length >= NAV_LIVE_ROUTE_MIN_BATCH_POINTS) {
        void flushBufferedRoadPoints(true);
      }
    }

    if (!previousRawPoint && pendingRawPointsRef.current.length === 0) {
      lastRawTrackPointRef.current = stablePoint;
      pendingRawPointsRef.current = [acceptedTelemetryPoint];
      lastTrackTimestampMsRef.current = timestampMs;
    } else {
      const movedKm = movedFromLastTrackKm;
      const shouldSuppressTrackStep = shouldRejectGpsBacktrack({
        movementKm: movedKm,
        headingDeltaDeg:
          liveDerivedHeading !== null && liveHeadingRef.current !== null
            ? shortestAngleDelta(liveHeadingRef.current, liveDerivedHeading)
            : null,
        accuracyMeters: accuracy,
        speedKmh: effectiveSpeedKmh,
        mode: 'trace',
      });

      if (movedKm > MAX_POINT_GAP_KM || effectiveSpeedKmh > MAX_ACCEPTED_SPEED_KMH) {
        return;
      }

      if (
        movedKm < traceThresholdKm ||
        effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH ||
        shouldSuppressTrackStep
      ) {
        return;
      }

      pendingRawPointsRef.current = [...pendingRawPointsRef.current, acceptedTelemetryPoint];
      lastRawTrackPointRef.current = stablePoint;
      lastTrackTimestampMsRef.current = nowMs;
      const pendingDistanceKm = polylineDistanceKm(
        dedupeSequentialPoints([
          routePointsRef.current[routePointsRef.current.length - 1],
          ...pendingRawPointsRef.current.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          })),
        ].filter((point): point is LatLngPoint => Boolean(point))),
      );
      const enoughTimePassed = nowMs - lastForcedRouteRefreshAtRef.current >= NAV_FORCE_ROUTE_REFRESH_MIN_INTERVAL_MS;
      const enoughDistanceQueued = pendingDistanceKm >= NAV_FORCE_ROUTE_REFRESH_MIN_DISTANCE_KM;
      const shouldForceRouteRefresh =
        pendingRawPointsRef.current.length >= NAV_LIVE_ROUTE_MIN_BATCH_POINTS &&
        (enoughTimePassed || enoughDistanceQueued);
      if (shouldForceRouteRefresh) {
        lastForcedRouteRefreshAtRef.current = nowMs;
      }
      void flushBufferedRoadPoints(shouldForceRouteRefresh);
    }

    setSpeedKmh(Math.max(0, effectiveSpeedKmh));

  };

  const getPendingRouteDistanceKm = () =>
    polylineDistanceKm(
      dedupeSequentialPoints(
        [
          routePointsRef.current[routePointsRef.current.length - 1],
          ...pendingRawPointsRef.current.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          })),
        ].filter((point): point is LatLngPoint => Boolean(point)),
      ),
    );

  const flushBufferedRoadPoints = (force = false): Promise<void> => {
    if (pendingRawPointsRef.current.length === 0) {
      return roadSnapQueueRef.current;
    }

    if (roadMatchInFlightRef.current) {
      return roadSnapQueueRef.current;
    }

    const minimumBatchPoints = force ? NAV_LIVE_ROUTE_MIN_BATCH_POINTS : ROAD_MATCH_BATCH_SIZE;
    if (pendingRawPointsRef.current.length < minimumBatchPoints) {
      return roadSnapQueueRef.current;
    }

    const batchPoints = pendingRawPointsRef.current.splice(
      0,
      Math.min(
        pendingRawPointsRef.current.length,
        force ? NAV_LIVE_ROUTE_BATCH_SIZE : ROAD_MATCH_BATCH_SIZE,
      ),
    );

    if (batchPoints.length < minimumBatchPoints) {
      pendingRawPointsRef.current = [...batchPoints, ...pendingRawPointsRef.current];
      return roadSnapQueueRef.current;
    }

    roadMatchInFlightRef.current = true;
    const matchGeneration = liveRouteMatchGenerationRef.current;

    roadSnapQueueRef.current = roadSnapQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          if (matchGeneration !== liveRouteMatchGenerationRef.current || !isTripStartedRef.current) {
            return;
          }

          const anchorPoint = routePointsRef.current[routePointsRef.current.length - 1] ?? null;
          const overlapPoints = roadMatchCarryoverRef.current;
          const inputSamples = [
            ...(anchorPoint
              ? [
                  {
                    latitude: anchorPoint.latitude,
                    longitude: anchorPoint.longitude,
                    recordedAt:
                      overlapPoints[0]?.recordedAt ??
                      batchPoints[0]?.recordedAt ??
                      new Date().toISOString(),
                  } satisfies TripTraceRawPoint,
                ]
              : []),
            ...overlapPoints,
            ...batchPoints,
          ];
          const dedupedInputSamples = inputSamples.filter((point, index, source) => {
            if (index === 0) {
              return true;
            }
            const previous = source[index - 1];
            return (
              Math.abs(previous.latitude - point.latitude) >= 0.000001 ||
              Math.abs(previous.longitude - point.longitude) >= 0.000001
            );
          });

          const rawSegment = dedupeSequentialPoints(
            dedupedInputSamples.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
            })),
          );
          if (rawSegment.length < 2) {
            roadMatchCarryoverRef.current = dedupedInputSamples.slice(
              Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
            return;
          }

          const latestPoint = rawSegment[rawSegment.length - 1] ?? null;
          const previousPoint = anchorPoint ?? rawSegment[0] ?? null;
          if (!latestPoint || !previousPoint) {
            roadMatchCarryoverRef.current = dedupedInputSamples.slice(
              Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
            return;
          }
          if (distanceBetweenKm(previousPoint, latestPoint) > MAX_POINT_GAP_KM) {
            roadMatchCarryoverRef.current = dedupedInputSamples.slice(
              Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
            return;
          }

          const previousMatchedPath = routePointsRef.current;
          const matchedResult = await buildLiveMatchedRouteSegmentDetailed({
            rawSamples: dedupedInputSamples,
            previousMatchedPath,
            seedPath: localSnapRoadPath,
            allowRemoteMatch: isNetworkAvailable,
          });
          const routeDisplaySegment = dedupeSequentialPoints(matchedResult.path ?? []);
          if (routeDisplaySegment.length < 2) {
            roadMatchCarryoverRef.current = dedupedInputSamples.slice(
              Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
            return;
          }

          const segmentDistanceKm = polylineDistanceKm(routeDisplaySegment);
          if (segmentDistanceKm < MIN_SNAPPED_MOVE_KM && previousMatchedPath.length > 0) {
            roadMatchCarryoverRef.current = dedupedInputSamples.slice(
              Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
            );
            return;
          }

          roadMatchCarryoverRef.current = dedupedInputSamples.slice(
            Math.max(dedupedInputSamples.length - ROAD_MATCH_OVERLAP_POINTS, 0),
          );
          const transitionStartPoint = routeDisplaySegment[0] ?? latestPoint;
          const isAlreadyOnRoad =
            routeRenderStateRef.current === 'ON_ROAD' || previousMatchedPath.length > 0;

          if (!isAlreadyOnRoad) {
            transitionToOnRoad([transitionStartPoint]);
          }
          const nextDisplayPath = appendRouteSegment(routeDisplaySegment, {
            rawSamples: batchPoints,
            source: matchedResult.source,
          });
          const previousHeadingPoint = routeDisplaySegment[0];
          const latestHeadingPoint = routeDisplaySegment[routeDisplaySegment.length - 1];
          if (previousHeadingPoint && latestHeadingPoint) {
            applyNavigationHeading(headingBetweenDeg(previousHeadingPoint, latestHeadingPoint), 0.18);
          }
          setDistanceKm(polylineDistanceKm(nextDisplayPath));
        } finally {
          roadMatchInFlightRef.current = false;
          if (pendingRawPointsRef.current.length >= ROAD_MATCH_BATCH_SIZE) {
            void flushBufferedRoadPoints(false);
          }
        }
      });

    return roadSnapQueueRef.current;
  };

  const drainBufferedRoadPoints = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (pendingRawPointsRef.current.length === 0) {
        await roadSnapQueueRef.current.catch(() => undefined);
        return;
      }
      const activeQueue = flushBufferedRoadPoints(true);
      await activeQueue.catch(() => undefined);
      if (roadSnapQueueRef.current !== activeQueue) {
        await roadSnapQueueRef.current.catch(() => undefined);
      }
    }
  };

  const waitForTripFinalizationLock = async () => {
    const readFinalizeState = () => {
      const acceptedTelemetry = filterAcceptedTripTelemetry(acceptedTelemetryRef.current);
      const latestAcceptedAccuracy =
        typeof acceptedTelemetry.at(-1)?.accuracy === 'number'
          ? acceptedTelemetry.at(-1)?.accuracy ?? null
          : null;
      const resolvedAccuracyMeters =
        latestAcceptedAccuracy ?? displayAccuracyMetersRef.current ?? null;

      return {
        acceptedPointCount: acceptedTelemetry.length,
        hasAccuracyLock:
          resolvedAccuracyMeters === null ||
          resolvedAccuracyMeters <= FINALIZE_REQUIRED_ACCURACY_METERS,
      };
    };

    let finalizeState = readFinalizeState();
    if (
      finalizeState.hasAccuracyLock &&
      finalizeState.acceptedPointCount >= FINALIZE_MIN_VALID_POINTS
    ) {
      return finalizeState;
    }

    const startedAtMs = Date.now();
    while (Date.now() - startedAtMs < FINALIZE_LOCK_TIMEOUT_MS) {
      setTripSummary((prev) =>
        prev
          ? {
              ...prev,
              statusText: `Waiting for a cleaner GPS lock before finalizing (${Math.max(
                finalizeState.acceptedPointCount,
                0,
              )}/${FINALIZE_MIN_VALID_POINTS} valid points)`,
              isBusy: true,
            }
          : prev,
      );
      if (pendingRawPointsRef.current.length > 0) {
        void flushBufferedRoadPoints(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      finalizeState = readFinalizeState();
      if (
        finalizeState.hasAccuracyLock &&
        finalizeState.acceptedPointCount >= FINALIZE_MIN_VALID_POINTS
      ) {
        return finalizeState;
      }
    }

    return finalizeState;
  };

  const beginTripSession = async (startLocation: LatLngPoint | null) => {
    const startedAt = new Date().toISOString();
    const canStartTrip = (await onTripStart?.({ startLocation })) ?? true;
    if (!canStartTrip) {
      return false;
    }

    setTripSummary(null);
    setCompletedTripPreviewPath([]);
    setIsTripStarted(true);
    liveRouteMatchGenerationRef.current += 1;
    roadMatchInFlightRef.current = false;
    tripStartedAtRef.current = startedAt;
    setHasConfirmedMovement(false);
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setRouteRenderState('PRE_ROAD');
    setFirstSnappedRoadPoint(null);
    setStartConnectorPath([]);
    setRoutePoints([]);
    setTravelPath([]);
    routePointsRef.current = [];
    travelPathRef.current = [];
    lastMatchedRoadProjectionRef.current = null;
    routeRenderStateRef.current = 'PRE_ROAD';
    firstSnappedRoadPointRef.current = null;
    startConnectorPathRef.current = [];
    acceptedTelemetryRef.current = [];
    pendingRawPointsRef.current = [];
    roadMatchCarryoverRef.current = [];
    movementValidationPointsRef.current = [];
    hasConfirmedMovementRef.current = false;
    lastForcedRouteRefreshAtRef.current = 0;
    hasFocusedTripStartCameraRef.current = false;
    tripStartAnchorRef.current = startLocation;
    rawStartPointRef.current = startLocation;
    lastRawTrackPointRef.current = startLocation;
    lastTrackTimestampMsRef.current = startLocation ? Date.now() : null;
    acceptedTelemetryRef.current = startLocation
      ? [
          {
            latitude: startLocation.latitude,
            longitude: startLocation.longitude,
            speed: 0,
            heading: null,
            accuracy: displayAccuracyMeters,
            altitude: null,
            provider: null,
            recordedAt: startedAt,
          },
        ]
      : [];
    if (startLocation) {
      onTripPointRecord?.({
        latitude: startLocation.latitude,
        longitude: startLocation.longitude,
        speed: 0,
        heading: null,
        accuracy: displayAccuracyMeters,
        altitude: null,
        provider: null,
        recordedAt: startedAt,
      });
    }

    if (startLocation) {
      updateMarkerPosition(startLocation);
      transitionCameraToNavigationMode(startLocation);
    }

    return true;
  };

  const finishTripSession = async () => {
    if (tripSummary?.isBusy) {
      return;
    }

    setTripSummary({
      tripNumberText: activeTripNumber,
      durationText: `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`,
      distanceText: `${Math.max(0, distanceKm).toFixed(2)} km`,
      speedText: `${Math.max(0, speedKmh).toFixed(1)} km/h`,
      statusText: netInfo.isConnected
        ? 'Finalizing route and matching it to the road...'
        : 'Saving the trip locally and waiting to sync the route...',
      pickupText: null,
      destinationText: null,
      fareText: formatTripReceiptFare(10),
      isBusy: true,
    });

    const finalizeLockState = await waitForTripFinalizationLock();
    if (finalizeLockState.acceptedPointCount < 2) {
      setTripSummary(null);
      Alert.alert(
        'Need a few more GPS points',
        'Keep the trip running a little longer so we can finish with a clean OSRM-matched route.',
      );
      return;
    }

    await drainBufferedRoadPoints();

    const finalPath =
      travelPathRef.current.length > 0
        ? travelPathRef.current
        : smoothDisplayedRoutePath(
            dedupeSequentialPoints([
              ...routePointsRef.current,
              ...pendingRawPointsRef.current.map((point) => ({
                latitude: point.latitude,
                longitude: point.longitude,
              })),
            ]),
          );
    const finalTelemetry = acceptedTelemetryRef.current;
    const finalTelemetryPath = dedupeSequentialPoints(
      finalTelemetry.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );
    const reconstruction = await reconstructCompletedTripPath(finalTelemetry);
    console.info('[TripReconstruction] Navigation completed trip reconstruction.', {
      status: reconstruction.status,
      provider: reconstruction.matchedProvider,
      rawAcceptedPoints: reconstruction.rawAcceptedPath.length,
      smoothedPoints: reconstruction.smoothedAcceptedPath.length,
      preprocessedPoints: reconstruction.preprocessedPath.length,
      reconstructedPoints: reconstruction.reconstructedPath.length,
      rejectedOutliers: reconstruction.rejectedOutlierCount,
    });
    const reconstructionCandidatePath =
      reconstruction.reconstructedPath.length > 1
        ? reconstruction.reconstructedPath
        : reconstruction.preprocessedPath.length > 1
          ? reconstruction.preprocessedPath
          : finalPath.length > 1
            ? finalPath
            : finalTelemetryPath;
    const reconstructionFallbackPath =
      reconstruction.preprocessedPath.length > 1
        ? reconstruction.preprocessedPath
        : finalPath.length > 1
          ? finalPath
          : finalTelemetryPath;
    const roadAlignmentResult = await buildRoadAlignedTripPathDetailed({
      candidatePath: reconstructionCandidatePath,
      fallbackPath: reconstructionFallbackPath,
      preserveDetailedGeometry:
        typeof reconstruction.routeMatchMetadata?.provider === 'string' &&
        reconstruction.routeMatchMetadata.provider !== 'local-directional',
      trustCandidateGeometry:
        reconstructionCandidatePath.length > 1 &&
        ((typeof reconstruction.routeMatchMetadata?.provider === 'string' &&
          reconstruction.routeMatchMetadata.provider !== 'local-directional') ||
          reconstruction.preprocessedPath.length > 1 ||
          reconstruction.rawAcceptedPath.length > 1),
    });
    const roadAlignedFinalPath = roadAlignmentResult.path ?? reconstructionFallbackPath;
    const completedDistanceKm =
      distanceKm > 0 ? distanceKm : polylineDistanceKm(roadAlignedFinalPath);
    const durationSeconds = elapsedSeconds;
    const averageSpeed =
      durationSeconds > 0 ? completedDistanceKm / (durationSeconds / 3600) : speedKmh;
    const completedStartedAt = tripStartedAtRef.current;
    const completedEndedAt = new Date().toISOString();
    const completedRawStartPoint = rawStartPointRef.current;
    const completedStartEndpointSelection = await selectTripStartEndpointFromBuildings({
      roadPath: roadAlignedFinalPath,
      rawStartPoint: completedRawStartPoint,
    });
    const completedDashedStartConnector =
      completedStartEndpointSelection.dashedConnector.length > 0
        ? completedStartEndpointSelection.dashedConnector
        : [...startConnectorPathRef.current];
    const completedMatchedStartPoint =
      completedStartEndpointSelection.finalEndpoint ??
      routePointsRef.current[0] ??
      roadAlignedFinalPath[0] ??
      null;
    const completedRawEndPoint =
      finalTelemetry.at(-1)
        ? {
            latitude: finalTelemetry.at(-1)!.latitude,
            longitude: finalTelemetry.at(-1)!.longitude,
          }
        : latestActualCoordsRef.current;
    const completedEndEndpointSelection = await selectTripEndpointFromBuildings({
      roadPath: roadAlignedFinalPath,
      rawEndPoint: completedRawEndPoint,
    });
    const completedMatchedEndPoint =
      completedEndEndpointSelection.finalEndpoint ??
      roadAlignedFinalPath.at(-1) ??
      latestActualCoordsRef.current;
    const completedLocationLabels = await resolveTripDisplayLocationLabels({
      matchedStartPoint: completedMatchedStartPoint,
      matchedEndPoint: completedMatchedEndPoint,
      routePath: roadAlignedFinalPath,
      filteredStartPoint: completedRawStartPoint,
      filteredEndPoint: completedRawEndPoint,
    });

    setIsTripStarted(false);
    transitionCameraToIdleMode(completedMatchedEndPoint ?? latestActualCoordsRef.current);
    setCompletedTripPreviewPath(roadAlignedFinalPath);
    setTripSummary({
      tripNumberText: activeTripNumber,
      durationText: `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
      distanceText: formatTripReceiptDistance(completedDistanceKm * 1000),
      speedText: `${Math.max(0, averageSpeed).toFixed(1)} km/h`,
      statusText:
        roadAlignedFinalPath.length > 1
          ? 'Trip route saved successfully'
          : 'Trip saved and waiting for route points',
      pickupText: completedLocationLabels.startDisplayName,
      destinationText: completedLocationLabels.endDisplayName,
      fareText: formatTripReceiptFare(10),
      isBusy: false,
    });
    const maxSpeedKph = finalTelemetry.reduce((maxSpeed, point) => {
      if (typeof point.speed === 'number' && Number.isFinite(point.speed)) {
        return Math.max(maxSpeed, point.speed);
      }
      return maxSpeed;
    }, 0);
    const idleDurationSeconds = finalTelemetry.reduce((idleSeconds, point, index, source) => {
      if (index === 0) {
        return idleSeconds;
      }
      const previousPoint = source[index - 1];
      const deltaSeconds = Math.max(
        0,
        (new Date(point.recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()) / 1000,
      );
      const movedKm = polylineDistanceKm([
        { latitude: previousPoint.latitude, longitude: previousPoint.longitude },
        { latitude: point.latitude, longitude: point.longitude },
      ]);
      const isIdle =
        (typeof point.speed === 'number' && point.speed <= MAX_STATIONARY_SPEED_KMH) ||
        movedKm <= MIN_TRACK_MOVE_KM;
      return isIdle ? idleSeconds + deltaSeconds : idleSeconds;
    }, 0);
    const accuracyReadings = finalTelemetry
      .map((point) => (typeof point.accuracy === 'number' ? point.accuracy : null))
      .filter((value): value is number => value !== null);
    const gpsQualitySummary: TripGpsQualitySummary | null =
      accuracyReadings.length > 0
        ? {
            averageAccuracyMeters:
              accuracyReadings.reduce((sum, value) => sum + value, 0) / accuracyReadings.length,
            bestAccuracyMeters: Math.min(...accuracyReadings),
            worstAccuracyMeters: Math.max(...accuracyReadings),
            lowConfidencePointCount: accuracyReadings.filter((value) => value > 25).length,
            highConfidencePointCount: accuracyReadings.filter((value) => value <= 25).length,
            confidence:
              accuracyReadings.filter((value) => value > 25).length / accuracyReadings.length <= 0.2
                ? 'high'
                : accuracyReadings.filter((value) => value > 25).length / accuracyReadings.length <= 0.45
                  ? 'medium'
                  : 'low',
          }
        : null;

    onTripComplete({
      fare: 10,
      distanceKm: completedDistanceKm,
      durationSeconds,
      routePath: roadAlignedFinalPath,
      endLocation:
        roadAlignedFinalPath.length > 0
          ? roadAlignedFinalPath[roadAlignedFinalPath.length - 1]
          : latestActualCoordsRef.current,
      rawTelemetry: finalTelemetry,
      startedAt: completedStartedAt,
      endedAt: completedEndedAt,
      rawStartPoint: completedRawStartPoint,
      rawEndPoint: completedRawEndPoint,
      matchedStartPoint: completedMatchedStartPoint,
      matchedEndPoint: completedMatchedEndPoint,
      startDisplayName: completedLocationLabels.startDisplayName,
      endDisplayName: completedLocationLabels.endDisplayName,
      startCoordinate: completedLocationLabels.startCoordinate,
      endCoordinate: completedLocationLabels.endCoordinate,
      dashedStartConnector: completedDashedStartConnector,
      dashedEndConnector: completedEndEndpointSelection.dashedConnector,
      tripState: routeRenderStateRef.current,
      matchedPointCount: routePointsRef.current.length || roadAlignedFinalPath.length,
      averageSpeedKph: Math.max(0, averageSpeed),
      maxSpeedKph,
      idleDurationSeconds: Math.round(idleDurationSeconds),
      gpsQualitySummary,
      routeMatchSummary: pickPreferredRouteMatchSummary(
        roadAlignmentResult.metadata ?? null,
        reconstruction.routeMatchMetadata ?? null,
      ),
    });
    lastMatchedRoadProjectionRef.current = null;
    lastForcedRouteRefreshAtRef.current = 0;
    liveRouteMatchGenerationRef.current += 1;
    roadMatchInFlightRef.current = false;
    tripStartedAtRef.current = null;
  };

  const guidanceTitle = roadLabel || 'Trip started';
  const guidanceMessage = !hasConfirmedMovement
    ? 'Waiting for confirmed movement'
    : routeRenderState === 'PRE_ROAD'
      ? 'Finding the first road match'
    : isLowGpsAccuracy
      ? 'GPS signal weak'
      : visibleTraceHasRoute
        ? 'Live route updating'
        : 'Tracking live route';
  const movementState = !hasConfirmedMovement
    ? 'Waiting'
    : routeRenderState === 'PRE_ROAD'
      ? 'Matching road'
      : speedKmh >= 4
      ? 'Moving'
      : 'Tracking';
  const nextInstructionDistance = routeRenderState === 'ON_ROAD' && visibleTraceHasRoute ? '40 m' : '20 m';
  const laneHint = routeRenderState === 'ON_ROAD' && visibleTraceHasRoute ? '↑' : '←  ↑  ↑  ↑';
  const tripNavigationPolygons = [
    {
      id: 'trip-nav-geofence-fill',
      coordinates: OBRERO_GEOFENCE,
      strokeColor: 'rgba(0,0,0,0)',
      fillColor: geofenceFillColor,
      strokeWidth: 0,
    },
  ];
  const tripNavigationPolylines = [
    {
      id: 'trip-nav-geofence-outline',
      coordinates: geofenceLoop,
      strokeColor: geofenceStrokeColor,
      strokeWidth: 3,
    },
    ...(shouldShowStartConnector
      ? [
          {
            id: 'trip-nav-start-connector',
            coordinates: renderedTrace.dashedConnector,
            strokeColor: startConnectorColor,
            strokeWidth: 2,
            lineDashPattern: [6, 6],
          },
        ]
      : []),
    ...(liveDisplayPath.length > 1
      ? [
          {
            id: 'trip-nav-route-casing',
            coordinates: liveDisplayPath,
            strokeColor: routeCasingColor,
            strokeWidth: MAXIM_ROUTE_WIDTH_CASING_NAV,
          },
          {
            id: 'trip-nav-route-core',
            coordinates: liveDisplayPath,
            strokeColor: routeCoreColor,
            strokeWidth: MAXIM_ROUTE_WIDTH_CORE_NAV,
          },
        ]
      : []),
  ];
  const tripNavigationMarkers =
    coords
      ? [
          {
            id: 'trip-nav-driver',
            coordinate: coords,
            kind: 'navigation' as const,
            color: '#0F172A',
            rotationDeg: headingDeg,
            size: 38,
          },
        ]
      : [];

  return (
    <View style={styles.screen}>
      <OsmMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: OBRERO_GEOFENCE[0].latitude,
          longitude: OBRERO_GEOFENCE[0].longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        mapPadding={mapPadding}
        mapStyleUrl={osmMapStyleUrl}
        backgroundColor={osmBackgroundColor}
        pitchEnabled={false}
        rotateEnabled={false}
        polygons={tripNavigationPolygons}
        polylines={tripNavigationPolylines}
        markers={tripNavigationMarkers}
      />

      <View style={[styles.topHeader, { top: (insets.top || 0) + 10 }]}>
        <View style={styles.topHeaderCard}>
          <View style={styles.headerInstructionIcon}>
            <AppIcon name="navigation" size={28} color="#FFFFFF" active />
            <Text style={styles.headerInstructionDistance}>{nextInstructionDistance}</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
              {guidanceTitle}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{guidanceMessage}</Text>
          </View>
          <Text style={styles.headerLaneHint}>{laneHint}</Text>
        </View>
      </View>

      <View
        style={[styles.bottomPanel, { paddingBottom: (insets.bottom || 0) + 20 }]}
        onLayout={(event) => setPanelHeight(Math.max(132, event.nativeEvent.layout.height))}
      >
        <View style={styles.panelHandle} />

        <View style={styles.panelTopRow}>
          <Pressable style={styles.endTripCircle} onPress={() => void finishTripSession()}>
            <AppIcon name="x" size={26} color="#0F172A" />
          </Pressable>
          <View style={styles.panelCenterStats}>
            <Text style={styles.panelDuration}>{minutesText}</Text>
            <Text style={styles.panelMeta}>{kmText} km · {speedKmh.toFixed(1)} km/h</Text>
          </View>
          <Pressable
            style={styles.recenterCircle}
            onPress={() => transitionCameraToNavigationMode(latestActualCoordsRef.current ?? coords)}
          >
            <AppIcon name="navigation" size={24} color="#0F172A" />
          </Pressable>
        </View>

        <View style={styles.panelDivider} />

        <View style={styles.guidanceRow}>
          <View style={styles.guidanceIconWrap}>
            <AppIcon
              name={routeRenderState === 'ON_ROAD' && visibleTraceHasRoute ? 'map-pin' : 'navigation'}
              size={24}
              color="#0F172A"
              active
            />
          </View>
          <View style={styles.guidanceCopy}>
            <Text style={styles.guidanceTitle}>{guidanceTitle}</Text>
            <Text style={styles.guidanceText}>{guidanceMessage}</Text>
          </View>
        </View>

        <View style={styles.panelFooterRow}>
          <Text style={styles.panelFooterMeta}>
            {hasConfirmedMovement ? `${kmText} km traveled` : 'Trip tracking ready'}
          </Text>
          <Text style={styles.panelFooterMeta}>{speedKmh.toFixed(1)} km/h</Text>
        </View>
      </View>

      <TripSummaryModal
        visible={Boolean(tripSummary)}
        tripNumberText={tripSummary?.tripNumberText}
        durationText={tripSummary?.durationText ?? '0:00'}
        distanceText={tripSummary?.distanceText ?? '0.00 km'}
        speedText={tripSummary?.speedText ?? '0.0 km/h'}
        statusText={tripSummary?.statusText ?? 'Trip saved successfully'}
        pickupText={tripSummary?.pickupText}
        destinationText={tripSummary?.destinationText}
        fareText={tripSummary?.fareText}
        busy={tripSummary?.isBusy ?? false}
        onClose={() => {
          hasStartedSessionRef.current = false;
          tripStartLockOpenedAtRef.current = null;
          setIsInitializingTripStart(false);
          setTripSummary(null);
          setCompletedTripPreviewPath([]);
          onExitTripNavigation?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  topHeader: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 24,
  },
  topHeaderCard: {
    minHeight: 82,
    backgroundColor: NAV_INSTRUCTION_BLUE,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  headerInstructionIcon: {
    width: 42,
    height: 58,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  headerInstructionDistance: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 28,
    fontFamily: 'CircularStdMedium500',
  },
  headerLaneHint: {
    minWidth: 80,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  liveArrowWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveArrowPulse: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NAV_ARROW_OUTER_GLOW,
  },
  liveArrowShell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NAV_LIVE_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  rawStartMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  simpleGpsMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16A34A',
    borderWidth: 4,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleGpsAvatar: {
    borderWidth: 0,
  },
  headerSubtitle: {
    marginTop: 2,
    color: '#E0F7FF',
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  controlsColumn: {
    position: 'absolute',
    right: 18,
    gap: 10,
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 8,
  },
  panelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelCenterStats: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  panelDuration: {
    color: NAV_INSTRUCTION_BLUE,
    fontSize: 29,
    lineHeight: 34,
    fontFamily: 'CircularStdMedium500',
  },
  panelMeta: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  recenterCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  statusPillPrimary: {
    backgroundColor: '#E8FBF6',
  },
  statusPillWarn: {
    backgroundColor: '#FEF3C7',
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  statusPillTextPrimary: {
    color: NAV_BLUE_DARK,
  },
  statusPillTextWarn: {
    color: '#B45309',
  },
  panelDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 12,
  },
  guidanceRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guidanceIconWrap: {
    width: 32,
    height: 42,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidanceIconWrapWarn: {
    backgroundColor: '#FEF3C7',
  },
  guidanceCopy: {
    flex: 1,
  },
  guidanceTitle: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
  guidanceText: {
    marginTop: 1,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  endTripCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelFooterRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelFooterMeta: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  panelStatusRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryPillText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  endTripButton: {
    marginTop: 18,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTripButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
});

