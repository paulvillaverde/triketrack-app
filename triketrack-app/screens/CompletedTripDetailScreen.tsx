import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripRouteMap } from '../components/maps/TripRouteMap';
import { AppIcon, Avatar } from '../components/ui';
import {
  resolveTripHistoryRoutePath,
  type TripHistoryItem,
} from '../lib/tripTransactions';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from './homeScreenShared';

const OBRERO_GEOFENCE = [
  { latitude: 7.0832297, longitude: 125.624803 },
  { latitude: 7.076611, longitude: 125.617071 },
  { latitude: 7.078821, longitude: 125.6140047 },
  { latitude: 7.0817, longitude: 125.612905 },
  { latitude: 7.0835656, longitude: 125.612594 },
  { latitude: 7.0849408, longitude: 125.611754 },
  { latitude: 7.0868171, longitude: 125.613004 },
  { latitude: 7.09187, longitude: 125.6177977 },
];

type CompletedTripDetailScreenProps = {
  selectedTrip: TripHistoryItem;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  onBack: () => void;
  onRoadMatchOfflineTrip?: (trip: TripHistoryItem) => void | Promise<void>;
  onSyncOfflineTrip?: (trip: TripHistoryItem) => void | Promise<void>;
  isLowBatteryMapMode?: boolean;
};

const getDaysAgo = (tripDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${tripDate}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const formatNumericDate = (tripDate: string) => {
  const date = new Date(`${tripDate}T00:00:00`);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const formatTripDateForCard = (tripDate: string) => {
  const daysAgo = getDaysAgo(tripDate);
  const numeric = formatNumericDate(tripDate);
  if (daysAgo === 0) return `${numeric} (Today)`;
  if (daysAgo === 1) return `${numeric} (Yesterday)`;
  return numeric;
};

const formatTripDateTime = (value: string | null) => {
  if (!value) {
    return '--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTripNumber = (id: string) => id.replace(/^TRIP-/, '');

const getPickupLabel = (trip: TripHistoryItem) =>
  trip.startDisplayName?.trim() || 'Unknown pickup point';

const getDestinationLabel = (trip: TripHistoryItem) =>
  trip.endDisplayName?.trim() || 'Unknown destination';

const hasDetailedMatchedRoute = (trip: TripHistoryItem) =>
  trip.routePath.length > 2 &&
  typeof trip.routeMatchSummary?.provider === 'string' &&
  trip.routeMatchSummary.provider !== 'local-directional';

const hasSavedMapMatchedRoute = (trip: TripHistoryItem) =>
  trip.routePath.length > 2 &&
  (trip.routeMatchSummary?.provider === 'osrm-match' ||
    trip.routeMatchSummary?.provider === 'osrm-route');

const getRouteSourceLabel = (trip: TripHistoryItem) => {
  if (
    trip.syncStatus !== 'SYNCED' &&
    (trip.offlineSyncStatus === 'completed_offline' ||
      trip.offlineSyncStatus === 'syncing' ||
      trip.offlineSyncStatus === 'failed')
  ) {
    if (hasSavedMapMatchedRoute(trip)) {
      return 'Road Match';
    }
    return trip.rawTelemetry.length > 0 ? 'Raw GPS' : 'Awaiting Sync';
  }

  switch (trip.routeMatchSummary?.provider) {
    case 'osrm-match':
      return hasDetailedMatchedRoute(trip) ? 'Road Match' : 'Matching Pending';
    case 'osrm-route':
      return hasDetailedMatchedRoute(trip) ? 'Road Match' : 'Matching Pending';
    case 'ors-directions':
      return hasDetailedMatchedRoute(trip) ? 'Road Match' : 'Matching Pending';
    case 'local-directional':
      return 'Matching Pending';
    default:
      return trip.rawTelemetry.length > 0 ? 'Matching Pending' : 'No route';
  }
};

const getRouteRegion = (routePath: Array<{ latitude: number; longitude: number }>) => {
  if (routePath.length === 0) {
    return {
      latitude: 7.0832297,
      longitude: 125.624803,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  if (routePath.length === 1) {
    return {
      latitude: routePath[0].latitude,
      longitude: routePath[0].longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  const lats = routePath.map((point) => point.latitude);
  const lngs = routePath.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.008),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.008),
  };
};

type TripReplaySpeed = 1 | 2 | 4;
type LatLng = { latitude: number; longitude: number };

const TRIP_REPLAY_MIN_DURATION_MS = 14000;
const TRIP_REPLAY_MAX_DURATION_MS = 90000;
const TRIP_REPLAY_MS_PER_POINT = 850;
const TRIP_REPLAY_CAMERA_PROGRESS_STEP = 0.012;

const isFiniteLatLng = (point: LatLng | null | undefined): point is LatLng =>
  Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );

const dedupeSequentialLatLng = (points: LatLng[]) =>
  points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1];
    return (
      Math.abs(previous.latitude - point.latitude) >= 0.000001 ||
      Math.abs(previous.longitude - point.longitude) >= 0.000001
    );
  });

const distanceMetersBetween = (from: LatLng, to: LatLng) =>
  Math.hypot(
    (to.latitude - from.latitude) * 111320,
    (to.longitude - from.longitude) * 111320 * Math.cos((from.latitude * Math.PI) / 180),
  );

const headingDegreesBetween = (from: LatLng, to: LatLng) => {
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const deltaLongitude = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLongitude) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(deltaLongitude);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const getReplayPointAtProgress = (path: LatLng[], progress: number) => {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (path.length === 0) {
    return null;
  }
  if (path.length === 1 || clampedProgress <= 0) {
    return path[0];
  }
  if (clampedProgress >= 1) {
    return path[path.length - 1];
  }

  const segmentDistances = path.slice(1).map((point, index) => distanceMetersBetween(path[index], point));
  const totalDistance = segmentDistances.reduce((sum, value) => sum + value, 0);
  if (totalDistance <= 0) {
    const index = Math.min(path.length - 1, Math.round(clampedProgress * (path.length - 1)));
    return path[index];
  }

  const targetDistance = totalDistance * clampedProgress;
  let traveledDistance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const segmentDistance = segmentDistances[index - 1] ?? 0;
    if (traveledDistance + segmentDistance >= targetDistance) {
      const segmentProgress =
        segmentDistance <= 0 ? 0 : (targetDistance - traveledDistance) / segmentDistance;
      const previous = path[index - 1];
      const current = path[index];
      return {
        latitude: previous.latitude + (current.latitude - previous.latitude) * segmentProgress,
        longitude: previous.longitude + (current.longitude - previous.longitude) * segmentProgress,
      };
    }
    traveledDistance += segmentDistance;
  }

  return path[path.length - 1];
};

const getReplayHeadingAtProgress = (path: LatLng[], progress: number) => {
  if (path.length < 2) {
    return null;
  }

  const before = getReplayPointAtProgress(path, Math.max(0, progress - 0.002));
  const after = getReplayPointAtProgress(path, Math.min(1, progress + 0.002));
  if (!before || !after || distanceMetersBetween(before, after) < 0.4) {
    return null;
  }

  return headingDegreesBetween(before, after);
};

const getReplayDurationMs = (path: LatLng[]) =>
  Math.max(
    TRIP_REPLAY_MIN_DURATION_MS,
    Math.min(TRIP_REPLAY_MAX_DURATION_MS, Math.max(path.length - 1, 1) * TRIP_REPLAY_MS_PER_POINT),
  );

export function CompletedTripDetailScreen({
  selectedTrip,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  onBack,
  onRoadMatchOfflineTrip,
  onSyncOfflineTrip,
  isLowBatteryMapMode = false,
}: CompletedTripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomSystemInset = Math.max(insets.bottom || 0, Platform.OS === 'android' ? 48 : 0);
  const { height: windowHeight } = Dimensions.get('window');
  const detailSheetHeight = useMemo(() => Math.min(Math.max(windowHeight * 0.56, 430), 620), [windowHeight]);
  const detailSheetVisiblePeek = Math.min(318, Math.max(detailSheetHeight - 72, 240));
  const detailSheetCollapsedOffset = useMemo(
    () => Math.max(detailSheetHeight - detailSheetVisiblePeek, 0),
    [detailSheetHeight, detailSheetVisiblePeek],
  );
  const detailSheetTranslateY = useRef(new Animated.Value(detailSheetCollapsedOffset)).current;
  const detailSheetTranslateYValueRef = useRef(detailSheetCollapsedOffset);
  const detailSheetGestureStartRef = useRef(detailSheetCollapsedOffset);

  const selectedTripRoutePath = useMemo(
    () => resolveTripHistoryRoutePath(selectedTrip),
    [selectedTrip],
  );
  const rawGpsRoutePath = useMemo(
    () =>
      dedupeSequentialLatLng(
        selectedTrip.rawTelemetry
          .map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }))
          .filter(isFiniteLatLng),
      ),
    [selectedTrip.rawTelemetry],
  );
  const replayPath = useMemo(() => {
    const matchedPath = dedupeSequentialLatLng(selectedTripRoutePath.filter(isFiniteLatLng));
    const routeProvider = selectedTrip.routeMatchSummary?.provider;
    const hasSavedMatchedGeometry =
      matchedPath.length > 1 &&
      typeof routeProvider === 'string' &&
      routeProvider !== 'local-directional';

    if (hasSavedMatchedGeometry) {
      return matchedPath;
    }

    return [];
  }, [selectedTrip.routeMatchSummary?.provider, selectedTripRoutePath]);
  const hasReplayPath = selectedTrip.status === 'COMPLETED' && replayPath.length > 1;
  const replayDurationMs = useMemo(() => getReplayDurationMs(replayPath), [replayPath]);
  const [isReplayPanelVisible, setIsReplayPanelVisible] = useState(false);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<TripReplaySpeed>(1);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replayCameraFollowToken, setReplayCameraFollowToken] = useState(0);
  const replayProgressRef = useRef(0);
  const replaySpeedRef = useRef<TripReplaySpeed>(1);
  const replayFrameRef = useRef<number | null>(null);
  const replayLastFrameAtRef = useRef<number | null>(null);
  const replayLastCameraProgressRef = useRef(0);
  const replayWasPlayingBeforeScrubRef = useRef(false);
  const replaySliderTrackRef = useRef<View | null>(null);
  const replaySliderTrackXRef = useRef(0);
  const replaySliderTrackWidthRef = useRef(1);
  const [dateLabelNow, setDateLabelNow] = useState(() => new Date());
  const replayMarkerCoordinate = useMemo(
    () => (isReplayPanelVisible ? getReplayPointAtProgress(replayPath, replayProgress) : null),
    [isReplayPanelVisible, replayPath, replayProgress],
  );
  const replayMarkerHeadingDeg = useMemo(
    () => (isReplayPanelVisible ? getReplayHeadingAtProgress(replayPath, replayProgress) : null),
    [isReplayPanelVisible, replayPath, replayProgress],
  );
  const isReplayFullScreen = isReplayPanelVisible && isReplayPlaying;

  useEffect(() => {
    replayProgressRef.current = replayProgress;
  }, [replayProgress]);

  useEffect(() => {
    replaySpeedRef.current = replaySpeed;
  }, [replaySpeed]);

  useEffect(() => {
    const timer = setInterval(() => setDateLabelNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsReplayPanelVisible(false);
    setIsReplayPlaying(false);
    setReplayProgress(0);
    replayProgressRef.current = 0;
    replayLastFrameAtRef.current = null;
    replayLastCameraProgressRef.current = 0;
    if (replayFrameRef.current !== null) {
      cancelAnimationFrame(replayFrameRef.current);
      replayFrameRef.current = null;
    }
  }, [selectedTrip.id]);

  useEffect(() => {
    if (!isReplayPlaying || !hasReplayPath) {
      if (replayFrameRef.current !== null) {
        cancelAnimationFrame(replayFrameRef.current);
        replayFrameRef.current = null;
      }
      replayLastFrameAtRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      const lastFrameAt = replayLastFrameAtRef.current ?? timestamp;
      replayLastFrameAtRef.current = timestamp;
      const elapsedMs = Math.max(0, timestamp - lastFrameAt);
      const nextProgress = Math.min(
        1,
        replayProgressRef.current + (elapsedMs * replaySpeedRef.current) / replayDurationMs,
      );

      replayProgressRef.current = nextProgress;
      setReplayProgress(nextProgress);

      if (
        Math.abs(nextProgress - replayLastCameraProgressRef.current) >= TRIP_REPLAY_CAMERA_PROGRESS_STEP ||
        nextProgress === 0 ||
        nextProgress === 1
      ) {
        replayLastCameraProgressRef.current = nextProgress;
        setReplayCameraFollowToken((token) => token + 1);
      }

      if (nextProgress >= 1) {
        setIsReplayPlaying(false);
        replayLastFrameAtRef.current = null;
        replayFrameRef.current = null;
        return;
      }

      replayFrameRef.current = requestAnimationFrame(step);
    };

    replayFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (replayFrameRef.current !== null) {
        cancelAnimationFrame(replayFrameRef.current);
        replayFrameRef.current = null;
      }
    };
  }, [hasReplayPath, isReplayPlaying, replayDurationMs]);

  const seekReplayTo = useCallback((progress: number) => {
    const nextProgress = Math.max(0, Math.min(1, progress));
    replayProgressRef.current = nextProgress;
    replayLastCameraProgressRef.current = nextProgress;
    setReplayProgress(nextProgress);
    setReplayCameraFollowToken((token) => token + 1);
  }, []);

  const playReplay = useCallback(() => {
    if (!hasReplayPath) {
      return;
    }
    setIsReplayPanelVisible(true);
    if (replayProgressRef.current >= 1) {
      seekReplayTo(0);
    }
    setIsReplayPlaying(true);
  }, [hasReplayPath, seekReplayTo]);

  const pauseReplay = useCallback(() => {
    setIsReplayPlaying(false);
  }, []);

  const exitReplay = useCallback(() => {
    setIsReplayPlaying(false);
    setIsReplayPanelVisible(false);
  }, []);

  const restartReplay = useCallback(() => {
    if (!hasReplayPath) {
      return;
    }
    setIsReplayPanelVisible(true);
    seekReplayTo(0);
    setIsReplayPlaying(true);
  }, [hasReplayPath, seekReplayTo]);

  const updateReplayProgressFromScreenX = useCallback(
    (screenX: number) => {
      const nextProgress =
        (screenX - replaySliderTrackXRef.current) /
        Math.max(replaySliderTrackWidthRef.current, 1);
      seekReplayTo(nextProgress);
    },
    [seekReplayTo],
  );

  const replaySliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => hasReplayPath,
        onMoveShouldSetPanResponder: () => hasReplayPath,
        onPanResponderGrant: (event) => {
          replayWasPlayingBeforeScrubRef.current = isReplayPlaying;
          setIsReplayPlaying(false);
          replaySliderTrackRef.current?.measureInWindow((x, _y, width) => {
            replaySliderTrackXRef.current = x;
            replaySliderTrackWidthRef.current = Math.max(width, 1);
            updateReplayProgressFromScreenX(event.nativeEvent.pageX);
          });
        },
        onPanResponderMove: (_event, gestureState) => {
          updateReplayProgressFromScreenX(gestureState.moveX);
        },
        onPanResponderRelease: () => {
          if (replayWasPlayingBeforeScrubRef.current && replayProgressRef.current < 1) {
            setIsReplayPlaying(true);
          }
        },
        onPanResponderTerminate: () => {
          if (replayWasPlayingBeforeScrubRef.current && replayProgressRef.current < 1) {
            setIsReplayPlaying(true);
          }
        },
      }),
    [hasReplayPath, isReplayPlaying, updateReplayProgressFromScreenX],
  );
  useEffect(() => {
    const listener = detailSheetTranslateY.addListener(({ value }) => {
      detailSheetTranslateYValueRef.current = value;
    });
    return () => {
      detailSheetTranslateY.removeListener(listener);
    };
  }, [detailSheetTranslateY]);

  useEffect(() => {
    detailSheetTranslateY.setValue(detailSheetCollapsedOffset);
  }, [detailSheetCollapsedOffset, detailSheetTranslateY, selectedTrip]);

  const animateDetailSheetTo = (target: number) => {
    Animated.spring(detailSheetTranslateY, {
      toValue: target,
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.9,
    }).start();
  };

  const detailSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          detailSheetGestureStartRef.current = detailSheetTranslateYValueRef.current;
          detailSheetTranslateY.stopAnimation((value) => {
            detailSheetGestureStartRef.current = value;
            detailSheetTranslateYValueRef.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextValue = Math.min(
            Math.max(detailSheetGestureStartRef.current + gestureState.dy, 0),
            detailSheetCollapsedOffset,
          );
          detailSheetTranslateY.setValue(nextValue);
        },
        onPanResponderRelease: (_, gestureState) => {
          const projectedValue = detailSheetTranslateYValueRef.current + gestureState.vy * 30;
          animateDetailSheetTo(projectedValue > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0);
        },
        onPanResponderTerminate: () => {
          animateDetailSheetTo(
            detailSheetTranslateYValueRef.current > detailSheetCollapsedOffset / 2 ? detailSheetCollapsedOffset : 0,
          );
        },
      }),
    [detailSheetCollapsedOffset, detailSheetTranslateY],
  );

  const isUnsyncedOfflineTrip =
    selectedTrip.syncStatus !== 'SYNCED' &&
    (selectedTrip.syncStatus === 'SYNC_PENDING' ||
      selectedTrip.offlineSyncStatus === 'completed_offline' ||
      selectedTrip.offlineSyncStatus === 'failed' ||
      selectedTrip.offlineSyncStatus === 'syncing');
  const hasMapMatchedRoute = hasSavedMapMatchedRoute(selectedTrip);
  const hasDisplayableSavedRoute = selectedTripRoutePath.length > 1;
  const hasRawPreviewRoute = isUnsyncedOfflineTrip && !hasMapMatchedRoute && selectedTripRoutePath.length > 2;
  const shouldShowRawGpsRoute =
    isUnsyncedOfflineTrip && !hasMapMatchedRoute && (rawGpsRoutePath.length > 1 || hasRawPreviewRoute);
  const displayRoutePath =
    shouldShowRawGpsRoute && rawGpsRoutePath.length > 1 ? rawGpsRoutePath : selectedTripRoutePath;
  const savedRouteProvider = selectedTrip.routeMatchSummary?.provider;
  const shouldLockSavedRoute =
    shouldShowRawGpsRoute ||
    (selectedTripRoutePath.length > 2 &&
      typeof savedRouteProvider === 'string' &&
      savedRouteProvider !== 'local-directional');
  const vehiclePlateNumber = selectedTrip.vehiclePlateNumber ?? profilePlateNumber;
  const isDarkMode = isLowBatteryMapMode;
  const rawGpsCount = Math.max(
    Number.isFinite(selectedTrip.rawGpsPointCount) ? selectedTrip.rawGpsPointCount : 0,
    selectedTrip.rawTelemetry.length,
  );
  const canSyncOfflineTrip =
    isUnsyncedOfflineTrip && hasMapMatchedRoute;
  const canRoadMatchOfflineTrip =
    isUnsyncedOfflineTrip &&
    !hasMapMatchedRoute &&
    (rawGpsCount > 1 || selectedTripRoutePath.length > 2);
  const isSyncingOfflineTrip = selectedTrip.offlineSyncStatus === 'syncing';
  const [isRoadMatchingOfflineTrip, setIsRoadMatchingOfflineTrip] = useState(false);
  const actionButtonLabel = isSyncingOfflineTrip
    ? 'Syncing...'
    : isRoadMatchingOfflineTrip
      ? 'Matching...'
      : canRoadMatchOfflineTrip
        ? 'Map Match'
        : 'Sync';
  const detailStatusLabel =
    selectedTrip.syncStatus === 'SYNCED'
      ? 'Completed Trip'
      : hasMapMatchedRoute
        ? 'Map Matched Route'
        : 'Raw GPS Preview';
  const detailTitle =
    selectedTrip.syncStatus === 'SYNCED'
      ? `Trip #${getTripNumber(selectedTrip.id)}`
      : hasMapMatchedRoute
        ? 'Ready to sync'
        : 'Ready to convert';
  const statusPillLabel =
    selectedTrip.syncStatus === 'SYNCED'
      ? 'Completed'
      : selectedTrip.offlineSyncStatus === 'syncing'
        ? 'Syncing'
        : selectedTrip.offlineSyncStatus === 'failed'
          ? 'Unsynced'
          : selectedTrip.offlineSegmentsCount > 0
            ? 'Offline'
            : 'Unsynced';
  const isActionButtonDisabled =
    isSyncingOfflineTrip ||
    isRoadMatchingOfflineTrip ||
    (canRoadMatchOfflineTrip ? !onRoadMatchOfflineTrip : !onSyncOfflineTrip);
  const getLocalDateKey = (value: Date) => {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const selectedTripDateKey = (() => {
    const timestamp = selectedTrip.startedAt ?? selectedTrip.endedAt;
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (Number.isFinite(parsed.getTime())) {
        return getLocalDateKey(parsed);
      }
    }
    return selectedTrip.tripDate;
  })();
  const selectedTripDaysAgo = (() => {
    const today = new Date(dateLabelNow);
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${selectedTripDateKey}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  })();
  const selectedTripDateLabel =
    selectedTripDaysAgo === 0
      ? 'Today'
      : selectedTripDaysAgo === 1
        ? 'Yesterday'
        : formatNumericDate(selectedTripDateKey);

  return (
    <View style={[localStyles.detailScreen, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}>
      {hasDisplayableSavedRoute || shouldShowRawGpsRoute ? (
        <View style={localStyles.detailMapContainer}>
          <TripRouteMap
            routePath={displayRoutePath}
            rawStartPoint={shouldLockSavedRoute ? null : selectedTrip.startLocationRaw ?? selectedTrip.rawStartPoint ?? null}
            matchedStartPoint={selectedTrip.startLocationMatched}
            dashedStartConnector={shouldLockSavedRoute ? [] : selectedTrip.dashedStartConnector}
            rawEndPoint={shouldLockSavedRoute ? null : selectedTrip.endLocationRaw}
            endPoint={selectedTrip.endLocationMatched}
            dashedEndConnector={shouldLockSavedRoute ? [] : selectedTrip.dashedEndConnector}
            rawTelemetry={shouldLockSavedRoute ? [] : selectedTrip.rawTelemetry}
            geofence={OBRERO_GEOFENCE}
            lockSavedRoute={shouldLockSavedRoute}
            isLowBatteryMapMode={isLowBatteryMapMode}
            replayMarkerCoordinate={replayMarkerCoordinate}
            replayMarkerHeadingDeg={replayMarkerHeadingDeg}
            replayCameraFollowToken={replayCameraFollowToken}
            style={localStyles.tripMap}
            getRouteRegion={getRouteRegion}
          />
          {!isReplayFullScreen ? (
          <View
            style={[
              localStyles.mapReceiptOverlay,
              isDarkMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                    shadowOpacity: 0,
                    elevation: 0,
                  }
                : null,
              { top: Math.max(insets.top + 64, 82) },
            ]}
          >
            <View style={localStyles.mapEndpointRow}>
              <View style={[localStyles.mapEndpointIcon, localStyles.mapEndpointIconPickup]}>
                <AppIcon name="navigation" size={11} color="#147D64" />
              </View>
              <View style={localStyles.mapEndpointCopy}>
                <Text
                  style={[
                    localStyles.mapEndpointLabel,
                    isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Pickup point
                </Text>
                <Text
                  style={[
                    localStyles.mapEndpointValue,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {getPickupLabel(selectedTrip)}
                </Text>
              </View>
            </View>
            <View
              style={[
                localStyles.mapEndpointDivider,
                isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_SOFT_DARK } : null,
              ]}
            />
            <View style={localStyles.mapEndpointRow}>
              <View style={[localStyles.mapEndpointIcon, localStyles.mapEndpointIconDestination]}>
                <AppIcon name="map-pin" size={11} color="#B42318" />
              </View>
              <View style={localStyles.mapEndpointCopy}>
                <Text
                  style={[
                    localStyles.mapEndpointLabel,
                    isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  Destination
                </Text>
                <Text
                  style={[
                    localStyles.mapEndpointValue,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {getDestinationLabel(selectedTrip)}
                </Text>
              </View>
            </View>
          </View>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            localStyles.detailMapContainer,
            localStyles.tripMapEmptyFull,
            isDarkMode ? { backgroundColor: MAXIM_UI_SURFACE_ALT_DARK } : null,
          ]}
        >
          <AppIcon name="map-pin" size={18} color="#94A3B8" />
          <Text
            style={[
              localStyles.tripMapEmptyText,
              isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
            ]}
          >
            No route saved for this trip
          </Text>
        </View>
      )}

      {!isReplayFullScreen ? (
      <Pressable
        style={[
          localStyles.detailBackFloating,
          isDarkMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
                shadowOpacity: 0,
                elevation: 0,
              }
            : null,
          { top: Math.max(insets.top + 8, 18) },
        ]}
        onPress={onBack}
      >
        <AppIcon name="chevron-left" size={20} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
      </Pressable>
      ) : null}

      {isReplayFullScreen ? (
        <View
          style={[
            localStyles.replayFullscreenControls,
            isDarkMode
              ? {
                  backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                  borderColor: MAXIM_UI_BORDER_DARK,
                  shadowOpacity: 0,
                  elevation: 0,
                }
              : null,
            { bottom: Math.max(bottomSystemInset + 12, 28) },
          ]}
        >
          <View style={localStyles.replayTopRow}>
            <Pressable
              style={[localStyles.replayMainButton, localStyles.replayMainButtonActive]}
              onPress={pauseReplay}
            >
              <AppIcon name="pause" size={15} color="#FFFFFF" active />
              <Text style={localStyles.replayMainButtonText}>Pause</Text>
            </Pressable>
            <Pressable
              style={[
                localStyles.replaySecondaryButton,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
              onPress={restartReplay}
            >
              <AppIcon name="refresh-cw" size={14} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
              <Text
                style={[
                  localStyles.replaySecondaryButtonText,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Restart
              </Text>
            </Pressable>
            <Pressable
              style={[
                localStyles.replaySecondaryButton,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
              onPress={exitReplay}
            >
              <AppIcon name="x" size={14} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
              <Text
                style={[
                  localStyles.replaySecondaryButtonText,
                  isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                Exit
              </Text>
            </Pressable>
          </View>
          <View style={localStyles.replaySpeedRow}>
            {([1, 2, 4] as TripReplaySpeed[]).map((speed) => {
              const isSelected = replaySpeed === speed;
              return (
                <Pressable
                  key={speed}
                  style={[
                    localStyles.replaySpeedButton,
                    isDarkMode
                      ? {
                          backgroundColor: MAXIM_UI_SURFACE_DARK,
                          borderColor: MAXIM_UI_BORDER_DARK,
                        }
                      : null,
                    isSelected ? localStyles.replaySpeedButtonSelected : null,
                  ]}
                  onPress={() => setReplaySpeed(speed)}
                >
                  <Text
                    style={[
                      localStyles.replaySpeedButtonText,
                      isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                      isSelected ? localStyles.replaySpeedButtonTextSelected : null,
                    ]}
                  >
                    {speed}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={localStyles.replayProgressRow}>
            <Text style={[localStyles.replayProgressText, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
              {Math.round(replayProgress * 100)}%
            </Text>
            <View
              ref={(ref: View | null) => {
                replaySliderTrackRef.current = ref;
              }}
              style={[
                localStyles.replaySliderTrack,
                isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
              ]}
              onLayout={(event) => {
                replaySliderTrackWidthRef.current = Math.max(event.nativeEvent.layout.width, 1);
              }}
              {...replaySliderPanResponder.panHandlers}
            >
              <View
                style={[
                  localStyles.replaySliderFill,
                  { width: `${Math.max(0, Math.min(100, replayProgress * 100))}%` },
                ]}
              />
              <View
                style={[
                  localStyles.replaySliderThumb,
                  { left: `${Math.max(0, Math.min(100, replayProgress * 100))}%` },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}

      {!isReplayFullScreen ? (
      <Animated.View
        style={[
          localStyles.detailBottomSafeArea,
          isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
          { height: Math.max(bottomSystemInset + 18, 42) },
          { transform: [{ translateY: detailSheetTranslateY }] },
        ]}
      />
      ) : null}

      {!isReplayFullScreen ? (
      <Animated.View
        style={[
          localStyles.detailBottomSheet,
          isDarkMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
                shadowOpacity: 0,
                elevation: 0,
              }
            : null,
          {
            height: detailSheetHeight,
            paddingBottom: Math.max(bottomSystemInset, 14) + 8,
            transform: [{ translateY: detailSheetTranslateY }],
          },
        ]}
      >
        <View style={localStyles.sheetDragZone} {...detailSheetPanResponder.panHandlers}>
          <View
            style={[
              localStyles.sheetHandle,
              isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
            ]}
          />
        </View>

        <ScrollView
          contentContainerStyle={localStyles.detailSheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.rideSummaryCard}>
            <View style={localStyles.rideSummaryTripRow}>
              <View style={localStyles.rideTripCopy}>
                <Text style={localStyles.detailEyebrow}>{detailStatusLabel}</Text>
                <Text
                  style={[
                    localStyles.detailSheetSub,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {detailTitle}
                </Text>
              </View>
              <View
                style={[
                  localStyles.tripIdPill,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <Text
                  style={[
                    localStyles.tripIdPillText,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {selectedTrip.id}
                </Text>
              </View>
            </View>

            <View
              style={[
                localStyles.rideDriverTopRow,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                    }
                  : null,
              ]}
            >
              <View style={localStyles.rideDriverLeft}>
                <Avatar
                  name={profileName}
                  imageUri={profileImageUri}
                  style={localStyles.driverAvatarImage}
                />
                <View style={localStyles.driverTextWrap}>
                  <Text
                    style={[
                      localStyles.driverName,
                      isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileName}
                  </Text>
                  <Text
                    style={[
                      localStyles.driverSub,
                      isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {profileDriverCode}
                  </Text>
                </View>
              </View>
              <View style={localStyles.rideVehicleInfo}>
                <Text
                  style={[
                    localStyles.rideVehicleText,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  {vehiclePlateNumber}
                </Text>
                <Text
                  style={[
                    localStyles.rideVehicleSub,
                    isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                  ]}
                  numberOfLines={1}
                >
                  Plate number
                </Text>
              </View>
            </View>

            <View style={localStyles.rideStatusRow}>
              <View style={localStyles.statusPill}>
                <Text style={localStyles.statusPillText}>{statusPillLabel}</Text>
              </View>
              <Text
                style={[
                  localStyles.rideStatusMeta,
                  isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
                numberOfLines={1}
              >
                {selectedTripDateLabel}
              </Text>
            </View>

            {hasReplayPath ? (
              <View
                style={[
                  localStyles.replayCard,
                  isDarkMode
                    ? {
                        backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                        borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                      }
                    : null,
                ]}
              >
                <View style={localStyles.replayTopRow}>
                  <Pressable
                    style={[
                      localStyles.replayMainButton,
                      isReplayPlaying ? localStyles.replayMainButtonActive : null,
                    ]}
                    onPress={isReplayPanelVisible && isReplayPlaying ? pauseReplay : playReplay}
                  >
                    <AppIcon
                      name={isReplayPanelVisible && isReplayPlaying ? 'pause' : 'play'}
                      size={15}
                      color="#FFFFFF"
                      active
                    />
                    <Text style={localStyles.replayMainButtonText}>
                      {isReplayPanelVisible ? (isReplayPlaying ? 'Pause' : 'Play') : 'Replay'}
                    </Text>
                  </Pressable>
                  {isReplayPanelVisible ? (
                    <Pressable
                      style={[
                        localStyles.replaySecondaryButton,
                        isDarkMode
                          ? {
                              backgroundColor: MAXIM_UI_SURFACE_DARK,
                              borderColor: MAXIM_UI_BORDER_DARK,
                            }
                          : null,
                      ]}
                      onPress={restartReplay}
                    >
                      <AppIcon name="refresh-cw" size={14} color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#0F172A'} />
                      <Text
                        style={[
                          localStyles.replaySecondaryButtonText,
                          isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                        ]}
                      >
                        Restart
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {isReplayPanelVisible ? (
                  <>
                    <View style={localStyles.replaySpeedRow}>
                      {([1, 2, 4] as TripReplaySpeed[]).map((speed) => {
                        const isSelected = replaySpeed === speed;
                        return (
                          <Pressable
                            key={speed}
                            style={[
                              localStyles.replaySpeedButton,
                              isDarkMode
                                ? {
                                    backgroundColor: MAXIM_UI_SURFACE_DARK,
                                    borderColor: MAXIM_UI_BORDER_DARK,
                                  }
                                : null,
                              isSelected ? localStyles.replaySpeedButtonSelected : null,
                            ]}
                            onPress={() => setReplaySpeed(speed)}
                          >
                            <Text
                              style={[
                                localStyles.replaySpeedButtonText,
                                isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                                isSelected ? localStyles.replaySpeedButtonTextSelected : null,
                              ]}
                            >
                              {speed}x
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={localStyles.replayProgressRow}>
                      <Text style={[localStyles.replayProgressText, isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null]}>
                        {Math.round(replayProgress * 100)}%
                      </Text>
                      <View
                        ref={(ref: View | null) => {
                          replaySliderTrackRef.current = ref;
                        }}
                        style={[
                          localStyles.replaySliderTrack,
                          isDarkMode ? { backgroundColor: MAXIM_UI_BORDER_DARK } : null,
                        ]}
                        onLayout={(event) => {
                          replaySliderTrackWidthRef.current = Math.max(event.nativeEvent.layout.width, 1);
                        }}
                        {...replaySliderPanResponder.panHandlers}
                      >
                        <View
                          style={[
                            localStyles.replaySliderFill,
                            { width: `${Math.max(0, Math.min(100, replayProgress * 100))}%` },
                          ]}
                        />
                        <View
                          style={[
                            localStyles.replaySliderThumb,
                            { left: `${Math.max(0, Math.min(100, replayProgress * 100))}%` },
                          ]}
                        />
                      </View>
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={localStyles.rideMetricGrid}>
              <SummaryMetric label="Fare" value={selectedTrip.fare} isDarkMode={isDarkMode} />
              <SummaryMetric label="Duration" value={selectedTrip.duration} isDarkMode={isDarkMode} />
              <SummaryMetric label="Distance" value={selectedTrip.distance} isDarkMode={isDarkMode} />
              <SummaryMetric label="Started" value={formatTripDateTime(selectedTrip.startedAt)} isDarkMode={isDarkMode} />
              <SummaryMetric label="Ended" value={formatTripDateTime(selectedTrip.endedAt)} isDarkMode={isDarkMode} />
              <SummaryMetric label="Violations" value={selectedTrip.violations} isDarkMode={isDarkMode} />
              <SummaryMetric label="Compliance" value={`${selectedTrip.compliance}%`} isDarkMode={isDarkMode} />
              <SummaryMetric label="Route" value={getRouteSourceLabel(selectedTrip)} isDarkMode={isDarkMode} />
              <SummaryMetric
                label="GPS Points"
                value={`${rawGpsCount}`}
                isDarkMode={isDarkMode}
              />
            </View>
            {canRoadMatchOfflineTrip || canSyncOfflineTrip || isSyncingOfflineTrip || isRoadMatchingOfflineTrip ? (
              <Pressable
                style={[
                  localStyles.syncFinalizeButton,
                  isActionButtonDisabled ? localStyles.syncFinalizeButtonDisabled : null,
                ]}
                onPress={async () => {
                  if (canRoadMatchOfflineTrip) {
                    setIsRoadMatchingOfflineTrip(true);
                    try {
                      await onRoadMatchOfflineTrip?.(selectedTrip);
                    } finally {
                      setIsRoadMatchingOfflineTrip(false);
                    }
                    return;
                  }
                  await onSyncOfflineTrip?.(selectedTrip);
                }}
                disabled={isActionButtonDisabled}
              >
                <AppIcon name="refresh-cw" size={15} color="#FFFFFF" />
                <Text style={localStyles.syncFinalizeButtonText}>{actionButtonLabel}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={localStyles.feedbackCard}>
            <Text
              style={[
                localStyles.feedbackLabel,
                isDarkMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
            >
              Feedback
            </Text>
            <View
              style={[
                localStyles.feedbackBox,
                isDarkMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <Text
                style={[
                  localStyles.feedbackEmptyText,
                  isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                ]}
              >
                No feedback submitted
              </Text>
            </View>
          </View>

        </ScrollView>
      </Animated.View>
      ) : null}
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  isDarkMode = false,
}: {
  label: string;
  value: string;
  isDarkMode?: boolean;
}) {
  return (
    <View style={localStyles.rideMetricCell}>
      <Text
        style={[
          localStyles.rideMetricLabel,
          isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          localStyles.rideMetricValue,
          isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  detailScreen: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  detailMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  tripMap: {
    flex: 1,
  },
  tripMapEmptyFull: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  tripMapEmptyText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  mapReceiptOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  mapEndpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapEndpointIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapEndpointIconPickup: {
    backgroundColor: '#E8FBF6',
  },
  mapEndpointIconDestination: {
    backgroundColor: '#FEE4E2',
  },
  mapEndpointCopy: {
    flex: 1,
    minWidth: 0,
  },
  mapEndpointLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  mapEndpointValue: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  mapEndpointDivider: {
    height: 1,
    marginVertical: 10,
    backgroundColor: '#EEF2F6',
  },
  detailBackFloating: {
    position: 'absolute',
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    zIndex: 10,
  },
  detailBottomSafeArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F4F6FA',
  },
  detailBottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  sheetDragZone: {
    paddingTop: 2,
    paddingBottom: 2,
    marginBottom: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D0D7E2',
    marginBottom: 12,
  },
  detailSheetScrollContent: {
    paddingBottom: 18,
  },
  rideSummaryCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  rideSummaryTripRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  rideTripCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailEyebrow: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#57A88D',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 5,
  },
  detailSheetSub: {
    fontSize: 20,
    lineHeight: 24,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  tripIdPill: {
    maxWidth: 104,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  tripIdPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  rideDriverTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  rideDriverLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  driverTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  rideVehicleInfo: {
    flexShrink: 0,
    width: 104,
    alignItems: 'flex-end',
  },
  rideVehicleText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideVehicleSub: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 11,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  statusPill: {
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  replayCard: {
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  replayFullscreenControls: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
    zIndex: 20,
  },
  replayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replayMainButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#1A73E8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  replayMainButtonActive: {
    backgroundColor: '#0F5EC7',
  },
  replayMainButtonText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  replaySecondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replaySecondaryButtonText: {
    fontSize: 12,
    lineHeight: 15,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  replaySpeedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  replaySpeedButton: {
    minWidth: 42,
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  replaySpeedButtonSelected: {
    borderColor: '#BAE6FD',
    backgroundColor: '#E0F2FE',
  },
  replaySpeedButtonText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  replaySpeedButtonTextSelected: {
    color: '#0369A1',
  },
  replayProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  replayProgressText: {
    width: 36,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  replaySliderTrack: {
    flex: 1,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    overflow: 'visible',
  },
  replaySliderFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1A73E8',
  },
  replaySliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#1A73E8',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  rideStatusMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'right',
  },
  rideMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 13,
  },
  rideMetricCell: {
    width: '33.333%',
    minWidth: 0,
    paddingRight: 8,
  },
  rideMetricLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#8A94A6',
    fontFamily: 'CircularStdMedium500',
  },
  rideMetricValue: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  syncFinalizeButton: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#147D64',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  syncFinalizeButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  syncFinalizeButtonText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  feedbackCard: {
    marginTop: 18,
  },
  feedbackLabel: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  feedbackBox: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  feedbackEmptyText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
});
