
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  MarkerAnimated,
  Polyline,
  Polygon,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import type { HomeScreen } from './HomeScreen';
import { AppIcon } from '../components/ui';
import { TripSummaryModal } from '../components/modals';
import { getMotionDurationMs, shortestAngleDelta } from '../lib/mapTracking';
import {
  dedupeSequentialPoints,
  fetchPreferredRoadPath,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from '../lib/roadPath';
import { startLiveGpsTracker } from '../lib/liveGpsTracker';
import type { RawTripTelemetryPoint } from '../lib/tripPathReconstruction';
import {
  ACTIVE_CAMERA_ACCURACY_METERS,
  ACTIVE_LOCATION_ACCURACY,
  COARSE_FIRST_FIX_ACCURACY_METERS,
  DARK_MAP_STYLE,
  GPS_DISTANCE_INTERVAL_METERS,
  GPS_STALE_SAMPLE_THRESHOLD_MS,
  HIGH_CONFIDENCE_ACCURACY_METERS,
  INITIAL_LOCATION_TIMEOUT_MS,
  INITIAL_VISIBLE_ACCURACY_METERS,
  isPointInsidePolygon,
  MAX_ACCEPTED_ACCURACY_METERS,
  MAX_ACCEPTED_SPEED_KMH,
  MAX_LOCATION_JUMP_KM,
  MAX_POINT_GAP_KM,
  MAX_STATIONARY_SPEED_KMH,
  mergeRouteSegment,
  MIN_ROAD_MATCH_POINTS,
  MIN_SNAPPED_MOVE_KM,
  MIN_TRACK_MOVE_KM,
  OBRERO_GEOFENCE,
  ROAD_MATCH_BATCH_SIZE,
  ROAD_MATCH_OVERLAP_POINTS,
  TRIP_CAMERA_FOLLOW_INTERVAL_MS,
  WATCH_LOCATION_INTERVAL_MS,
  WEAK_GPS_RECOVERY_ACCURACY_METERS,
} from './homeScreenShared';

type TripNavigationScreenProps = Omit<ComponentProps<typeof HomeScreen>, 'isTripScreen'>;

type SummaryState = {
  durationText: string;
  distanceText: string;
  speedText: string;
  statusText: string;
};

const NAV_BLUE = '#55C7A5';
const NAV_BLUE_DARK = '#147D64';
const NAV_LIVE_BLUE = '#1A73E8';
const NAV_ARROW_GLOW = 'rgba(26, 115, 232, 0.18)';
const NAV_ARROW_OUTER_GLOW = 'rgba(26, 115, 232, 0.1)';
const NAV_CAMERA_ZOOM = 18.9;
const NAV_CAMERA_PITCH = 0;
const NAV_CAMERA_LOOK_AHEAD_METERS = 85;
const GEOFENCE_STROKE = 'rgba(14, 165, 233, 0.58)';
const GEOFENCE_FILL = 'rgba(14, 165, 233, 0.045)';
const TRACE_START_MIN_DISPLACEMENT_KM = 0.015;
const TRACE_START_MIN_STEP_KM = 0.004;
const TRACE_START_MIN_SPEED_KMH = 3.5;
const TRACE_START_REQUIRED_POINTS = 2;
const NAV_LIVE_ROUTE_MIN_BATCH_POINTS = 1;
const NAV_LIVE_ROUTE_BATCH_SIZE = 2;
const NAV_FORCE_ROUTE_REFRESH_MIN_INTERVAL_MS = 1400;
const NAV_FORCE_ROUTE_REFRESH_MIN_DISTANCE_KM = 0.005;
const OFF_ROAD_CONNECTOR_MIN_DISTANCE_KM = 0.016;
const OFF_ROAD_CONNECTOR_RETURN_DISTANCE_KM = 0.008;
const OFF_ROAD_CONNECTOR_MAX_DISTANCE_KM = 0.2;
const LIVE_ROUTE_CONNECT_MAX_GAP_KM = 0.035;
const NAV_ROUTE_INTERPOLATION_STEP_KM = 0.008;
const NAV_ROUTE_CORE_ON_ROAD = '#2A7FFF';
const NAV_ROUTE_CORE_RECONNECTING = 'rgba(42, 127, 255, 0.62)';
const NAV_ROUTE_CASING_ON_ROAD = 'rgba(255,255,255,0.9)';
const NAV_ROUTE_CASING_RECONNECTING = 'rgba(255,255,255,0.55)';

export function TripNavigationScreen({
  onBackToHome,
  onExitTripNavigation,
  locationEnabled,
  onLocationVisibilityChange,
  onTripStart,
  onTripPointRecord,
  onTripComplete,
  onGeofenceExit,
  mapTypeOption,
}: TripNavigationScreenProps) {
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<any>(null);
  const locationWatchRef = useRef<{ stop: () => void } | null>(null);
  const markerCoordinate = useRef(
    new AnimatedRegion({
      latitude: OBRERO_GEOFENCE[0].latitude,
      longitude: OBRERO_GEOFENCE[0].longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  const [coords, setCoords] = useState<LatLngPoint | null>(null);
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
  const [panelHeight, setPanelHeight] = useState(164);
  const [hasConfirmedMovement, setHasConfirmedMovement] = useState(false);
  const [isOffRoadConnectorActive, setIsOffRoadConnectorActive] = useState(false);

  const markerInitializedRef = useRef(false);
  const lastAnimatedMarkerPointRef = useRef<LatLngPoint | null>(null);
  const hasCenteredRef = useRef(false);
  const hasStartedSessionRef = useRef(false);
  const isTripStartedRef = useRef(false);
  const lastAcceptedSampleRef = useRef<{ point: LatLngPoint; timestampMs: number } | null>(null);
  const recentAcceptedPointsRef = useRef<LatLngPoint[]>([]);
  const movementConfirmationCountRef = useRef(0);
  const lastDisplayPointRef = useRef<LatLngPoint | null>(null);
  const pendingRawPointsRef = useRef<LatLngPoint[]>([]);
  const roadMatchCarryoverRef = useRef<LatLngPoint[]>([]);
  const roadSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const routePointsRef = useRef<LatLngPoint[]>([]);
  const travelPathRef = useRef<LatLngPoint[]>([]);
  const lastRawTrackPointRef = useRef<LatLngPoint | null>(null);
  const lastTrackTimestampMsRef = useRef<number | null>(null);
  const lastForcedRouteRefreshAtRef = useRef(0);
  const lastCameraFollowAtRef = useRef(0);
  const liveHeadingRef = useRef<number | null>(null);
  const latestActualCoordsRef = useRef<LatLngPoint | null>(null);
  const lastGeocodeAtRef = useRef(0);
  const lastGeocodedPointRef = useRef<LatLngPoint | null>(null);
  const hasShownExitAlertRef = useRef(false);
  const tripStartAnchorRef = useRef<LatLngPoint | null>(null);
  const movementValidationPointsRef = useRef<LatLngPoint[]>([]);
  const hasConfirmedMovementRef = useRef(false);
  const acceptedTelemetryRef = useRef<RawTripTelemetryPoint[]>([]);
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
  const nearestPointOnSegment = (point: LatLngPoint, start: LatLngPoint, end: LatLngPoint) => {
    const lonScale = 111.32 * Math.cos((point.latitude * Math.PI) / 180);
    const startX = start.longitude * lonScale;
    const startY = start.latitude * 111.32;
    const endX = end.longitude * lonScale;
    const endY = end.latitude * 111.32;
    const pointX = point.longitude * lonScale;
    const pointY = point.latitude * 111.32;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const denominator = deltaX * deltaX + deltaY * deltaY;

    if (denominator <= 1e-9) {
      return start;
    }

    const projectionRatio = Math.max(
      0,
      Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / denominator),
    );

    return {
      latitude: start.latitude + (end.latitude - start.latitude) * projectionRatio,
      longitude: start.longitude + (end.longitude - start.longitude) * projectionRatio,
    };
  };
  const nearestPointOnPolyline = (point: LatLngPoint, path: LatLngPoint[]) => {
    if (path.length === 0) {
      return null;
    }
    if (path.length === 1) {
      return path[0];
    }

    let bestPoint: LatLngPoint | null = null;
    let bestDistanceKm = Number.POSITIVE_INFINITY;

    for (let index = 1; index < path.length; index += 1) {
      const segmentPoint = nearestPointOnSegment(point, path[index - 1], path[index]);
      const segmentDistanceKm = distanceBetweenKm(point, segmentPoint);
      if (segmentDistanceKm < bestDistanceKm) {
        bestDistanceKm = segmentDistanceKm;
        bestPoint = segmentPoint;
      }
    }

    return bestPoint;
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

    return smoothDisplayedRoutePath(expandedPath);
  };

  const isDarkMap = mapTypeOption === 'dark';
  const activeMapType: 'standard' | 'satellite' = mapTypeOption === 'satellite' ? 'satellite' : 'standard';
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
  const liveDisplayPath = interpolateNavigationPath(routeTraceSource);
  const connectorTargetPoint =
    coords && hasConfirmedMovement && liveDisplayPath.length > 1
      ? nearestPointOnPolyline(coords, liveDisplayPath)
      : null;
  const distanceToConnectorTargetKm =
    coords && connectorTargetPoint ? distanceBetweenKm(coords, connectorTargetPoint) : null;
  const activationDistanceKm = Math.max(
    OFF_ROAD_CONNECTOR_MIN_DISTANCE_KM,
    ((displayAccuracyMeters ?? 0) / 1000) * 0.85,
  );
  const returnToRoadDistanceKm = Math.max(
    OFF_ROAD_CONNECTOR_RETURN_DISTANCE_KM,
    ((displayAccuracyMeters ?? 0) / 1000) * 0.45,
  );
  const shouldShowOffRoadConnector = Boolean(
    hasConfirmedMovement &&
      coords &&
      connectorTargetPoint &&
      distanceToConnectorTargetKm !== null &&
      distanceToConnectorTargetKm <= OFF_ROAD_CONNECTOR_MAX_DISTANCE_KM &&
      isOffRoadConnectorActive,
  );
  const visibleTraceHasRoute = liveDisplayPath.length > 1;
  const routeCoreColor = shouldShowOffRoadConnector
    ? NAV_ROUTE_CORE_RECONNECTING
    : NAV_ROUTE_CORE_ON_ROAD;
  const routeCasingColor = shouldShowOffRoadConnector
    ? NAV_ROUTE_CASING_RECONNECTING
    : NAV_ROUTE_CASING_ON_ROAD;
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
    hasConfirmedMovementRef.current = hasConfirmedMovement;
  }, [hasConfirmedMovement]);

  useEffect(() => {
    routePointsRef.current = routePoints;
  }, [routePoints]);

  useEffect(() => {
    travelPathRef.current = travelPath;
  }, [travelPath]);

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
      markerCoordinate.setValue({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      markerInitializedRef.current = true;
      lastAnimatedMarkerPointRef.current = coords;
      return;
    }

    markerCoordinate
      .timing({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: animationDuration,
        useNativeDriver: false,
      } as any)
      .start();
    lastAnimatedMarkerPointRef.current = coords;
  }, [coords, markerCoordinate, speedKmh]);

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

    const startPoint =
      latestActualCoordsRef.current ?? lastAcceptedSampleRef.current?.point ?? coords ?? null;
    if (!startPoint) {
      return;
    }

    hasStartedSessionRef.current = true;
    beginTripSession(startPoint);
  }, [coords, locationEnabled, onBackToHome, onExitTripNavigation]);

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
    if (!connectorTargetPoint || distanceToConnectorTargetKm === null) {
      setIsOffRoadConnectorActive(false);
      return;
    }

    if (distanceToConnectorTargetKm > OFF_ROAD_CONNECTOR_MAX_DISTANCE_KM) {
      setIsOffRoadConnectorActive(false);
      return;
    }

    setIsOffRoadConnectorActive((current) => {
      if (current) {
        return distanceToConnectorTargetKm > returnToRoadDistanceKm;
      }
      return distanceToConnectorTargetKm >= activationDistanceKm;
    });
  }, [
    activationDistanceKm,
    connectorTargetPoint,
    distanceToConnectorTargetKm,
    returnToRoadDistanceKm,
  ]);

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

  const toDeg = (value: number) => (value * 180) / Math.PI;

  const headingBetweenDeg = (from: LatLngPoint, to: LatLngPoint) => {
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const projectPointMeters = (point: LatLngPoint, bearingDeg: number, distanceMeters: number): LatLngPoint => {
    const earthRadiusMeters = 6378137;
    const angularDistance = distanceMeters / earthRadiusMeters;
    const bearingRad = toRad(bearingDeg);
    const latitudeRad = toRad(point.latitude);
    const longitudeRad = toRad(point.longitude);

    const projectedLatitude = Math.asin(
      Math.sin(latitudeRad) * Math.cos(angularDistance) +
        Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
    );
    const projectedLongitude =
      longitudeRad +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latitudeRad),
        Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(projectedLatitude),
      );

    return {
      latitude: toDeg(projectedLatitude),
      longitude: ((toDeg(projectedLongitude) + 540) % 360) - 180,
    };
  };

  const connectSegmentIfNeeded = (current: LatLngPoint[], segment: LatLngPoint[]) => {
    if (current.length === 0 || segment.length === 0) {
      return segment;
    }

    const currentLast = current[current.length - 1];
    const segmentFirst = segment[0];
    const gapKm = distanceBetweenKm(currentLast, segmentFirst);
    if (gapKm <= 0.0004 || gapKm > LIVE_ROUTE_CONNECT_MAX_GAP_KM) {
      return segment;
    }

    return [
      currentLast,
      {
        latitude: currentLast.latitude + (segmentFirst.latitude - currentLast.latitude) * 0.35,
        longitude: currentLast.longitude + (segmentFirst.longitude - currentLast.longitude) * 0.35,
      },
      {
        latitude: currentLast.latitude + (segmentFirst.latitude - currentLast.latitude) * 0.7,
        longitude: currentLast.longitude + (segmentFirst.longitude - currentLast.longitude) * 0.7,
      },
      ...segment,
    ];
  };

  const appendRouteSegment = (segment: LatLngPoint[]) => {
    const connectedSegment = connectSegmentIfNeeded(routePointsRef.current, segment);
    const mergedRaw = mergeRouteSegment(routePointsRef.current, connectedSegment);
    routePointsRef.current = mergedRaw;
    const smoothedDisplayPath = smoothDisplayedRoutePath(mergedRaw);
    travelPathRef.current = smoothedDisplayPath;
    setRoutePoints(mergedRaw);
    setTravelPath(smoothedDisplayPath);
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
      sampleSpeedKmh !== null && typeof sampleSpeedKmh === 'number'
        ? sampleSpeedKmh >= 24
          ? 0.94
          : sampleSpeedKmh >= 10
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
          center: projectPointMeters(point, liveHeadingRef.current ?? headingDeg ?? 0, NAV_CAMERA_LOOK_AHEAD_METERS),
          zoom: NAV_CAMERA_ZOOM,
          heading: 0,
          pitch: NAV_CAMERA_PITCH,
        },
        { duration: 450 },
      );
      hasCenteredRef.current = true;
    }
  };

  const followCamera = (point: LatLngPoint, immediate = false) => {
    if (!mapRef.current) {
      return;
    }

    const heading = liveHeadingRef.current ?? headingDeg ?? 0;
    const lookAheadMeters = Math.min(
      120,
      Math.max(NAV_CAMERA_LOOK_AHEAD_METERS, (speedKmh > 0 ? speedKmh : 12) * 2.2),
    );
    const cameraCenter = projectPointMeters(point, heading, lookAheadMeters);

    mapRef.current.animateCamera(
      {
        center: cameraCenter,
        zoom: NAV_CAMERA_ZOOM,
        heading: 0,
        pitch: NAV_CAMERA_PITCH,
      },
      { duration: immediate ? 0 : 360 },
    );
    hasCenteredRef.current = true;
  };

  const handleIncomingSample = async (
    sample: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
      timestampMs: number;
    },
    isSeed: boolean,
  ) => {
    const { latitude, longitude, accuracy, heading, speed, timestampMs } = sample;
    const samplePoint = { latitude, longitude };
    const speedFromGpsKmh =
      typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
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

    lastAcceptedSampleRef.current = {
      point: stablePoint,
      timestampMs,
    };
    setDisplayAccuracyMeters(typeof accuracy === 'number' ? accuracy : null);
    updateMarkerPosition(stablePoint);

    const movementGapKm = previousAccepted ? distanceBetweenKm(previousAccepted.point, stablePoint) : 0;
    const derivedHeading =
      previousAccepted && movementGapKm >= 0.0015
        ? headingBetweenDeg(previousAccepted.point, stablePoint)
        : null;

    if (typeof heading === 'number' && Number.isFinite(heading) && heading >= 0) {
      const shouldUseHeading =
        (speedFromGpsKmh !== null && speedFromGpsKmh >= 6) ||
        movementGapKm >= 0.002;
      if (shouldUseHeading) {
        const headingTarget =
          derivedHeading === null
            ? heading
            : ((derivedHeading + shortestAngleDelta(derivedHeading, heading) * 0.34) % 360 + 360) % 360;
        applyNavigationHeading(headingTarget, 0.24);
      }
    } else if (derivedHeading !== null) {
      if (movementGapKm >= 0.0025) {
        applyNavigationHeading(derivedHeading, 0.2);
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
        ? accuracy <= ACTIVE_CAMERA_ACCURACY_METERS
        : false;
    const hasMeaningfulStep = movedFromLastTrackKm >= TRACE_START_MIN_STEP_KM;
    const hasMeaningfulDisplacement = displacementFromAnchorKm >= TRACE_START_MIN_DISPLACEMENT_KM;
    const hasSustainedSpeed = effectiveSpeedKmh >= TRACE_START_MIN_SPEED_KMH;
    const hasDirectionalSignal = derivedHeading !== null || (typeof heading === 'number' && heading >= 0);

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
        if (
          mapRef.current &&
          hasGoodAccuracy &&
          Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
        ) {
          lastCameraFollowAtRef.current = Date.now();
          followCamera(stablePoint);
        }
        return;
      }

      hasConfirmedMovementRef.current = true;
      setHasConfirmedMovement(true);
      pendingRawPointsRef.current = [...movementValidationPointsRef.current];
      movementValidationPointsRef.current = [];
      lastRawTrackPointRef.current = stablePoint;
      lastTrackTimestampMsRef.current = nowMs;
      lastForcedRouteRefreshAtRef.current = nowMs;
      if (pendingRawPointsRef.current.length >= NAV_LIVE_ROUTE_MIN_BATCH_POINTS) {
        void flushBufferedRoadPoints(true);
      }
    }

    onTripPointRecord?.({
      latitude: samplePoint.latitude,
      longitude: samplePoint.longitude,
      speed: effectiveSpeedKmh,
      heading: derivedHeading ?? (typeof heading === 'number' ? heading : null),
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      recordedAt: new Date().toISOString(),
    });
    acceptedTelemetryRef.current = [
      ...acceptedTelemetryRef.current,
      {
        latitude: samplePoint.latitude,
        longitude: samplePoint.longitude,
        speed: effectiveSpeedKmh,
        heading: derivedHeading ?? (typeof heading === 'number' ? heading : null),
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        recordedAt: new Date().toISOString(),
      },
    ];

    if (!previousRawPoint && pendingRawPointsRef.current.length === 0) {
      lastRawTrackPointRef.current = stablePoint;
      pendingRawPointsRef.current = [stablePoint];
      lastTrackTimestampMsRef.current = timestampMs;
    } else {
      const movedKm = movedFromLastTrackKm;

      if (movedKm > MAX_POINT_GAP_KM || effectiveSpeedKmh > MAX_ACCEPTED_SPEED_KMH) {
        return;
      }

      if (movedKm < MIN_TRACK_MOVE_KM || effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH) {
        if (
          mapRef.current &&
          typeof accuracy === 'number' &&
          accuracy <= ACTIVE_CAMERA_ACCURACY_METERS &&
          Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
        ) {
          lastCameraFollowAtRef.current = Date.now();
          followCamera(stablePoint);
        }
        return;
      }

      pendingRawPointsRef.current = [...pendingRawPointsRef.current, stablePoint];
      lastRawTrackPointRef.current = stablePoint;
      lastTrackTimestampMsRef.current = nowMs;
      const pendingDistanceKm = polylineDistanceKm(
        dedupeSequentialPoints([
          routePointsRef.current[routePointsRef.current.length - 1],
          ...pendingRawPointsRef.current,
        ].filter((point): point is LatLngPoint => Boolean(point))),
      );
      const enoughTimePassed = nowMs - lastForcedRouteRefreshAtRef.current >= NAV_FORCE_ROUTE_REFRESH_MIN_INTERVAL_MS;
      const enoughDistanceQueued = pendingDistanceKm >= NAV_FORCE_ROUTE_REFRESH_MIN_DISTANCE_KM;
      const shouldForceRouteRefresh =
        routePointsRef.current.length > 0 &&
        pendingRawPointsRef.current.length >= NAV_LIVE_ROUTE_MIN_BATCH_POINTS &&
        (enoughTimePassed || enoughDistanceQueued);
      if (shouldForceRouteRefresh) {
        lastForcedRouteRefreshAtRef.current = nowMs;
      }
      void flushBufferedRoadPoints(shouldForceRouteRefresh);
    }

    setSpeedKmh(Math.max(0, effectiveSpeedKmh));

    if (
      mapRef.current &&
      typeof accuracy === 'number' &&
      accuracy <= ACTIVE_CAMERA_ACCURACY_METERS &&
      Date.now() - lastCameraFollowAtRef.current >= TRIP_CAMERA_FOLLOW_INTERVAL_MS
    ) {
      lastCameraFollowAtRef.current = Date.now();
      followCamera(stablePoint);
    }
  };

  const flushBufferedRoadPoints = (force = false): Promise<void> => {
    if (pendingRawPointsRef.current.length === 0) {
      return roadSnapQueueRef.current;
    }

    const minimumBatchPoints = force ? NAV_LIVE_ROUTE_MIN_BATCH_POINTS : MIN_ROAD_MATCH_POINTS;
    if (!force && pendingRawPointsRef.current.length < minimumBatchPoints) {
      return roadSnapQueueRef.current;
    }

    const anchorPoint = routePointsRef.current[routePointsRef.current.length - 1] ?? null;
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

    roadSnapQueueRef.current = roadSnapQueueRef.current.then(async () => {
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
      let segment = rawSegment;

      if (isNetworkAvailable) {
        segment =
          (await fetchPreferredRoadPath(rawSegment)) ??
          [];
        segment = dedupeSequentialPoints(segment);
      }

      if (segment.length < 2) {
        if (isNetworkAvailable) {
          pendingRawPointsRef.current = [...batchPoints, ...pendingRawPointsRef.current];
          roadMatchCarryoverRef.current = rawSegment.slice(
            Math.max(rawSegment.length - ROAD_MATCH_OVERLAP_POINTS, 0),
          );
          return;
        }
        segment = rawSegment;
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
      if (segmentDistanceKm >= MIN_SNAPPED_MOVE_KM) {
        const previousHeadingPoint = segment[0];
        const latestHeadingPoint = segment[segment.length - 1];
        if (previousHeadingPoint && latestHeadingPoint) {
          applyNavigationHeading(headingBetweenDeg(previousHeadingPoint, latestHeadingPoint), 0.18);
        }
      }
      setDistanceKm((prev) =>
        prev + Math.max(segmentDistanceKm, rawSegmentDistanceKm >= MIN_SNAPPED_MOVE_KM ? rawSegmentDistanceKm : 0),
      );

      if (pendingRawPointsRef.current.length > 0) {
        await flushBufferedRoadPoints(true);
      }
    });

    return roadSnapQueueRef.current;
  };

  const beginTripSession = (startLocation: LatLngPoint | null) => {
    setTripSummary(null);
    setCompletedTripPreviewPath([]);
    setIsTripStarted(true);
    setHasConfirmedMovement(false);
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setRoutePoints([]);
    setTravelPath([]);
    routePointsRef.current = [];
    travelPathRef.current = [];
    acceptedTelemetryRef.current = [];
    pendingRawPointsRef.current = [];
    roadMatchCarryoverRef.current = [];
    movementValidationPointsRef.current = [];
    hasConfirmedMovementRef.current = false;
    lastForcedRouteRefreshAtRef.current = 0;
    tripStartAnchorRef.current = startLocation;
    lastRawTrackPointRef.current = startLocation;
    lastTrackTimestampMsRef.current = startLocation ? Date.now() : null;
    onTripStart?.({ startLocation });

    if (startLocation) {
      updateMarkerPosition(startLocation);
      followCamera(startLocation, true);
    }
  };

  const finishTripSession = async () => {
    await flushBufferedRoadPoints(true);
    await roadSnapQueueRef.current.catch(() => undefined);

    const finalPath =
      travelPathRef.current.length > 0
        ? travelPathRef.current
        : smoothDisplayedRoutePath(
            dedupeSequentialPoints([
              ...routePointsRef.current,
              ...pendingRawPointsRef.current,
            ]),
          );
    const completedDistanceKm = distanceKm > 0 ? distanceKm : polylineDistanceKm(finalPath);
    const durationSeconds = elapsedSeconds;
    const averageSpeed =
      durationSeconds > 0 ? completedDistanceKm / (durationSeconds / 3600) : speedKmh;

    setIsTripStarted(false);
    setCompletedTripPreviewPath(finalPath);
    setTripSummary({
      durationText: `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
      distanceText: `${completedDistanceKm.toFixed(2)} km`,
      speedText: `${Math.max(0, averageSpeed).toFixed(1)} km/h`,
      statusText: finalPath.length > 1 ? 'Trip route saved successfully' : 'Trip saved and waiting for route points',
    });

    onTripComplete({
      fare: 10,
      distanceKm: completedDistanceKm,
      durationSeconds,
      routePath: finalPath,
      endLocation: finalPath.length > 0 ? finalPath[finalPath.length - 1] : latestActualCoordsRef.current,
      rawTelemetry: acceptedTelemetryRef.current,
    });
    lastForcedRouteRefreshAtRef.current = 0;
  };

  const guidanceTitle = hasConfirmedMovement && visibleTraceHasRoute ? roadLabel : 'Trip started';
  const guidanceMessage = !hasConfirmedMovement
    ? 'Waiting for confirmed movement'
    : shouldShowOffRoadConnector
      ? 'Move toward the road'
    : isLowGpsAccuracy
      ? 'GPS signal weak'
      : visibleTraceHasRoute
        ? 'Live route updating'
        : 'Tracking live route';
  const movementState = !hasConfirmedMovement
    ? 'Waiting'
    : shouldShowOffRoadConnector
      ? 'Off road'
      : speedKmh >= 4
        ? 'Moving'
        : 'Tracking';

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={activeMapType}
        customMapStyle={isDarkMap ? (DARK_MAP_STYLE as any) : []}
        initialRegion={{
          latitude: OBRERO_GEOFENCE[0].latitude,
          longitude: OBRERO_GEOFENCE[0].longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        mapPadding={mapPadding}
        showsUserLocation={false}
        showsMyLocationButton={false}
        followsUserLocation={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
      >
        <Polygon
          coordinates={OBRERO_GEOFENCE}
          fillColor={GEOFENCE_FILL}
          strokeColor="rgba(0,0,0,0)"
          strokeWidth={0}
          zIndex={5}
        />
        <Polyline
          coordinates={geofenceLoop}
          strokeColor={GEOFENCE_STROKE}
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
          zIndex={6}
        />

        {shouldShowOffRoadConnector && coords && connectorTargetPoint ? (
          <Polyline
            coordinates={[coords, connectorTargetPoint]}
            strokeColor="rgba(26, 115, 232, 0.46)"
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={[7, 7]}
            zIndex={7}
          />
        ) : null}

        {liveDisplayPath.length > 1 ? (
          <>
            <Polyline
              coordinates={liveDisplayPath}
              strokeColor={routeCasingColor}
              strokeWidth={12}
              lineCap="round"
              lineJoin="round"
              zIndex={7}
            />
            <Polyline
              coordinates={liveDisplayPath}
              strokeColor={routeCoreColor}
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
              zIndex={8}
            />
          </>
        ) : null}

        {coords ? (
          <MarkerAnimated
            ref={markerRef}
            coordinate={markerCoordinate as any}
            title="Your Location"
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            flat={false}
            zIndex={30}
            tracksViewChanges={Platform.OS === 'android'}
          >
            <View style={styles.liveDotWrap} renderToHardwareTextureAndroid>
              <View style={styles.liveDotShadow} />
              <View style={styles.liveDotOuterRing}>
                <View style={styles.liveDotInnerRing}>
                  <View style={styles.liveDotCore} />
                </View>
              </View>
            </View>
          </MarkerAnimated>
        ) : null}
      </MapView>

      <View style={[styles.topHeader, { paddingTop: (insets.top || 0) + 12 }]}>
        <View style={styles.topHeaderRow}>
          <View style={styles.headerLeadIcon}>
            <AppIcon name="navigation" size={16} color="#FFFFFF" active />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>{visibleTraceHasRoute ? 'On the road' : 'Current Trip'}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {roadLabel}
            </Text>
          </View>
          <View style={[styles.headerStatePill, isLowGpsAccuracy ? styles.headerStatePillWarn : null]}>
            <Text style={[styles.headerStateText, isLowGpsAccuracy ? styles.headerStateTextWarn : null]}>
              {shouldShowOffRoadConnector ? 'Rejoin road' : isLowGpsAccuracy ? 'GPS weak' : movementState}
            </Text>
          </View>
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
          <View style={[styles.statusPill, isLowGpsAccuracy ? styles.statusPillWarn : styles.statusPillPrimary]}>
            <Text style={[styles.statusPillText, isLowGpsAccuracy ? styles.statusPillTextWarn : styles.statusPillTextPrimary]}>
              {movementState}
            </Text>
          </View>
        </View>

        <View style={styles.panelDivider} />

        <View style={styles.guidanceRow}>
          <View style={[styles.guidanceIconWrap, isLowGpsAccuracy ? styles.guidanceIconWrapWarn : null]}>
            <AppIcon
              name={isLowGpsAccuracy ? 'alert-circle' : 'navigation'}
              size={20}
              color={isLowGpsAccuracy ? '#B45309' : NAV_BLUE_DARK}
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
        durationText={tripSummary?.durationText ?? '0:00'}
        distanceText={tripSummary?.distanceText ?? '0.00 km'}
        speedText={tripSummary?.speedText ?? '0.0 km/h'}
        statusText={tripSummary?.statusText ?? 'Trip saved successfully'}
        onClose={() => {
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
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: NAV_BLUE,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLeadIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
    marginBottom: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 24,
    fontFamily: 'CircularStdMedium500',
  },
  headerStatePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerStatePillWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  headerStateText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  headerStateTextWarn: {
    color: '#FEF3C7',
  },
  liveDotWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotShadow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: NAV_ARROW_OUTER_GLOW,
    transform: [{ scale: 1.18 }],
  },
  liveDotOuterRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  liveDotInnerRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: NAV_ARROW_GLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotCore: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: NAV_LIVE_BLUE,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  mapTypeButton: {
    position: 'absolute',
    right: 18,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  mapTypeButtonText: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 18,
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    color: NAV_BLUE_DARK,
    fontSize: 32,
    lineHeight: 36,
    fontFamily: 'CircularStdMedium500',
  },
  panelMeta: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8FBF6',
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
    fontSize: 11,
    lineHeight: 13,
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

