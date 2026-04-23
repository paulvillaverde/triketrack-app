import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { HomeDashboardSheet } from '../components/home/HomeDashboardSheet';
import { StartTripPanel } from '../components/home/StartTripPanel';
import { TripNavigationPanel } from '../components/home/TripNavigationPanel';
import { GeofenceViolationBanner } from '../components/maps/GeofenceViolationBanner';
import { OsmMapView, type OsmMapViewHandle } from '../components/maps/OsmMapView';
import {
  OSM_VECTOR_DARK_STYLE,
  OSM_LIGHT_BACKGROUND,
  OSM_MAXIM_DARK_BACKGROUND,
  OSM_VECTOR_LIGHT_STYLE_URL,
} from '../components/maps/osmTheme';
import {
  NotificationCenterModal,
  OutsideGeofenceModal,
  TripSummaryModal,
  type NotificationCenterItem,
} from '../components/modals';
import { AppIcon, Avatar } from '../components/ui';
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
  type TripCompletionPayload,
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
  buildTripStartConnector,
  projectPointToRoadPath,
  type TripRouteRenderState,
  type TripRoadProjection,
  type TripMatchedPointSource,
  type TripTraceRawPoint,
} from '../lib/tripTrace';
import {
  COARSE_FIRST_FIX_ACCURACY_METERS,
  FAST_START_REQUIRED_ACCURACY_METERS,
  ACTIVE_CAMERA_ACCURACY_METERS,
  ACTIVE_LOCATION_ACCURACY,
  FINALIZE_LOCK_TIMEOUT_MS,
  FINALIZE_MIN_VALID_POINTS,
  FINALIZE_REQUIRED_ACCURACY_METERS,
  GPS_POINT_FILTER_DISTANCE_METERS,
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
  LOW_BATTERY_MAP_ACCENT,
  LOW_BATTERY_MAP_ACCENT_SOFT,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_CHROME_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
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
  MIN_ROAD_MATCH_POINTS,
  MIN_SNAPPED_MOVE_KM,
  MIN_TRACK_MOVE_KM,
  MOVEMENT_CONFIRMATION_COUNT,
  NORMAL_CAMERA,
  OBRERO_GEOFENCE,
  ROAD_MATCH_BATCH_SIZE,
  ROAD_MATCH_OVERLAP_POINTS,
  shouldRejectGpsBacktrack,
  shouldRequireGpsMotionConfirmation,
  getAdaptiveGpsMotionThresholdKm,
  WEAK_GPS_RECOVERY_ACCURACY_METERS,
  WATCH_LOCATION_INTERVAL_MS,
} from './homeScreenShared';

const LOCAL_CENTERLINE_PROJECTION_MAX_DISTANCE_KM = 0.03;

type HomeStatsFilter = 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_30_DAYS';

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
  locationEnabled: boolean;
  tripOpenPending?: boolean;
  onLocationVisibilityChange?: (visible: boolean) => void;
  notifications: NotificationCenterItem[];
  unreadNotificationCount: number;
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenNotification: (notification: NotificationCenterItem) => void;
  onTripComplete: (payload: TripCompletionPayload) => void;
  onTripStart?: (payload: {
    startLocation: { latitude: number; longitude: number } | null;
  }) => boolean | Promise<boolean>;
  onTripPointRecord?: (payload: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    altitude?: number | null;
    provider?: string | null;
    recordedAt: string;
  }) => void;
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
  restoredTripTrace?: {
    rawStartPoint: { latitude: number; longitude: number } | null;
    matchedPath: Array<{ latitude: number; longitude: number }>;
    hasConfirmedMovement: boolean;
    startedAt: string;
  } | null;
  onGeofenceExit?: (payload: { location: { latitude: number; longitude: number } | null }) => void;
  activeTripNumber?: string | null;
  totalEarnings: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalMinutes: number;
  homeStatsFilter?: HomeStatsFilter;
  onChangeHomeStatsFilter?: (value: HomeStatsFilter) => void;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  localSnapRoadPath?: Array<{ latitude: number; longitude: number }>;
  isLowBatteryMapMode: boolean;
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
  locationEnabled,
  tripOpenPending = false,
  onLocationVisibilityChange,
  notifications,
  unreadNotificationCount,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenNotification,
  onTripComplete,
  onTripStart,
  onTripPointRecord,
  onTripMatchedPathRecord,
  onTripStatusChange,
  restoredTripTrace,
  onGeofenceExit,
  activeTripNumber = null,
  totalEarnings,
  totalTrips,
  totalDistanceKm,
  totalMinutes,
  homeStatsFilter = 'TODAY',
  onChangeHomeStatsFilter,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  localSnapRoadPath = [],
  isLowBatteryMapMode,
  styles,
  tripNavigationMode = false,
}: HomeScreenProps) {
  const mapRef = useRef<OsmMapViewHandle | null>(null);
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
  const [tripPanelHeight, setTripPanelHeight] = useState(0);
  const [tripSummary, setTripSummary] = useState<{
    tripNumberText: string | null;
    durationText: string;
    distanceText: string;
    speedText: string;
    statusText: string;
    pickupText: string | null;
    destinationText: string | null;
    fareText: string;
    isBusy: boolean;
  } | null>(null);
  const [completedTripPreviewPath, setCompletedTripPreviewPath] = useState<LatLngPoint[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [isResolvingAccurateLocation, setIsResolvingAccurateLocation] = useState(false);
  useGpsWarmupNotification(
    isDriverOnline && isResolvingAccurateLocation,
    'Getting a stable GPS fix before trip tracking starts.',
  );
  const [displayAccuracyMeters, setDisplayAccuracyMeters] = useState<number | null>(null);
  const [firstFixDurationMs, setFirstFixDurationMs] = useState<number | null>(null);
  const [lastLocationTimestampMs, setLastLocationTimestampMs] = useState<number | null>(null);
  const [locationFreshnessSeconds, setLocationFreshnessSeconds] = useState(0);
  const [lastTrackPoint, setLastTrackPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [travelPath, setTravelPath] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [startConnectorPoints, setStartConnectorPoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeRenderState, setRouteRenderState] = useState<TripRouteRenderState>('PRE_ROAD');
  const [firstSnappedRoadPoint, setFirstSnappedRoadPoint] = useState<LatLngPoint | null>(null);
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
  const latestActualCoordsRef = useRef<LatLngPoint | null>(null);
  const lastCameraFollowAtRef = useRef(0);
  const markerInitializedRef = useRef(false);
  const hasShownExitAlert = useRef(false);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingAnimValue = useRef(0);
  const displayAccuracyMetersRef = useRef<number | null>(null);
  const alertPulse = useRef(new Animated.Value(0)).current;
  const liveHeadingRef = useRef<number | null>(null);
  const rawStartPointRef = useRef<LatLngPoint | null>(null);
  const lastMatchedRoadProjectionRef = useRef<TripRoadProjection | null>(null);
  const routeRenderStateRef = useRef<TripRouteRenderState>('PRE_ROAD');
  const firstSnappedRoadPointRef = useRef<LatLngPoint | null>(null);
  const lastConnectivityStateRef = useRef<boolean | null>(null);
  const hasRestoredTripRef = useRef(false);
  const lastTrackTimestampMsRef = useRef<number | null>(null);
  const lastAcceptedSampleRef = useRef<{ point: LatLngPoint; timestampMs: number } | null>(null);
  const acceptedTelemetryRef = useRef<RawTripTelemetryPoint[]>([]);
  const tripStartedAtRef = useRef<string | null>(null);
  const fareOptions = [10, 20, 30, 40, 50, 60, 70];
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
  const tripStartLockOpenedAtRef = useRef<number | null>(null);

  const isDarkMap = isLowBatteryMapMode;
  const osmMapStyleUrl = isDarkMap ? OSM_VECTOR_DARK_STYLE : OSM_VECTOR_LIGHT_STYLE_URL;
  const osmBackgroundColor = isDarkMap ? OSM_MAXIM_DARK_BACKGROUND : OSM_LIGHT_BACKGROUND;
  const hasValidCoords = isValidCoordinate(coords);
  const isNetworkAvailable = Boolean(netInfo.isConnected && netInfo.isInternetReachable !== false);
  const tripPanelBottom = (isTripStarted ? 26 : 104) + (insets.bottom || 0);
  const activeTripPanelHeight = isTripStarted ? Math.max(tripPanelHeight, 240) : Math.max(tripPanelHeight, 242);
  const mapControlsBottom = tripPanelBottom + activeTripPanelHeight + 18;
  const topControlTop = Platform.OS === 'android' ? (insets.top || 0) + 12 : Math.max((insets.top || 0) + 6, 52);
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

  const geofenceStrokeColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT : '#5A67D8';
  const geofenceFillColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT_SOFT : 'rgba(90,103,216,0.04)';
  const tripRouteCasingColor = isDarkMap ? MAXIM_ROUTE_CASING_DARK : MAXIM_ROUTE_CASING_LIGHT;
  const tripRouteCoreColor = isDarkMap ? MAXIM_ROUTE_CORE_DARK : MAXIM_ROUTE_CORE_LIGHT;
  const startConnectorColor = isDarkMap ? LOW_BATTERY_MAP_ACCENT : 'rgba(107,114,128,0.78)';

  useEffect(() => {
    isTripStartedRef.current = isTripStarted;
  }, [isTripStarted]);

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
    routeRenderStateRef.current = routeRenderState;
  }, [routeRenderState]);

  useEffect(() => {
    firstSnappedRoadPointRef.current = firstSnappedRoadPoint;
  }, [firstSnappedRoadPoint]);

  useEffect(() => {
    snappedCoordsRef.current = coords;
    lastDisplayPointRef.current = coords;
  }, [coords]);

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
    if (
      !isTripScreen ||
      !tripNavigationMode ||
      !restoredTripTrace ||
      hasRestoredTripRef.current ||
      isTripStarted
    ) {
      return;
    }

    hasRestoredTripRef.current = true;
    const restoredMatchedPath = dedupeSequentialPoints(restoredTripTrace.matchedPath);
    const restoredFirstSnappedPoint = restoredMatchedPath[0] ?? null;
    const restoredRouteState: TripRouteRenderState =
      restoredFirstSnappedPoint ? 'ON_ROAD' : 'PRE_ROAD';
    const restoredConnector = buildTripStartConnector({
      rawStartPoint: restoredTripTrace.rawStartPoint,
      firstSnappedPoint: restoredFirstSnappedPoint,
      roadPath: restoredMatchedPath,
    });

    setTripSummary(null);
    setCompletedTripPreviewPath([]);
    setIsTripStarted(true);
    tripStartedAtRef.current = restoredTripTrace.startedAt;
    rawStartPointRef.current = restoredTripTrace.rawStartPoint;
    routeRenderStateRef.current = restoredRouteState;
    firstSnappedRoadPointRef.current = restoredFirstSnappedPoint;
    setRouteRenderState(restoredRouteState);
    setFirstSnappedRoadPoint(restoredFirstSnappedPoint);
    routePointsRef.current = restoredMatchedPath;
    travelPathRef.current = restoredMatchedPath;
    setRoutePoints(restoredMatchedPath);
    setTravelPath(restoredMatchedPath);
    setStartConnectorPoints(restoredConnector);
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
    const resumePoint =
      restoredMatchedPath[restoredMatchedPath.length - 1] ?? restoredTripTrace.rawStartPoint ?? null;
    setLastTrackPoint(resumePoint);
    lastTrackPointRef.current = resumePoint;
    if (resumePoint) {
      updateMarkerPosition(resumePoint);
    }
    const startedAtMs = new Date(restoredTripTrace.startedAt).getTime();
    setElapsedSeconds(
      Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0,
    );
    setDistanceKm(polylineDistanceKm(restoredMatchedPath));
    onTripStatusChange?.({
      status: 'app_recovered',
      recordedAt: new Date().toISOString(),
      latitude: resumePoint?.latitude ?? null,
      longitude: resumePoint?.longitude ?? null,
    });
  }, [isTripScreen, isTripStarted, localSnapRoadPath, onTripStatusChange, restoredTripTrace, tripNavigationMode]);

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
      lastAnimatedMarkerPointRef.current = nextCoordinate;
      return;
    }

    lastAnimatedMarkerPointRef.current = nextCoordinate;
  }, [coords, hasValidCoords, isTripStarted, speedKmh]);

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
    latitude: 7.0832297,
    longitude: 125.624803,
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
    if (!isTripStarted) {
      return;
    }

    const timer = setInterval(() => {
      void flushBufferedRoadPoints(true);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTripStarted]);

  const hasAutoStartedTripNavigationRef = useRef(false);

  useEffect(() => {
    if (!isDedicatedTripNavigation || isTripStarted || hasAutoStartedTripNavigationRef.current) {
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
      Date.now() - tripStartLockOpenedAtRef.current >= 6000;

    if (!hasAccurateStartLock && !hasWaitedLongEnough) {
      return;
    }

    tripStartLockOpenedAtRef.current = null;
    hasAutoStartedTripNavigationRef.current = true;
    void beginTripSession(startPoint).then((started) => {
      if (!started) {
        hasAutoStartedTripNavigationRef.current = false;
      }
    });
  }, [coords, displayAccuracyMeters, isDedicatedTripNavigation, isTripStarted]);

  useEffect(() => {
    if (!isTripScreen) {
      hasAutoStartedTripNavigationRef.current = false;
      setIsTripStarted(false);
      setElapsedSeconds(0);
      setDistanceKm(0);
      setSpeedKmh(0);
      setLastTrackPoint(null);
      setRoutePoints([]);
      setTravelPath([]);
      setStartConnectorPoints([]);
      setRouteRenderState('PRE_ROAD');
      setFirstSnappedRoadPoint(null);
      lastTrackPointRef.current = null;
      lastRawTrackPointRef.current = null;
      pendingRawPointsRef.current = [];
      routePointsRef.current = [];
      travelPathRef.current = [];
      routeRenderStateRef.current = 'PRE_ROAD';
      firstSnappedRoadPointRef.current = null;
      lastMatchedRoadProjectionRef.current = null;
      rawStartPointRef.current = null;
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
      setFarePickerOpen(false);
      lastTrackTimestampMsRef.current = null;
      setHasCentered(false);
      tripStartLockOpenedAtRef.current = null;
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(OBRERO_GEOFENCE, {
          edgePadding: { top: 70, right: 50, bottom: 170, left: 50 },
          animated: true,
        });
      }
    }
  }, [isTripScreen]);

  useEffect(() => {
    displayAccuracyMetersRef.current = displayAccuracyMeters;
  }, [displayAccuracyMeters]);

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

  const transitionToOnRoad = (segment: LatLngPoint[]) => {
    if (routeRenderStateRef.current === 'ON_ROAD') {
      return;
    }

    const firstSnappedPoint = segment[0] ?? null;
    // Start-only dashed connector: once we switch to ON_ROAD we never recreate it.
    routeRenderStateRef.current = 'ON_ROAD';
    firstSnappedRoadPointRef.current = firstSnappedPoint;
    setRouteRenderState('ON_ROAD');
    setFirstSnappedRoadPoint(firstSnappedPoint);
    setStartConnectorPoints([]);
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

    if (options?.rawSamples && options.source && onTripMatchedPathRecord) {
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
  };

  const updateMarkerPosition = (point: LatLngPoint) => {
    setCoords((prev) => {
      if (prev && distanceBetweenKm(prev, point) < 0.0015 && !isTripStartedRef.current) {
        return prev;
      }
      return point;
    });
  };

  const centerLiveTripCamera = (point: LatLngPoint, immediate = false) => {
    if (!mapRef.current || !isTripScreen || !isTripStartedRef.current) {
      return;
    }

    lastCameraFollowAtRef.current = Date.now();
    mapRef.current.animateCamera(
      {
        center: point,
        zoom: 18,
        heading: 0,
        pitch: 0,
      },
      { duration: immediate ? 0 : 300 },
    );
    hasCenteredRef.current = true;
    setHasCentered(true);
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
      speedKmh !== null && typeof speedKmh === 'number'
        ? speedKmh >= 24
          ? 0.9
          : speedKmh >= 10
            ? 0.78
            : speedKmh >= 4
              ? 0.6
              : 0.4
        : 0.46;
    let blendFactor = Math.max(accuracyBlend, motionBlend);
    if (movedKm <= 0.006) {
      blendFactor = Math.min(
        blendFactor,
        speedKmh !== null && typeof speedKmh === 'number' && speedKmh >= 6 ? 0.56 : 0.42,
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
    altitude,
    provider,
    timestampMs,
  }: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    altitude?: number | null;
    provider?: string | null;
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
    const derivedHeading =
      previousAccepted && distanceBetweenKm(previousAccepted.point, stablePoint) >= MIN_TRACK_MOVE_KM * 0.65
        ? headingBetweenDeg(previousAccepted.point, stablePoint)
        : null;
    const hasDirectionalSignal =
      derivedHeading !== null ||
      (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0);
    const resolvedSampleHeading =
      derivedHeading ??
      (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0 ? heading : null);
    if (lastDisplayPoint) {
      const displayGapKm = distanceBetweenKm(lastDisplayPoint, stablePoint);
      const displayThresholdKm = getAdaptiveGpsMotionThresholdKm({
        accuracyMeters: accuracy,
        speedKmh,
        hasDirectionalSignal,
        mode: 'display',
      });
      const likelyStationary =
        displayGapKm < displayThresholdKm ||
        (speedKmh !== null && speedKmh <= MAX_STATIONARY_SPEED_KMH) ||
        shouldRejectGpsBacktrack({
          movementKm: displayGapKm,
          headingDeltaDeg:
            derivedHeading !== null && liveHeadingRef.current !== null
              ? shortestAngleDelta(liveHeadingRef.current, derivedHeading)
              : null,
          accuracyMeters: accuracy,
          speedKmh,
          mode: 'display',
        });

      if (likelyStationary) {
        movementConfirmationCountRef.current = 0;
        stablePoint = lastDisplayPoint;
      } else {
        const shouldConfirmMovement = shouldRequireGpsMotionConfirmation({
          movementKm: displayGapKm,
          thresholdKm: displayThresholdKm,
          speedKmh,
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
    updateMarkerPosition(stablePoint);
    const cameraAccuracyThreshold = isHighPriorityTracking
      ? ACTIVE_CAMERA_ACCURACY_METERS
      : IDLE_CAMERA_ACCURACY_METERS;
    const canRecenterCamera =
      typeof accuracy !== 'number' ||
      !Number.isFinite(accuracy) ||
      accuracy <= cameraAccuracyThreshold;
    if (isTripStartedRef.current && canRecenterCamera) {
      centerLiveTripCamera(stablePoint);
    } else if (mapRef.current && !hasCenteredRef.current) {
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
    } else if (derivedHeading !== null) {
      liveHeadingRef.current = derivedHeading;
      setHeadingDeg(derivedHeading);
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
      heading: resolvedSampleHeading,
      accuracy,
      speed,
      altitude,
      provider,
    });
    return true;
  };

  const flushBufferedRoadPoints = (force = false) => {
    if (pendingRawPointsRef.current.length === 0) {
      return roadSnapQueueRef.current;
    }

    const minimumBatchPoints = force ? 1 : MIN_ROAD_MATCH_POINTS;
    if (!force && pendingRawPointsRef.current.length < minimumBatchPoints) {
      return roadSnapQueueRef.current;
    }

    const anchorPoint =
      routePointsRef.current[routePointsRef.current.length - 1] ?? lastTrackPointRef.current;
    const batchPoints = pendingRawPointsRef.current.splice(
      0,
      Math.min(pendingRawPointsRef.current.length, ROAD_MATCH_BATCH_SIZE),
    );
    if (batchPoints.length < minimumBatchPoints) {
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
        const rawSegment = dedupeSequentialPoints(inputPoints);
        if (rawSegment.length < 1) {
          return;
        }

        const rawSegmentDistanceKm = polylineDistanceKm(rawSegment);
        const previousMatchedPath = routePointsRef.current;
        let segment: LatLngPoint[] = rawSegment;
        let matchedSource: TripMatchedPointSource = 'local-fallback';

        const canBootstrapFirstSnappedPoint =
          routePointsRef.current.length === 0 && segment.length === 1;
        const canExtendExistingRoadTrace =
          routeRenderStateRef.current === 'ON_ROAD' &&
          segment.length === 1 &&
          Boolean(lastMatchedRoadProjectionRef.current);
        if (segment.length < 2 && !canBootstrapFirstSnappedPoint && !canExtendExistingRoadTrace) {
          roadMatchCarryoverRef.current = rawSegment.slice(
            Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
          );
          if (isNetworkAvailable) {
            pendingRawPointsRef.current = [...batchPoints, ...pendingRawPointsRef.current];
          }
          return;
        }

        const latestPoint = segment[segment.length - 1];
        const previousPoint = anchorPoint ?? segment[0];
        if (previousPoint && distanceBetweenKm(previousPoint, latestPoint) > MAX_POINT_GAP_KM) {
          return;
        }

        if (rawSegment.length >= 2 || previousMatchedPath.length > 0) {
          const matchedResult = await buildLiveMatchedRouteSegmentDetailed({
            rawSamples: rawSegment.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
              recordedAt: new Date().toISOString(),
            })),
            previousMatchedPath,
            seedPath: localSnapRoadPath,
            allowRemoteMatch: isNetworkAvailable,
          });
          if (matchedResult.path && matchedResult.path.length > 0) {
            segment = matchedResult.path;
            matchedSource = matchedResult.source;
          }
        }

        const segmentDistanceKm = polylineDistanceKm(segment);
        roadMatchCarryoverRef.current = rawSegment.slice(
          Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
        );
        const routeDisplaySegment = segment;
        const visibleSegmentDistanceKm = segmentDistanceKm;
        const transitionStartPoint = routeDisplaySegment[0] ?? latestPoint;

        if (routeRenderStateRef.current !== 'ON_ROAD') {
          transitionToOnRoad([transitionStartPoint]);
        }

        appendRouteSegment(routeDisplaySegment, {
          rawSamples: rawSegment.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: new Date().toISOString(),
          })),
          source: matchedSource,
        });
        lastTrackPointRef.current = latestPoint;
        setLastTrackPoint(latestPoint);
        snappedCoordsRef.current = latestPoint;
        if (Math.max(segmentDistanceKm, visibleSegmentDistanceKm) >= MIN_SNAPPED_MOVE_KM) {
          const headingStartPoint = routeDisplaySegment[0] ?? previousPoint;
          const headingEndPoint = routeDisplaySegment[routeDisplaySegment.length - 1] ?? latestPoint;
          const movementHeading = headingBetweenDeg(headingStartPoint, headingEndPoint);
          const lastLiveHeading = liveHeadingRef.current;
          const shouldUpdateHeading =
            lastLiveHeading === null || Math.abs(shortestAngleDelta(lastLiveHeading, movementHeading)) >= 4;
          if (shouldUpdateHeading) {
            liveHeadingRef.current = movementHeading;
            setHeadingDeg(movementHeading);
          }

          setDistanceKm((prev) => prev + Math.max(segmentDistanceKm, visibleSegmentDistanceKm));
        }

        if (pendingRawPointsRef.current.length > 0) {
          void flushBufferedRoadPoints(true);
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

  const applyLocationUpdate = (coordinate: {
    latitude: number;
    longitude: number;
    rawLatitude?: number | null;
    rawLongitude?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    speed?: number | null;
    altitude?: number | null;
    provider?: string | null;
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
        altitude:
          typeof coordinate.altitude === 'number' && Number.isFinite(coordinate.altitude)
            ? coordinate.altitude
            : null,
        provider: coordinate.provider ?? null,
        recordedAt: new Date().toISOString(),
      });
      acceptedTelemetryRef.current = [
        ...acceptedTelemetryRef.current,
        {
          latitude: rawTrackPoint.latitude,
          longitude: rawTrackPoint.longitude,
          speed: speedFromGpsKmh,
          heading:
            typeof coordinate.heading === 'number' && Number.isFinite(coordinate.heading)
              ? coordinate.heading
              : null,
          accuracy: gpsAccuracyMeters,
          altitude:
            typeof coordinate.altitude === 'number' && Number.isFinite(coordinate.altitude)
              ? coordinate.altitude
              : null,
          provider: coordinate.provider ?? null,
          recordedAt: new Date().toISOString(),
        },
      ];

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
        const derivedTrackHeading =
          movedKm >= MIN_TRACK_MOVE_KM * 0.65 ? headingBetweenDeg(prevRawPoint, next) : null;
        const effectiveSpeedKmh =
          speedFromGpsKmh !== null && Number.isFinite(speedFromGpsKmh)
            ? speedFromGpsKmh
            : computedSpeedKmh;
        const hasDirectionalSignal =
          derivedTrackHeading !== null ||
          (typeof coordinate.heading === 'number' &&
            Number.isFinite(coordinate.heading) &&
            coordinate.heading >= 0);
        const trackThresholdKm = getAdaptiveGpsMotionThresholdKm({
          accuracyMeters: gpsAccuracyMeters,
          speedKmh: effectiveSpeedKmh,
          hasDirectionalSignal,
          mode: 'trace',
        });
        const shouldSuppressTrackStep = shouldRejectGpsBacktrack({
          movementKm: movedKm,
          headingDeltaDeg:
            derivedTrackHeading !== null && liveHeadingRef.current !== null
              ? shortestAngleDelta(liveHeadingRef.current, derivedTrackHeading)
              : null,
          accuracyMeters: gpsAccuracyMeters,
          speedKmh: effectiveSpeedKmh,
          mode: 'trace',
        });

        if (movedKm > MAX_POINT_GAP_KM || effectiveSpeedKmh > MAX_ACCEPTED_SPEED_KMH) {
          return;
        }

        if (
          movedKm < trackThresholdKm ||
          effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH ||
          shouldSuppressTrackStep
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
      mapRef.current.animateCamera(
        {
          center: {
            latitude: next.latitude,
            longitude: next.longitude,
          },
          zoom: 17,
          heading: 0,
          pitch: 0,
        },
        { duration: 500 },
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
        minimumPointDistanceMeters: GPS_POINT_FILTER_DISTANCE_METERS,
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
            altitude: sample.altitude,
            provider: sample.provider,
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
            altitude: sample.altitude,
            provider: sample.provider,
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
    const startedAt = new Date().toISOString();
    const canStartTrip =
      (await onTripStart?.({
        startLocation: startLocation ? { latitude: startLocation.latitude, longitude: startLocation.longitude } : null,
      })) ?? true;

    if (!canStartTrip) {
      return false;
    }

    setTripSummary(null);
    setCompletedTripPreviewPath([]);
    setIsTripStarted(true);
    tripStartedAtRef.current = startedAt;
    onTripStatusChange?.({
      status: 'trip_started',
      recordedAt: startedAt,
      latitude: startLocation?.latitude ?? null,
      longitude: startLocation?.longitude ?? null,
    });
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    rawStartPointRef.current = startLocation;
    routeRenderStateRef.current = 'PRE_ROAD';
    firstSnappedRoadPointRef.current = null;
    setRouteRenderState('PRE_ROAD');
    setFirstSnappedRoadPoint(null);
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
    lastMatchedRoadProjectionRef.current = null;
    snappedCoordsRef.current = null;
    roadSnapQueueRef.current = Promise.resolve();
    lastTrackTimestampMsRef.current = Date.now();
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

    if (startLocation && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: startLocation,
          zoom: 18,
          heading: 0,
          pitch: 0,
        },
        { duration: 300 },
      );
    }

    return true;
  };

  const finishTripSession = async ({ openTripHistory = false }: { openTripHistory?: boolean } = {}) => {
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
      fareText: formatTripReceiptFare(selectedFare),
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

    const completedRoutePath =
      travelPathRef.current.length > 0
        ? travelPathRef.current
        : routePointsRef.current.length > 0
          ? dedupeSequentialPoints(routePointsRef.current)
          : [];
    const completedRawTelemetry = acceptedTelemetryRef.current;
    const completedRawTelemetryPath = dedupeSequentialPoints(
      completedRawTelemetry.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );
    const reconstruction = await reconstructCompletedTripPath(completedRawTelemetry);
    console.info('[TripReconstruction] Home completed trip reconstruction.', {
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
          : completedRoutePath.length > 1
            ? completedRoutePath
            : completedRawTelemetryPath;
    const reconstructionFallbackPath =
      reconstruction.preprocessedPath.length > 1
        ? reconstruction.preprocessedPath
        : completedRoutePath.length > 1
          ? completedRoutePath
          : completedRawTelemetryPath;
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
    const roadAlignedCompletedRoutePath =
      roadAlignmentResult.path ?? reconstructionFallbackPath;
    const completedDistanceKm =
      distanceKm > 0 ? distanceKm : polylineDistanceKm(roadAlignedCompletedRoutePath);
    const restoredActualPoint = latestActualCoordsRef.current;
    const completedDurationSeconds = elapsedSeconds;
    const averageSpeed =
      completedDurationSeconds > 0
        ? completedDistanceKm / (completedDurationSeconds / 3600)
        : speedKmh;
    const completedStartedAt = tripStartedAtRef.current;
    const completedEndedAt = new Date().toISOString();
    const completedRawStartPoint = rawStartPointRef.current;
    const completedStartEndpointSelection = await selectTripStartEndpointFromBuildings({
      roadPath: roadAlignedCompletedRoutePath,
      rawStartPoint: completedRawStartPoint,
    });
    const completedDashedStartConnector =
      completedStartEndpointSelection.dashedConnector.length > 0
        ? completedStartEndpointSelection.dashedConnector
        : [...startConnectorPoints];
    const completedMatchedStartPoint =
      completedStartEndpointSelection.finalEndpoint ??
      routePointsRef.current[0] ??
      roadAlignedCompletedRoutePath[0] ??
      null;
    const maxSpeedKph = completedRawTelemetry.reduce((maxSpeed, point) => {
      if (typeof point.speed === 'number' && Number.isFinite(point.speed)) {
        return Math.max(maxSpeed, point.speed);
      }
      return maxSpeed;
    }, 0);
    const idleDurationSeconds = completedRawTelemetry.reduce((idleSeconds, point, index, source) => {
      if (index === 0) {
        return idleSeconds;
      }
      const previousPoint = source[index - 1];
      const deltaSeconds = Math.max(
        0,
        (new Date(point.recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()) / 1000,
      );
      const isIdle =
        (typeof point.speed === 'number' && point.speed <= MAX_STATIONARY_SPEED_KMH) ||
        polylineDistanceKm([
          { latitude: previousPoint.latitude, longitude: previousPoint.longitude },
          { latitude: point.latitude, longitude: point.longitude },
        ]) <= MIN_TRACK_MOVE_KM;
      return isIdle ? idleSeconds + deltaSeconds : idleSeconds;
    }, 0);
    const accuracyReadings = completedRawTelemetry
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
    const completedRawEndPoint =
      completedRawTelemetry.at(-1)
        ? {
            latitude: completedRawTelemetry.at(-1)!.latitude,
            longitude: completedRawTelemetry.at(-1)!.longitude,
          }
        : roadAlignedCompletedRoutePath.at(-1) ?? null;
    const completedEndEndpointSelection = await selectTripEndpointFromBuildings({
      roadPath: roadAlignedCompletedRoutePath,
      rawEndPoint: completedRawEndPoint,
    });
    const completedMatchedEndPoint =
      completedEndEndpointSelection.finalEndpoint ??
      roadAlignedCompletedRoutePath.at(-1) ??
      null;
    const completedMatchedPointCount =
      routePointsRef.current.length || roadAlignedCompletedRoutePath.length;
    const completedTripState = routeRenderStateRef.current;
    const endLocation = completedMatchedEndPoint;
    const completedLocationLabels = await resolveTripDisplayLocationLabels({
      matchedStartPoint: completedMatchedStartPoint,
      matchedEndPoint: completedMatchedEndPoint,
      routePath: roadAlignedCompletedRoutePath,
      filteredStartPoint: completedRawStartPoint,
      filteredEndPoint: completedRawEndPoint,
    });

    setIsTripStarted(false);
    setCompletedTripPreviewPath(roadAlignedCompletedRoutePath);
    setTripSummary({
      tripNumberText: activeTripNumber,
      durationText: `${Math.floor(completedDurationSeconds / 60)}:${String(
        completedDurationSeconds % 60,
      ).padStart(2, '0')}`,
      distanceText: formatTripReceiptDistance(completedDistanceKm * 1000),
      speedText: `${Math.max(0, averageSpeed).toFixed(1)} km/h`,
      statusText:
        roadAlignedCompletedRoutePath.length > 1
          ? 'Trip route saved successfully'
          : 'Trip saved and waiting for route points',
      pickupText: completedLocationLabels.startDisplayName,
      destinationText: completedLocationLabels.endDisplayName,
      fareText: formatTripReceiptFare(selectedFare),
      isBusy: false,
    });
    setLastTrackPoint(null);
    lastTrackPointRef.current = null;
    lastRawTrackPointRef.current = null;
    rawStartPointRef.current = null;
    pendingRawPointsRef.current = [];
    roadMatchCarryoverRef.current = [];
    setRoutePoints([]);
    setTravelPath([]);
    setStartConnectorPoints([]);
    setRouteRenderState('PRE_ROAD');
    setFirstSnappedRoadPoint(null);
    routePointsRef.current = [];
    travelPathRef.current = [];
    routeRenderStateRef.current = 'PRE_ROAD';
    firstSnappedRoadPointRef.current = null;
    snappedCoordsRef.current = coords;
    roadSnapQueueRef.current = Promise.resolve();
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setHeadingDeg(0);
    headingAnimValue.current = 0;
    headingAnim.setValue(0);
    lastTrackTimestampMsRef.current = null;
    acceptedTelemetryRef.current = [];
    tripStartedAtRef.current = null;
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
      routePath: roadAlignedCompletedRoutePath,
      endLocation,
      rawTelemetry: completedRawTelemetry,
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
      tripState: completedTripState,
      matchedPointCount: completedMatchedPointCount,
      averageSpeedKph: Math.max(0, averageSpeed),
      maxSpeedKph,
      idleDurationSeconds: Math.round(idleDurationSeconds),
      gpsQualitySummary,
      routeMatchSummary: pickPreferredRouteMatchSummary(
        roadAlignmentResult.metadata ?? null,
        reconstruction.routeMatchMetadata ?? null,
      ),
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
        onRequestTripNavigation?.();
        return;
      }
      await beginTripSession(coords);
      return;
    }

    await finishTripSession();
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
  const liveHeadingRotation = headingAnim.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ['-360deg', '0deg', '360deg'],
    extrapolate: 'extend',
  });
  const handleAdjustZoom = async (delta: number) => {
    if (!mapRef.current) {
      return;
    }
    try {
      const camera = await mapRef.current.getCamera();
      const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : NORMAL_CAMERA.zoom;
      const nextZoom = Math.max(10, Math.min(20, currentZoom + delta));
      mapRef.current.animateCamera(
        {
          zoom: nextZoom,
          center: camera.center ?? coords ?? undefined,
        },
        { duration: 220 },
      );
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
      { duration: isTripStarted ? 300 : 450 },
    );
  };
  const tripRouteForDisplay =
    isTripScreen && !isTripStarted && completedTripPreviewPath.length > 1
      ? completedTripPreviewPath
      : travelPath.length > 0
        ? travelPath
        : routePoints;
  const homeMapPolygons = [
    {
      id: 'home-geofence',
      coordinates: OBRERO_GEOFENCE,
      strokeColor: hasGeofenceViolation ? '#EF4444' : geofenceStrokeColor,
      fillColor: hasGeofenceViolation ? 'rgba(239,68,68,0.08)' : geofenceFillColor,
      strokeWidth: 2,
    },
  ];
  const homeMapCircles =
    coords && displayAccuracyMeters
      ? [
          {
            id: 'home-accuracy',
            center: coords,
            radius: Math.max(displayAccuracyMeters, 6),
            strokeColor: 'rgba(45, 125, 246, 0.24)',
            fillColor: 'rgba(45, 125, 246, 0.08)',
            strokeWidth: 1,
          },
        ]
      : [];
  const homeMapPolylines = [
    ...(isTripScreen && tripRouteForDisplay.length > 1
      ? [
          {
            id: 'trip-route-casing',
            coordinates: tripRouteForDisplay,
            strokeColor: tripRouteCasingColor,
            strokeWidth: MAXIM_ROUTE_WIDTH_CASING_NAV,
          },
          {
            id: 'trip-route-core',
            coordinates: tripRouteForDisplay,
            strokeColor: tripRouteCoreColor,
            strokeWidth: MAXIM_ROUTE_WIDTH_CORE_NAV,
          },
        ]
      : []),
    ...(isTripScreen && !isTripStarted && startConnectorPoints.length === 2
      ? [
          {
            id: 'trip-start-connector',
            coordinates: startConnectorPoints,
            strokeColor: startConnectorColor,
            strokeWidth: 2,
            lineDashPattern: [6, 6],
          },
        ]
      : []),
  ];
  const homeMapMarkers =
    hasValidCoords && coords
      ? [
          {
            id: 'driver-location',
            coordinate: coords,
            kind: shouldShowTripNavigationMode ? ('navigation' as const) : ('avatar' as const),
            color: shouldShowTripNavigationMode ? '#0F172A' : '#1D4ED8',
            imageUri: shouldShowTripNavigationMode ? null : profileImageUri,
            initials:
              profileName
                ?.split(/\s+/)
                .map((part) => part[0] ?? '')
                .join('')
                .slice(0, 2) ?? 'DR',
            rotationDeg: shouldShowTripNavigationMode ? headingDeg : 0,
            size: shouldShowTripNavigationMode ? 36 : 34,
          },
        ]
      : [];
  const tripHeaderSubtitle = currentAreaLabel || 'Live route tracking';

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <OsmMapView
          ref={(ref: OsmMapViewHandle | null) => {
            mapRef.current = ref;
          }}
          style={localStyles.map}
          initialRegion={{
            latitude: fallbackCenter.latitude,
            longitude: fallbackCenter.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          mapStyleUrl={osmMapStyleUrl}
          backgroundColor={osmBackgroundColor}
          pitchEnabled={false}
          rotateEnabled={false}
          polygons={homeMapPolygons}
          circles={homeMapCircles}
          polylines={homeMapPolylines}
          markers={homeMapMarkers}
        />

        {hasGeofenceViolation ? (
          <GeofenceViolationBanner
            opacity={alertOpacity}
            scale={alertScale}
            message="The driver is currently outside the geofence boundary."
          />
        ) : null}

        {shouldShowTripNavigationMode ? (
          <View
            style={[
              localStyles.tripNavigationHeader,
              isDarkMap
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                    shadowOpacity: 0,
                    elevation: 0,
                  }
                : null,
              { top: 0, paddingTop: (insets.top || 0) + 12 },
            ]}
          >
            <View
              style={[
                localStyles.tripNavigationHeaderIcon,
                isDarkMap ? { backgroundColor: MAXIM_UI_CHROME_DARK } : null,
              ]}
            >
              <AppIcon name="navigation" size={24} color="#FFFFFF" active />
            </View>
            <View style={localStyles.tripNavigationHeaderMain}>
              <Text
                style={[
                  localStyles.tripNavigationSubtitle,
                  isDarkMap ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                On the road
              </Text>
              <Text
                style={[
                  localStyles.tripNavigationTitle,
                  isDarkMap ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
                numberOfLines={1}
              >
                {tripHeaderSubtitle}
              </Text>
            </View>
            <View
              style={[
                localStyles.tripNavigationHeaderStatus,
                isDarkMap ? { backgroundColor: MAXIM_UI_SURFACE_ALT_DARK } : null,
              ]}
            >
              <Text
                style={[
                  localStyles.tripNavigationHeaderStatusText,
                  isDarkMap ? { color: '#57c7a8' } : null,
                ]}
              >
                Tracking
              </Text>
            </View>
          </View>
        ) : null}

        {isTripScreen && !shouldShowTripNavigationMode && locationEnabled && (isDriverOnline || isTripStarted) ? (
          <View style={[localStyles.mapControls, { bottom: mapControlsBottom }]}>
            <Pressable
              style={[
                localStyles.mapControlButton,
                isDarkMap
                  ? {
                      backgroundColor: MAXIM_UI_CHROME_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                      shadowOpacity: 0,
                      elevation: 0,
                    }
                  : null,
              ]}
              onPress={() => handleAdjustZoom(1)}
            >
              <AppIcon name="plus" size={18} color={isDarkMap ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
            </Pressable>
            <Pressable
              style={[
                localStyles.mapControlButton,
                isDarkMap
                  ? {
                      backgroundColor: MAXIM_UI_CHROME_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                      shadowOpacity: 0,
                      elevation: 0,
                    }
                  : null,
              ]}
              onPress={() => handleAdjustZoom(-1)}
            >
              <AppIcon name="minus" size={18} color={isDarkMap ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
            </Pressable>
            <Pressable
              style={[
                localStyles.mapControlButton,
                isDarkMap
                  ? {
                      backgroundColor: MAXIM_UI_CHROME_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                      shadowOpacity: 0,
                      elevation: 0,
                    }
                  : null,
              ]}
              onPress={handleTrackLocation}
            >
              <AppIcon name="crosshair" size={17} color={isDarkMap ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
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
            tripOpenPending={tripOpenPending}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            totalEarnings={totalEarnings}
            totalTrips={totalTrips}
            distanceSummaryKm={distanceSummaryKm}
            statsFilter={homeStatsFilter}
            onChangeStatsFilter={(value) => onChangeHomeStatsFilter?.(value)}
            formatPeso={formatPeso}
            localStyles={localStyles}
            insetsTop={insets.top || 0}
            insetsBottom={insets.bottom || 0}
            isLowBatteryMapMode={isDarkMap}
          />
        ) : (
          <>
            {!shouldShowTripNavigationMode ? (
              <>
                <Pressable
                  style={[
                    styles.routeBackButton,
                    isDarkMap
                      ? {
                          backgroundColor: MAXIM_UI_CHROME_DARK,
                          borderColor: MAXIM_UI_BORDER_DARK,
                          shadowOpacity: 0,
                          elevation: 0,
                        }
                      : null,
                    { top: topControlTop },
                  ]}
                  onPress={onBackToHome}
                >
                  <AppIcon name="chevron-left" size={20} color={isDarkMap ? MAXIM_UI_TEXT_DARK : '#030318'} />
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
                  isTripStarted={isTripStarted}
                  onTripButtonPress={handleTripButtonPress}
                  onLayout={(event) => setTripPanelHeight(event.nativeEvent.layout.height)}
                  isLowBatteryMapMode={isDarkMap}
                />
              </>
            ) : (
              <TripNavigationPanel
                localStyles={localStyles}
                insetsBottom={insets.bottom || 0}
                minutesText={minutesText}
                kmText={kmText}
                speedKmh={speedKmh}
                currentAreaLabel={currentAreaLabel}
                isInsideGeofence={isInsideGeofence}
                isLowGpsAccuracy={isLowGpsAccuracy}
                onEndTripPress={handleTripButtonPress}
                onLayout={(event) => setTripPanelHeight(event.nativeEvent.layout.height)}
                isLowBatteryMapMode={isDarkMap}
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
          isLowBatteryMapMode={isLowBatteryMapMode}
          styles={styles}
        />
      ) : null}

      <OutsideGeofenceModal
        visible={showOutsideGeofenceModal}
        onRequestClose={() => setShowOutsideGeofenceModal(false)}
        onAcknowledge={() => setShowOutsideGeofenceModal(false)}
        isLowBatteryMapMode={isDarkMap}
      />
      <NotificationCenterModal
        visible={showNotificationCenter}
        onRequestClose={() => setShowNotificationCenter(false)}
        notifications={notifications}
        unreadCount={unreadNotificationCount}
        onPressNotification={(notification) => {
          setShowNotificationCenter(false);
          onOpenNotification(notification);
        }}
        onMarkAllRead={onMarkAllNotificationsRead}
        isLowBatteryMapMode={isDarkMap}
      />
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
        isLowBatteryMapMode={isDarkMap}
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
  statsFilterWrap: {
    alignItems: 'flex-end',
  },
  statsFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    left: 0,
    right: 0,
    minHeight: 132,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#57C7A8',
    paddingHorizontal: 30,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  tripNavigationHeaderIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripNavigationHeaderMain: {
    flex: 1,
    minWidth: 0,
  },
  tripNavigationTitle: {
    marginTop: 3,
    fontSize: 28,
    lineHeight: 32,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationSubtitle: {
    fontSize: 14,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationHeaderStatus: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tripNavigationHeaderStatusText: {
    fontSize: 14,
    lineHeight: 17,
    color: '#FFFFFF',
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
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 10,
    paddingBottom: 28,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -5 },
    elevation: 10,
  },
  tripNavigationHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 18,
  },
  tripNavigationSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  tripNavigationCloseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  tripNavigationSummaryMain: {
    flex: 1,
    alignItems: 'center',
  },
  tripNavigationTimer: {
    fontSize: 34,
    lineHeight: 38,
    color: '#14916F',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationMeta: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 19,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationTrackingPill: {
    minWidth: 86,
    borderRadius: 999,
    backgroundColor: '#E8FBF6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tripNavigationTrackingText: {
    fontSize: 14,
    lineHeight: 17,
    color: '#14916F',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationDivider: {
    height: 1,
    backgroundColor: '#EEF2F6',
    marginTop: 22,
    marginBottom: 20,
  },
  tripNavigationRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tripNavigationRouteIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripNavigationRouteCopy: {
    flex: 1,
    minWidth: 0,
  },
  tripNavigationRouteTitle: {
    fontSize: 21,
    lineHeight: 25,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationRouteSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  tripNavigationFooterRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripNavigationFooterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripNavigationFooterText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
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
  tripNavigationGpsDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D7EAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripNavigationGpsDotCore: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#1A73E8',
  },
  liveNavigationMarker: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveNavigationMarkerGlow: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(26,115,232,0.16)',
  },
  liveNavigationMarkerShell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1A73E8',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
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
