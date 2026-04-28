import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Animated,
  Alert,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
  Vibration,
} from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from '@expo-google-fonts/poppins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import {
  authenticateDriver,
  attachTripRoutesToServerTrip,
  checkTripExists,
  completeTrip,
  deleteTrip as deleteTripFromBackend,
  fetchDriverProfile,
  hasSupabaseConfig,
  insertTripPointBatch,
  listViolations,
  listTripsWithRoutePoints,
  replaceTripRouteFallback,
  setDriverLocationOffline,
  setDriverPassword,
  startTrip,
  supabase,
  type DriverProfileRecord,
  type DriverQrStatus,
  type DriverRecord,
  uploadDriverAvatar,
  upsertDriverLocation,
  insertTripRouteBatch,
} from './supabase';
import {
  attachServerTripIdToOfflineTrip,
  completeOfflineTripSession,
  deleteOfflineTrip,
  getLatestOngoingOfflineTripSession,
  getOfflineMatchedTripPointsByLocalTripId,
  getOfflineTripSession,
  getOfflineTripSessionByServerTripId,
  getOfflineTripPointsByLocalTripId,
  getOfflineTripStatusEventsByLocalTripId,
  getPendingOfflineTripSessions,
  getUnsyncedOfflineMatchedTripPoints,
  getUnsyncedOfflineTripPoints,
  initOfflineTripStorage,
  insertOfflineMatchedTripPoints,
  insertOfflineTripSession,
  insertOfflineTripPoint,
  insertOfflineTripStatusEvent,
  markOfflineMatchedTripPointsSynced,
  markOfflineTripSessionCompletedSynced,
  markOfflineTripSessionStartedSynced,
  markOfflineTripPointsSynced,
  type OfflineMatchedPointSource,
} from './lib/offlineTripStorage';
import { reconstructCompletedTripPath, type RawTripTelemetryPoint } from './lib/tripPathReconstruction';
import {
  buildRoadAlignedTripPath,
  buildRoadAlignedTripPathDetailed,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
} from './lib/roadPath';
import { buildMatchedTracePointsFromSegment } from './lib/tripTrace';
import {
  buildTripHistoryItem,
  countOfflineSegments,
  mergeTripHistoryItem,
  normalizeGeoJsonRoutePath,
  normalizeTripHistoryItem,
  pickPreferredRouteMatchSummary,
  type TripCompletionPayload,
  type TripGpsQualitySummary,
  type TripHistoryItem,
  type TripRouteMatchSummary,
} from './lib/tripTransactions';
import {
  selectTripStartEndpointFromBuildings,
  selectTripEndpointFromBuildings,
  type TripEndpointSelectionSummary,
} from './lib/tripEndpointSelection';
import { resolveTripDisplayLocationLabels } from './lib/tripLocationLabels';
import { LoginScreen } from './screens/LoginScreen';
import { GetStartedScreen } from './screens/GetStartedScreen';
import { HomeScreen } from './screens/HomeScreen';
import { StartTripScreen } from './screens/StartTripScreen';
import { TripNavigationScreen } from './screens/TripNavigationScreen';
import { TripScreen } from './screens/TripScreen';
import { ViolationScreen, type ViolationItem } from './screens/ViolationScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { CreatePasswordScreen } from './screens/CreatePasswordScreen';
import { PermissionOnboardingScreen } from './screens/PermissionOnboardingScreen';
import {
  TripActionModal,
  type NotificationCenterItem,
  type NotificationCenterTarget,
} from './components/modals';
import { AppIcon, type AppIconName } from './components/ui';
import { useLowBatteryMapMode } from './lib/useLowBatteryMapMode';
import {
  MAXIM_UI_BG_DARK,
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_BORDER_SOFT_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_DARK,
  MAXIM_UI_TEXT_DARK,
} from './screens/homeScreenShared';

type Screen =
  | 'getStarted'
  | 'login'
  | 'createPassword'
  | 'permissionPhone'
  | 'permissionLocation'
  | 'home'
  | 'startTrip'
  | 'tripNavigation'
  | 'trip'
  | 'violation'
  | 'profile';

type PermissionOnboardingStatus = 'granted' | 'skipped';

type PermissionOnboardingState = {
  phoneAccess: PermissionOnboardingStatus;
  locationAccess: PermissionOnboardingStatus;
  completedAt: string;
};

type HomeStatsFilter = 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_30_DAYS';

type NotificationDraft = {
  category: 'account' | 'profile' | 'trip' | 'violation' | 'appeal';
  title: string;
  message: string;
  icon: AppIconName;
  target?: NotificationCenterTarget;
  dedupeKey?: string;
};

type OfflineQueueStatus = {
  pendingTripCount: number;
  pendingGpsPointCount: number;
  pendingMatchedPointCount: number;
  isSyncing: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
  nextRetryAt: string | null;
};

type ProfileQrDetails = {
  qrId: number | null;
  qrToken: string | null;
  qrStatus: DriverQrStatus | null;
  qrIssuedAt: string | null;
  reportPath: string | null;
};

const createEmptyProfileQrDetails = (): ProfileQrDetails => ({
  qrId: null,
  qrToken: null,
  qrStatus: null,
  qrIssuedAt: null,
  reportPath: null,
});

const createEmptyOfflineQueueStatus = (): OfflineQueueStatus => ({
  pendingTripCount: 0,
  pendingGpsPointCount: 0,
  pendingMatchedPointCount: 0,
  isSyncing: false,
  lastAttemptAt: null,
  lastError: null,
  nextRetryAt: null,
});

const NOTIFICATION_MAX_ITEMS = 60;
const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_DUPLICATE_WINDOW_MS = 2 * 60 * 60 * 1000;
const NOTIFICATION_ALLOWED_CATEGORIES = new Set<NotificationCenterItem['category']>([
  'account',
  'profile',
  'trip',
  'violation',
  'appeal',
]);
const NOTIFICATION_ALLOWED_TARGET_SCREENS = new Set<NotificationCenterTarget['screen']>([
  'home',
  'profile',
  'trip',
  'startTrip',
  'tripNavigation',
  'violation',
]);

const parseNotificationDateMs = (createdAt: string) => {
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNotificationTarget = (target: unknown): NotificationCenterTarget | undefined => {
  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<NotificationCenterTarget>;
  if (
    typeof candidate.screen !== 'string' ||
    !NOTIFICATION_ALLOWED_TARGET_SCREENS.has(candidate.screen as NotificationCenterTarget['screen'])
  ) {
    return undefined;
  }

  return {
    screen: candidate.screen as NotificationCenterTarget['screen'],
    itemId:
      typeof candidate.itemId === 'string' && candidate.itemId.trim().length > 0
        ? candidate.itemId
        : null,
  };
};

const getNotificationDedupeKey = (item: Pick<NotificationCenterItem, 'category' | 'title' | 'message' | 'target' | 'dedupeKey'>) =>
  item.dedupeKey?.trim() ||
  [
    item.category,
    item.title.trim().toLowerCase(),
    item.message.trim().toLowerCase(),
    item.target?.screen ?? '',
    item.target?.itemId ?? '',
  ].join(':');

const isRelevantNotification = (item: NotificationCenterItem, nowMs = Date.now()) => {
  const createdAtMs = parseNotificationDateMs(item.createdAt);
  if (createdAtMs === null) {
    return false;
  }

  return (
    NOTIFICATION_ALLOWED_CATEGORIES.has(item.category) &&
    item.title.trim().length > 0 &&
    item.message.trim().length > 0 &&
    createdAtMs <= nowMs + 5 * 60 * 1000 &&
    nowMs - createdAtMs <= NOTIFICATION_RETENTION_MS
  );
};

const normalizeNotificationItems = (items: NotificationCenterItem[], nowMs = Date.now()) => {
  const seenKeys = new Set<string>();

  return items
    .filter((item) => isRelevantNotification(item, nowMs))
    .sort((a, b) => {
      const aMs = parseNotificationDateMs(a.createdAt) ?? 0;
      const bMs = parseNotificationDateMs(b.createdAt) ?? 0;
      return bMs - aMs;
    })
    .filter((item) => {
      const key = getNotificationDedupeKey(item);
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    })
    .slice(0, NOTIFICATION_MAX_ITEMS);
};

const normalizeStoredNotificationItem = (item: Partial<NotificationCenterItem>): NotificationCenterItem | null => {
  if (
    typeof item.id !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.message !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.icon !== 'string' ||
    typeof item.read !== 'boolean' ||
    typeof item.category !== 'string' ||
    !NOTIFICATION_ALLOWED_CATEGORIES.has(item.category as NotificationCenterItem['category'])
  ) {
    return null;
  }

  return {
    id: item.id,
    category: item.category as NotificationCenterItem['category'],
    title: item.title,
    message: item.message,
    createdAt: item.createdAt,
    read: item.read,
    icon: item.icon as AppIconName,
    target: normalizeNotificationTarget(item.target),
    dedupeKey: typeof item.dedupeKey === 'string' ? item.dedupeKey : undefined,
  };
};

const STARTUP_AUTH_MIN_DISPLAY_MS = 2000;

const createDemoTrip = (): TripHistoryItem => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const demoRoutePath = [
    // Road-following demo path used by trip history previews.
    { latitude: 7.078241, longitude: 125.614578 },
    { latitude: 7.078549, longitude: 125.614448 },
    { latitude: 7.078634, longitude: 125.614412 },
    { latitude: 7.078693, longitude: 125.614387 },
    { latitude: 7.078712, longitude: 125.614521 },
    { latitude: 7.078778, longitude: 125.614469 },
    { latitude: 7.078919, longitude: 125.614354 },
    { latitude: 7.079054, longitude: 125.614251 },
    { latitude: 7.079189, longitude: 125.614146 },
    { latitude: 7.079224, longitude: 125.614122 },
    { latitude: 7.079256, longitude: 125.614104 },
    { latitude: 7.079295, longitude: 125.61409 },
    { latitude: 7.079347, longitude: 125.614086 },
    { latitude: 7.079398, longitude: 125.614088 },
    { latitude: 7.079643, longitude: 125.614092 },
    { latitude: 7.079962, longitude: 125.614097 },
    { latitude: 7.080177, longitude: 125.614101 },
    { latitude: 7.08044, longitude: 125.614105 },
    { latitude: 7.080741, longitude: 125.614115 },
    { latitude: 7.081036, longitude: 125.614125 },
    { latitude: 7.08108, longitude: 125.614127 },
    { latitude: 7.081101, longitude: 125.614127 },
    { latitude: 7.081339, longitude: 125.614139 },
    { latitude: 7.081538, longitude: 125.614149 },
    { latitude: 7.08174, longitude: 125.614158 },
    { latitude: 7.082294, longitude: 125.614829 },
    { latitude: 7.082641, longitude: 125.614546 },
    { latitude: 7.083658, longitude: 125.615749 },
    { latitude: 7.084517, longitude: 125.61681 },
    { latitude: 7.084579, longitude: 125.616887 },
  ];

  return buildTripHistoryItem({
    id: 'TRIP-9001',
    tripDate: `${yyyy}-${mm}-${dd}`,
    fare: 20,
    durationSeconds: 180,
    matchedRoutePath: demoRoutePath,
    rawStartPoint: demoRoutePath[0] ?? null,
    rawEndPoint: demoRoutePath[demoRoutePath.length - 1] ?? null,
    matchedStartPoint: demoRoutePath[0] ?? null,
    matchedEndPoint: demoRoutePath[demoRoutePath.length - 1] ?? null,
    syncStatus: 'SYNCED',
    tripState: 'SYNCED',
    routeName: 'Demo Route',
  });
};

const computeTripTotals = (items: TripHistoryItem[]) =>
  items.reduce(
    (acc, item) => {
      const fareNum =
        typeof item.fareAmount === 'number' && Number.isFinite(item.fareAmount)
          ? item.fareAmount
          : Number(item.fare.replace(/[^\d.-]/g, '') || 0);
      const distanceNum =
        typeof item.totalDistanceMatchedMeters === 'number' && Number.isFinite(item.totalDistanceMatchedMeters)
          ? item.totalDistanceMatchedMeters / 1000
          : Number(item.distance.replace(/[^\d.]/g, '') || 0);
      const durationMinutes =
        typeof item.durationSeconds === 'number' && Number.isFinite(item.durationSeconds)
          ? item.durationSeconds / 60
          : Number(item.duration.replace(/[^\d]/g, '') || 0);
      return {
        earnings: acc.earnings + fareNum,
        trips: acc.trips + 1,
        distance: acc.distance + distanceNum,
        minutes: acc.minutes + durationMinutes,
      };
    },
    { earnings: 0, trips: 0, distance: 0, minutes: 0 },
  );

const getDaysAgoFromTripDate = (tripDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${tripDate}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const filterTripHistoryByRange = (items: TripHistoryItem[], range: HomeStatsFilter) =>
  items.filter((item) => {
    const daysAgo = getDaysAgoFromTripDate(item.tripDate);
    if (range === 'TODAY') return daysAgo === 0;
    if (range === 'YESTERDAY') return daysAgo === 1;
    if (range === 'LAST_WEEK') return daysAgo >= 1 && daysAgo <= 7;
    return daysAgo >= 0 && daysAgo <= 29;
  });

const dedupeSequentialRoutePoints = (
  points: Array<{ latitude: number; longitude: number }>,
) => {
  return points.filter((point, index, source) => {
    if (index === 0) {
      return true;
    }
    const previous = source[index - 1];
    return (
      previous.latitude !== point.latitude ||
      previous.longitude !== point.longitude
    );
  });
};

const normalizeSavedRoutePath = (
  nextPath: Array<{ latitude: number; longitude: number }>,
  fallbackPath: Array<{ latitude: number; longitude: number }> = [],
  {
    preserveDetailedGeometry = false,
  }: {
    preserveDetailedGeometry?: boolean;
  } = {},
) => {
  const normalizePath = (points: Array<{ latitude: number; longitude: number }>) => {
    const dedupedPoints = dedupeSequentialRoutePoints(points);
    return preserveDetailedGeometry ? dedupedPoints : smoothDisplayedRoutePath(dedupedPoints);
  };

  const normalizedNext = normalizePath(nextPath);
  if (normalizedNext.length > 1) {
    return normalizedNext;
  }

  return normalizePath(fallbackPath);
};

const shouldPreserveDetailedRouteGeometry = (
  routeMatchSummary?: TripRouteMatchSummary | null,
) =>
  typeof routeMatchSummary?.provider === 'string' &&
  routeMatchSummary.provider !== 'local-directional';

const buildPreferredOfflineMatchedPath = (
  points: Array<{
    latitude: number;
    longitude: number;
    match_source: OfflineMatchedPointSource;
  }>,
) => {
  const authoritativeMatchedPoints = points.filter(
    (point) => point.match_source === 'service' || point.match_source === 'reconstructed',
  );
  const roadAnchoredPoints = points.filter((point) => point.match_source !== 'local-heuristic');
  const preferredPoints =
    authoritativeMatchedPoints.length > 1
      ? authoritativeMatchedPoints
      : roadAnchoredPoints.length > 1
        ? roadAnchoredPoints
        : points;
  const preserveDetailedGeometry = preferredPoints.some(
    (point) => point.match_source === 'service' || point.match_source === 'reconstructed',
  );
  return normalizeSavedRoutePath(
    preferredPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
    [],
    {
      preserveDetailedGeometry,
    },
  );
};

const upsertTripHistoryItems = (
  current: TripHistoryItem[],
  nextItems: TripHistoryItem[],
) => {
  const byId = new Map<string, TripHistoryItem>();
  for (const item of current) {
    byId.set(item.id, item);
  }
  for (const item of nextItems) {
    byId.set(item.id, mergeTripHistoryItem(byId.get(item.id), item));
  }
  return [...byId.values()].sort((left, right) => {
    const leftTime = new Date(left.startedAt ?? `${left.tripDate}T00:00:00`).getTime();
    const rightTime = new Date(right.startedAt ?? `${right.tripDate}T00:00:00`).getTime();
    return rightTime - leftTime;
  });
};

const removeTripHistoryItem = (items: TripHistoryItem[], tripId: string) =>
  items.filter((item) => item.id !== tripId);

const getLocalTripIdFromHistoryId = (tripId: string) =>
  tripId.startsWith('TRIP-trip-') ? tripId.replace(/^TRIP-/, '') : null;

const getTripHistorySyncSignature = (item: TripHistoryItem) => {
  const fareValue = Number(item.fare.replace(/[^\d.-]/g, ''));
  const normalizedFare = Number.isFinite(fareValue) ? fareValue.toFixed(2) : item.fare;
  return [
    item.tripDate,
    item.durationSeconds,
    normalizedFare,
  ].join('|');
};

const reconcileSyncedTripHistoryItems = (
  current: TripHistoryItem[],
  mappedServerItems: TripHistoryItem[],
) => {
  const syncedServerSignatures = new Set(
    mappedServerItems
      .filter((item) => item.syncStatus === 'SYNCED')
      .map(getTripHistorySyncSignature),
  );
  const syncedServerIds = new Set(
    mappedServerItems
      .filter((item) => item.syncStatus === 'SYNCED')
      .map((item) => item.id),
  );
  const withoutStalePendingItems = current.filter((item) => {
    if (item.syncStatus !== 'SYNC_PENDING') {
      return true;
    }

    return (
      !syncedServerIds.has(item.id) &&
      !syncedServerSignatures.has(getTripHistorySyncSignature(item))
    );
  });

  return upsertTripHistoryItems(withoutStalePendingItems, mappedServerItems);
};

const LEGACY_DUMMY_TRIP_ROUTE_NAMES = new Set([
  'Road-Following Demo Route',
  'Pearl-Amethyst Road Demo',
]);

const isLegacyDummyTrip45 = (item: TripHistoryItem) =>
  item.id === 'TRIP-45' &&
  item.driverCode === 'D-007' &&
  item.vehiclePlateNumber === '54321' &&
  LEGACY_DUMMY_TRIP_ROUTE_NAMES.has(item.routeName ?? '');

const buildTripHistoryId = ({
  serverTripId,
  localTripId,
  fallbackOrdinal,
}: {
  serverTripId?: string | number | null;
  localTripId?: string | null;
  fallbackOrdinal: number;
}) => {
  if (serverTripId !== null && typeof serverTripId !== 'undefined' && String(serverTripId).length > 0) {
    return `TRIP-${serverTripId}`;
  }
  if (localTripId) {
    return `TRIP-${localTripId}`;
  }
  return `TRIP-${String(1000 + fallbackOrdinal).padStart(4, '0')}`;
};

const buildOptimisticTripRoutePath = ({
  routePath,
  rawTelemetry,
  routeMatchSummary = null,
}: {
  routePath: Array<{ latitude: number; longitude: number }>;
  rawTelemetry?: RawTripTelemetryPoint[];
  routeMatchSummary?: TripRouteMatchSummary | null;
}) => {
  const preserveDetailedGeometry = shouldPreserveDetailedRouteGeometry(routeMatchSummary);
  const tracedRoute = normalizeSavedRoutePath(routePath, [], {
    preserveDetailedGeometry,
  });
  if (tracedRoute.length > 0) {
    return tracedRoute;
  }

  const rawTelemetryPath = dedupeSequentialRoutePoints(
    (rawTelemetry ?? []).map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );
  return normalizeSavedRoutePath(rawTelemetryPath, [], {
    preserveDetailedGeometry,
  });
};

const buildRoadAlignedRoutePath = async ({
  candidatePath,
  fallbackPath = [],
  preserveDetailedGeometry = false,
  trustCandidateGeometry = false,
}: {
  candidatePath: Array<{ latitude: number; longitude: number }>;
  fallbackPath?: Array<{ latitude: number; longitude: number }>;
  preserveDetailedGeometry?: boolean;
  trustCandidateGeometry?: boolean;
}) => {
  return buildRoadAlignedTripPath({
    candidatePath,
    fallbackPath,
    preserveDetailedGeometry,
    trustCandidateGeometry,
  });
};

const buildRoadAlignedRoutePathDetailed = async ({
  candidatePath,
  fallbackPath = [],
  preserveDetailedGeometry = false,
  trustCandidateGeometry = false,
}: {
  candidatePath: Array<{ latitude: number; longitude: number }>;
  fallbackPath?: Array<{ latitude: number; longitude: number }>;
  preserveDetailedGeometry?: boolean;
  trustCandidateGeometry?: boolean;
}) =>
  buildRoadAlignedTripPathDetailed({
    candidatePath,
    fallbackPath,
    preserveDetailedGeometry,
    trustCandidateGeometry,
  });

type FinalizedTripEndpointState = {
  roadEndpoint: { latitude: number; longitude: number } | null;
  matchedEndPoint: { latitude: number; longitude: number } | null;
  dashedEndConnector: Array<{ latitude: number; longitude: number }>;
  endpointSelectionSummary: TripEndpointSelectionSummary | null;
};

type FinalizedTripStartEndpointState = {
  roadStartPoint: { latitude: number; longitude: number } | null;
  matchedStartPoint: { latitude: number; longitude: number } | null;
  dashedStartConnector: Array<{ latitude: number; longitude: number }>;
  startEndpointSelectionSummary: TripEndpointSelectionSummary | null;
};

const resolveFinalizedTripStartEndpointState = async ({
  routePath,
  rawStartPoint = null,
}: {
  routePath: Array<{ latitude: number; longitude: number }>;
  rawStartPoint?: { latitude: number; longitude: number } | null;
}): Promise<FinalizedTripStartEndpointState> => {
  const normalizedRoutePath = dedupeSequentialRoutePoints(routePath);
  const roadStartPoint = normalizedRoutePath[0] ?? null;
  if (!roadStartPoint) {
    return {
      roadStartPoint: null,
      matchedStartPoint: null,
      dashedStartConnector: [],
      startEndpointSelectionSummary: null,
    };
  }

  const endpointSelection = await selectTripStartEndpointFromBuildings({
    roadPath: normalizedRoutePath,
    rawStartPoint,
  });

  return {
    roadStartPoint,
    matchedStartPoint: endpointSelection.finalEndpoint ?? roadStartPoint,
    dashedStartConnector: endpointSelection.dashedConnector,
    startEndpointSelectionSummary: endpointSelection.summary ?? null,
  };
};

const resolveFinalizedTripEndpointState = async ({
  routePath,
  rawEndPoint = null,
}: {
  routePath: Array<{ latitude: number; longitude: number }>;
  rawEndPoint?: { latitude: number; longitude: number } | null;
}): Promise<FinalizedTripEndpointState> => {
  const normalizedRoutePath = dedupeSequentialRoutePoints(routePath);
  const roadEndpoint = normalizedRoutePath.at(-1) ?? null;
  if (!roadEndpoint) {
    return {
      roadEndpoint: null,
      matchedEndPoint: null,
      dashedEndConnector: [],
      endpointSelectionSummary: null,
    };
  }

  const endpointSelection = await selectTripEndpointFromBuildings({
    roadPath: normalizedRoutePath,
    rawEndPoint,
  });

  return {
    roadEndpoint,
    matchedEndPoint: endpointSelection.finalEndpoint ?? roadEndpoint,
    dashedEndConnector: endpointSelection.dashedConnector,
    endpointSelectionSummary: endpointSelection.summary ?? null,
  };
};

const MAX_TRIP_ROUTE_REPAIRS_PER_PASS = Number.MAX_SAFE_INTEGER;
const TRIP_ROUTE_ENDPOINT_MATCH_MAX_DISTANCE_KM = 0.08;
const SHORT_TRIP_ROUTE_REPAIR_MAX_DISTANCE_KM = 0.15;
const SHORT_TRIP_ROUTE_REPAIR_MAX_POINTS = 6;
const OVER_SMOOTHED_REMOTE_ROUTE_MIN_EXPECTED_POINTS = 8;

const parseServerTripIdFromHistoryId = (tripId: string) => {
  const match = /^TRIP-(\d+)$/.exec(tripId.trim());
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapViolationRecordToItem = (violation: {
  id: string;
  driver_id: number;
  trip_id: number | null;
  type: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  details: string | null;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title?: string | null;
  appeals?: ViolationItem['appeals'];
  proofs?: ViolationItem['proofs'];
}): ViolationItem => {
  const date = new Date(violation.occurred_at);
  const formattedDate = Number.isNaN(date.getTime())
    ? violation.occurred_at
    : date.toLocaleString('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
  const derivedTitle =
    violation.type === 'GEOFENCE_BOUNDARY'
      ? 'Geofence Boundary Violation'
      : violation.type === 'ROUTE_DEVIATION'
        ? 'Route Deviation Alert'
        : violation.type === 'UNAUTHORIZED_STOP'
          ? 'Unauthorized Stop'
          : 'Route Violation';

  return {
    id: violation.id,
    driverId: violation.driver_id,
    tripId: violation.trip_id,
    type: violation.type,
    title: violation.title ?? derivedTitle,
    date: formattedDate,
    occurredAt: violation.occurred_at,
    latitude: violation.latitude,
    longitude: violation.longitude,
    location: violation.location_label ?? '--',
    details: violation.details ?? '--',
    status: violation.status,
    priority: violation.priority,
    appeals: violation.appeals ?? [],
    proofs: violation.proofs ?? [],
  };
};

type RealtimeViolationPayload = {
  id?: string;
  type?: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  title?: string | null;
  details?: string | null;
  location_label?: string | null;
  occurred_at?: string;
};

const getViolationRealtimeTitle = (violation: RealtimeViolationPayload) => {
  if (typeof violation.title === 'string' && violation.title.trim().length > 0) {
    return violation.title.trim();
  }

  if (violation.type === 'GEOFENCE_BOUNDARY') return 'Geofence Boundary Violation';
  if (violation.type === 'ROUTE_DEVIATION') return 'Route Deviation Alert';
  if (violation.type === 'UNAUTHORIZED_STOP') return 'Unauthorized Stop';
  return 'Violation recorded';
};

const getViolationRealtimeMessage = (violation: RealtimeViolationPayload) => {
  const details =
    typeof violation.details === 'string' && violation.details.trim().length > 0
      ? violation.details.trim()
      : null;
  const location =
    typeof violation.location_label === 'string' && violation.location_label.trim().length > 0
      ? violation.location_label.trim()
      : null;

  if (details && location) {
    return `${details} Location: ${location}.`;
  }
  if (details) return details;
  if (location) return `Location: ${location}.`;
  return 'A server-validated route violation has been added to your account.';
};

const isTemporarilyIgnorableRouteError = (error: string | null | undefined) => {
  const normalizedError = error?.toLowerCase() ?? '';
  return (
    normalizedError.includes('no active route assigned') ||
    normalizedError.includes('no route available for testing')
  );
};

const MAX_FAST_START_ACCURACY_METERS = 150;
const MAX_LIVE_SYNC_ACCURACY_METERS = 80;
const MAX_LIVE_SYNC_JUMP_KM = 0.08;
const LIVE_SYNC_INTERVAL_MS = 1000;
const INITIAL_LIVE_FIX_TIMEOUT_MS = 4000;
const OFFLINE_POINT_SYNC_BATCH_SIZE = 250;
const OFFLINE_POINT_MIN_DISTANCE_KM = 0.005;
const OFFLINE_SYNC_RETRY_BASE_MS = 5000;
const OFFLINE_SYNC_RETRY_MAX_MS = 60000;

const isRecoverableConnectivityError = (error: string | null | undefined) => {
  const normalizedError = error?.toLowerCase() ?? '';
  return (
    normalizedError.includes('network request failed') ||
    normalizedError.includes('failed to fetch') ||
    normalizedError.includes('network error') ||
    normalizedError.includes('timed out') ||
    normalizedError.includes('timeout')
  );
};

const SCREEN_CONTENT: Record<Screen, { title: string; subtitle: string }> = {
  getStarted: {
    title: '',
    subtitle: '',
  },
  home: {
    title: '',
    subtitle: '',
  },
  startTrip: {
    title: '',
    subtitle: '',
  },
  tripNavigation: {
    title: '',
    subtitle: '',
  },
  trip: {
    title: '',
    subtitle: '',
  },
  violation: {
    title: '',
    subtitle: '',
  },
  profile: {
    title: '',
    subtitle: '',
  },
  login: {
    title: 'Log in',
    subtitle:
      'Enter your driver code and password to securely access\nyour account and manage your services.',
  },
  createPassword: {
    title: 'Create Password',
    subtitle:
      'Enter your driver code first, then create your password\nto activate your account login.',
  },
  permissionPhone: {
    title: '',
    subtitle: '',
  },
  permissionLocation: {
    title: '',
    subtitle: '',
  },
};

export default function App() {
  const PROFILE_STORAGE_KEY = 'triketrack_profile_v2_';
  const DRIVER_SESSION_STORAGE_KEY = 'triketrack_driver_session_v1';
  const TRIP_HISTORY_STORAGE_KEY = 'triketrack_trip_history_v2_';
  const NOTIFICATION_STORAGE_KEY = 'triketrack_notifications_v1_';
  const PERMISSION_ONBOARDING_STORAGE_KEY = 'triketrack_permission_onboarding_v1';
  const ALWAYS_SHOW_PERMISSION_ONBOARDING = true;
  const [fontsLoaded] = useFonts({
    CircularStdMedium500: require('./assets/fonts/circular-std-medium-500.ttf'),
    NissanOpti: require('./assets/fonts/NissanOpti.otf'),
  });
  const [screen, setScreen] = useState<Screen>('getStarted');
  const [startupAuthText, setStartupAuthText] = useState('Connecting to service...');
  const [routeLocationEnabled, setRouteLocationEnabled] = useState(false);
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [showTripActionModal, setShowTripActionModal] = useState(false);
  const [permissionOnboardingState, setPermissionOnboardingState] = useState<PermissionOnboardingState | null>(null);
  const [pendingPhoneAccessStatus, setPendingPhoneAccessStatus] = useState<PermissionOnboardingStatus>('granted');
  const [isPermissionOnboardingSubmitting, setIsPermissionOnboardingSubmitting] = useState(false);
  const isLowBatteryMapMode = useLowBatteryMapMode();
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [tripHistory, setTripHistory] = useState<TripHistoryItem[]>([]);
  const [isTripHistoryRefreshing, setIsTripHistoryRefreshing] = useState(false);
  const [homeStatsFilter, setHomeStatsFilter] = useState<HomeStatsFilter>('TODAY');
  const [violationItems, setViolationItems] = useState<ViolationItem[]>([]);
  const [profileName, setProfileName] = useState('Juan Dela Cruz');
  const [profileDriverCode, setProfileDriverCode] = useState('D-001');
  const [profileContact, setProfileContact] = useState('09276096932');
  const [profilePlateNumber, setProfilePlateNumber] = useState('DXA-1001');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [driverDbId, setDriverDbId] = useState<number | null>(null);
  const [activeTripDbId, setActiveTripDbId] = useState<string | null>(null);
  const [activeLocalTripId, setActiveLocalTripId] = useState<string | null>(null);
  const [restoredTripTrace, setRestoredTripTrace] = useState<{
    rawStartPoint: { latitude: number; longitude: number } | null;
    matchedPath: Array<{ latitude: number; longitude: number }>;
    hasConfirmedMovement: boolean;
    startedAt: string;
  } | null>(null);
  const [offlineQueueStatus, setOfflineQueueStatus] = useState<OfflineQueueStatus>(
    createEmptyOfflineQueueStatus,
  );
  const [forceNewTripNavigationSession, setForceNewTripNavigationSession] = useState(false);
  const [isHomeLocationVisible, setIsHomeLocationVisible] = useState(false);
  const [isWaitingForTripLocation, setIsWaitingForTripLocation] = useState(false);
  const activeTripStartPromiseRef = useRef<Promise<string | null> | null>(null);
  const pendingOpenTripScreenRef = useRef(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [profileQrDetails, setProfileQrDetails] = useState<ProfileQrDetails>(createEmptyProfileQrDetails);
  const [isProfileQrLoading, setIsProfileQrLoading] = useState(false);
  const [profileQrError, setProfileQrError] = useState<string | null>(null);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [tripHistoryHydrated, setTripHistoryHydrated] = useState(false);
  const [tripHistoryHydratedDriverId, setTripHistoryHydratedDriverId] = useState<number | null>(null);
  const tripHistoryRef = useRef<TripHistoryItem[]>([]);
  const tripHistoryHydratedRef = useRef(false);
  const tripHistoryHydratedDriverIdRef = useRef<number | null>(null);
  const tripRouteRepairAttemptedIdsRef = useRef<Set<string>>(new Set());
  const hasRetriedLegacyOrsRouteConversionRef = useRef(false);
  const tripRouteRepairInFlightRef = useRef(false);
  const [notifications, setNotifications] = useState<NotificationCenterItem[]>([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [tripNotificationFocusRequest, setTripNotificationFocusRequest] = useState<{
    tripId: string;
    requestedAt: number;
  } | null>(null);
  const [violationNotificationFocusRequest, setViolationNotificationFocusRequest] = useState<{
    violationId: string;
    requestedAt: number;
  } | null>(null);
  const screenTransitionOpacity = useRef(new Animated.Value(1)).current;
  const screenTransitionTranslateY = useRef(new Animated.Value(0)).current;
  const content = useMemo(() => SCREEN_CONTENT[screen], [screen]);
  const filteredHomeTrips = useMemo(
    () => filterTripHistoryByRange(tripHistory, homeStatsFilter),
    [homeStatsFilter, tripHistory],
  );
  const filteredHomeTotals = useMemo(
    () => computeTripTotals(filteredHomeTrips),
    [filteredHomeTrips],
  );
  const localSnapRoadPath = useMemo(() => {
    const candidatePath =
      restoredTripTrace?.matchedPath && restoredTripTrace.matchedPath.length > 1
        ? restoredTripTrace.matchedPath
        : [];

    return candidatePath.length > 1
      ? smoothDisplayedRoutePath(dedupeSequentialRoutePoints(candidatePath))
      : [];
  }, [restoredTripTrace, tripHistory]);
  const liveTrackingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastLiveSyncPointRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastLiveSyncTimestampRef = useRef<number | null>(null);
  const driverDbIdRef = useRef<number | null>(null);
  const isDriverOnlineRef = useRef(false);
  const previousDriverOnlineRef = useRef(false);
  const hasShownTrackingPermissionErrorRef = useRef(false);
  const isSyncingOfflineTripPointsRef = useRef(false);
  const isNetworkAvailableRef = useRef(false);
  const lastGeofenceViolationFeedbackAtRef = useRef<number | null>(null);
  const lastOfflineStoredPointRef = useRef<{
    localTripId: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const offlineSyncRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineSyncRetryDelayMsRef = useRef(OFFLINE_SYNC_RETRY_BASE_MS);
  const recoveredTripNotificationIdsRef = useRef<Set<string>>(new Set());
  const notifiedViolationIdsRef = useRef<Set<string>>(new Set());
  const violationFeedHydratedRef = useRef(false);
  const workflowRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastWorkflowRefreshAtRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const getTripHistoryStorageKey = (targetDriverId: number) => `${TRIP_HISTORY_STORAGE_KEY}${targetDriverId}`;

  const applyProfileQrDetails = (payload: {
    qr_id?: number | null;
    qr_token?: string | null;
    qr_status?: DriverQrStatus | null;
    qr_issued_at?: string | null;
    report_path?: string | null;
  }) => {
    setProfileQrDetails({
      qrId: typeof payload.qr_id === 'number' ? payload.qr_id : null,
      qrToken: typeof payload.qr_token === 'string' && payload.qr_token.length > 0 ? payload.qr_token : null,
      qrStatus: payload.qr_status ?? null,
      qrIssuedAt: payload.qr_issued_at ?? null,
      reportPath:
        typeof payload.report_path === 'string' && payload.report_path.length > 0
          ? payload.report_path
          : null,
    });
  };

  const applyDriverIdentity = (driver: DriverRecord | DriverProfileRecord) => {
    setProfileName(driver.full_name);
    setProfileDriverCode(driver.driver_id);
    setProfileContact(driver.contact_number);
    setProfilePlateNumber(driver.plate_number);
    setProfileImageUri(driver.avatar_url ?? null);
    setDriverDbId(driver.id);
  };

  const applyCachedDriverProfile = (
    targetDriverId: number,
    profile: {
      name?: string;
      driverCode?: string;
      contact?: string;
      plateNumber?: string;
      imageUri?: string | null;
      qrId?: number | null;
      qrToken?: string | null;
      qrStatus?: DriverQrStatus | null;
      qrIssuedAt?: string | null;
      reportPath?: string | null;
    },
  ) => {
    setProfileName(profile.name || 'Juan Dela Cruz');
    setProfileDriverCode(profile.driverCode || 'D-001');
    setProfileContact(profile.contact || '09276096932');
    setProfilePlateNumber(profile.plateNumber || 'DXA-1001');
    setProfileImageUri(typeof profile.imageUri === 'undefined' ? null : profile.imageUri);
    applyProfileQrDetails({
      qr_id: profile.qrId,
      qr_token: profile.qrToken,
      qr_status: profile.qrStatus,
      qr_issued_at: profile.qrIssuedAt,
      report_path: profile.reportPath,
    });
    setDriverDbId(targetDriverId);
  };

  const readCachedDriverProfile = async (targetDriverId: number) => {
    const raw = await AsyncStorage.getItem(`${PROFILE_STORAGE_KEY}${targetDriverId}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      name?: string;
      driverCode?: string;
      contact?: string;
      plateNumber?: string;
      imageUri?: string | null;
      qrId?: number | null;
      qrToken?: string | null;
      qrStatus?: DriverQrStatus | null;
      qrIssuedAt?: string | null;
      reportPath?: string | null;
    };

    return parsed.driverCode || parsed.name ? parsed : null;
  };

  const refreshDriverProfileFromBackend = async (
    targetDriverId: number,
    options?: { preserveError?: boolean },
  ) => {
    setIsProfileQrLoading(true);
    if (!options?.preserveError) {
      setProfileQrError(null);
    }

    const { profile, error } = await fetchDriverProfile(targetDriverId);

    if (driverDbIdRef.current !== targetDriverId) {
      return;
    }

    if (error) {
      setProfileQrError(error);
      setIsProfileQrLoading(false);
      return;
    }

    if (!profile) {
      setProfileQrDetails(createEmptyProfileQrDetails());
      setProfileQrError('Driver profile could not be found.');
      setIsProfileQrLoading(false);
      return;
    }

    applyDriverIdentity(profile);
    applyProfileQrDetails(profile);
    setProfileQrError(null);
    setIsProfileQrLoading(false);
  };

  const distanceBetweenKm = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
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

  const shouldAttemptTripRouteRepair = (item: TripHistoryItem) => {
    if (item.status === 'ONGOING') {
      return false;
    }

    const routePointCount = item.routePath.length;
    const hasLocalFallbackRoute = item.routeMatchSummary?.provider === 'local-directional';
    const hasLegacyOrsRoute = item.routeMatchSummary?.provider === 'ors-directions';
    const hasOsrmRouteFallback = item.routeMatchSummary?.provider === 'osrm-route';
    const hasRemoteMatchedRoute = item.routeMatchSummary?.provider === 'osrm-match';
    const expectedMatchedPointCount = Math.max(
      routePointCount,
      item.matchedPointCount,
      item.routeMatchSummary?.matchedPointCount ?? 0,
    );
    const sparseMatchedPath = routePointCount <= 3 || item.matchedPointCount <= 3;
    const rawHasMoreDetail = item.rawTelemetry.length >= Math.max(4, routePointCount + 2);
    const matchedDistanceKm = Math.max(0, item.totalDistanceMatchedMeters / 1000);
    const rawDistanceKm = Math.max(0, item.totalDistanceRawMeters / 1000);
    const matchedLooksTooShort =
      rawDistanceKm > 0.02 &&
      matchedDistanceKm > 0 &&
      matchedDistanceKm < rawDistanceKm * 0.72;
    const hasEndConnectorHint = item.dashedEndConnector.length === 2 && routePointCount <= 4;
    const shortTripWithLowDetail =
      matchedDistanceKm <= SHORT_TRIP_ROUTE_REPAIR_MAX_DISTANCE_KM &&
      routePointCount <= SHORT_TRIP_ROUTE_REPAIR_MAX_POINTS;
    const overSmoothedRemoteMatch =
      hasRemoteMatchedRoute &&
      expectedMatchedPointCount >= OVER_SMOOTHED_REMOTE_ROUTE_MIN_EXPECTED_POINTS &&
      (routePointCount + 3 <= expectedMatchedPointCount ||
        (matchedDistanceKm >= 0.12 && routePointCount <= SHORT_TRIP_ROUTE_REPAIR_MAX_POINTS));

    if (hasRemoteMatchedRoute && !overSmoothedRemoteMatch && !rawHasMoreDetail) {
      return false;
    }

    return (
      (hasLocalFallbackRoute && item.rawTelemetry.length > 1) ||
      (hasLegacyOrsRoute && item.rawTelemetry.length > 1) ||
      (hasOsrmRouteFallback && item.rawTelemetry.length > 1) ||
      overSmoothedRemoteMatch ||
      sparseMatchedPath ||
      hasEndConnectorHint ||
      rawHasMoreDetail ||
      matchedLooksTooShort ||
      shortTripWithLowDetail
    );
  };

  const buildTripEndpointSeedPath = (item: TripHistoryItem) =>
    dedupeSequentialRoutePoints(
      [
        item.startLocationMatched ?? item.startLocationRaw ?? item.rawStartPoint ?? null,
        item.endLocationMatched ?? item.endLocationRaw ?? null,
      ].filter(
        (
          point,
        ): point is {
          latitude: number;
          longitude: number;
        } => Boolean(point),
      ),
    );

  const shouldPreferFallbackRoutePath = (
    fallbackTrip: TripHistoryItem | undefined,
    serverRoutePath: Array<{ latitude: number; longitude: number }>,
  ) => {
    if (!fallbackTrip || fallbackTrip.routePath.length < 2) {
      return false;
    }

    if (serverRoutePath.length < 2) {
      return true;
    }

    const fallbackStart = fallbackTrip.routePath[0];
    const fallbackEnd = fallbackTrip.routePath.at(-1);
    const serverStart = serverRoutePath[0];
    const serverEnd = serverRoutePath.at(-1);
    if (!fallbackStart || !fallbackEnd || !serverStart || !serverEnd) {
      return false;
    }

    const endpointsAlign =
      distanceBetweenKm(fallbackStart, serverStart) <= TRIP_ROUTE_ENDPOINT_MATCH_MAX_DISTANCE_KM &&
      distanceBetweenKm(fallbackEnd, serverEnd) <= TRIP_ROUTE_ENDPOINT_MATCH_MAX_DISTANCE_KM;

    if (!endpointsAlign) {
      return false;
    }

    return (
      fallbackTrip.routePath.length > serverRoutePath.length ||
      fallbackTrip.matchedPointCount > serverRoutePath.length
    );
  };

  const hasMaterialRouteRepair = (
    currentPath: Array<{ latitude: number; longitude: number }>,
    repairedPath: Array<{ latitude: number; longitude: number }>,
  ) => {
    if (repairedPath.length < 2) {
      return false;
    }

    if (currentPath.length < 2) {
      return true;
    }

    const pointCountGain = repairedPath.length - currentPath.length;
    const currentDistanceKm = polylineDistanceKm(currentPath);
    const repairedDistanceKm = polylineDistanceKm(repairedPath);
    const startShiftKm = distanceBetweenKm(currentPath[0], repairedPath[0]);
    const endShiftKm = distanceBetweenKm(currentPath.at(-1)!, repairedPath.at(-1)!);

    return (
      pointCountGain >= 2 ||
      Math.abs(repairedDistanceKm - currentDistanceKm) > Math.max(0.015, currentDistanceKm * 0.25) ||
      startShiftKm > 0.01 ||
      endShiftKm > 0.01
    );
  };

  const repairTripHistoryItemRoute = async (
    item: TripHistoryItem,
    targetDriverId: number | null,
  ) => {
    const telemetryPath = dedupeSequentialRoutePoints(
      item.rawTelemetry.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );

    let candidatePath =
      item.routePath.length > 1
        ? item.routePath
        : telemetryPath;
    const endpointSeedPath = buildTripEndpointSeedPath(item);

    let reconstructionRouteMatchSummary: TripRouteMatchSummary | null = null;

    if (telemetryPath.length > 1) {
      const reconstruction = await reconstructCompletedTripPath(item.rawTelemetry);
      reconstructionRouteMatchSummary = reconstruction.routeMatchMetadata ?? null;
      const reconstructedPath = normalizeSavedRoutePath(
        reconstruction.reconstructedPath,
        telemetryPath,
        {
          preserveDetailedGeometry: shouldPreserveDetailedRouteGeometry(
            reconstruction.routeMatchMetadata,
          ),
        },
      );
      if (reconstructedPath.length > 1) {
        candidatePath = reconstructedPath;
      } else if (telemetryPath.length > 1) {
        candidatePath = telemetryPath;
      }
    }

    const isShortLowDetailRoute =
      Math.max(0, item.totalDistanceMatchedMeters / 1000) <= SHORT_TRIP_ROUTE_REPAIR_MAX_DISTANCE_KM &&
      item.routePath.length <= SHORT_TRIP_ROUTE_REPAIR_MAX_POINTS;
    if (
      endpointSeedPath.length > 1 &&
      (!item.rawTelemetry.length || isShortLowDetailRoute || candidatePath.length <= 3)
    ) {
      candidatePath = endpointSeedPath;
    }

    const preferredRepairRouteMatchSummary = pickPreferredRouteMatchSummary(
      reconstructionRouteMatchSummary,
      item.routeMatchSummary,
    );
    const trustCandidateRepairGeometry =
      candidatePath.length > 1 &&
      (shouldPreserveDetailedRouteGeometry(preferredRepairRouteMatchSummary) ||
        telemetryPath.length > 1);
    const fallbackPath =
      telemetryPath.length > 1
        ? telemetryPath
        : endpointSeedPath.length > 1
          ? endpointSeedPath
          : item.routePath;
    const roadAlignmentResult = await buildRoadAlignedRoutePathDetailed({
      candidatePath,
      fallbackPath,
      preserveDetailedGeometry: shouldPreserveDetailedRouteGeometry(
        preferredRepairRouteMatchSummary,
      ),
      trustCandidateGeometry: trustCandidateRepairGeometry,
    });
    const repairedRoutePath = roadAlignmentResult.path ?? fallbackPath;
    const repairedEndpointState = await resolveFinalizedTripEndpointState({
      routePath: repairedRoutePath,
      rawEndPoint: item.endLocationRaw ?? item.rawTelemetry.at(-1) ?? null,
    });
    const repairedStartEndpointState = await resolveFinalizedTripStartEndpointState({
      routePath: repairedRoutePath,
      rawStartPoint: item.startLocationRaw ?? item.rawStartPoint,
    });

    const repairedMatchedStartPoint =
      repairedStartEndpointState.matchedStartPoint ?? repairedRoutePath[0] ?? item.startLocationMatched;
    const repairedMatchedEndPoint =
      repairedEndpointState.matchedEndPoint ?? repairedRoutePath.at(-1) ?? item.endLocationMatched;
    const repairedLocationLabels = await resolveTripDisplayLocationLabels({
      matchedStartPoint: repairedMatchedStartPoint,
      matchedEndPoint: repairedMatchedEndPoint,
      routePath: repairedRoutePath,
      filteredStartPoint: item.startLocationRaw ?? item.rawStartPoint,
      filteredEndPoint: item.endLocationRaw ?? item.rawTelemetry.at(-1) ?? null,
    });

    const repairedRouteMatchSummary: TripRouteMatchSummary | null =
      pickPreferredRouteMatchSummary(
        roadAlignmentResult.metadata ?? null,
        preferredRepairRouteMatchSummary,
      )
        ? {
            ...pickPreferredRouteMatchSummary(
              roadAlignmentResult.metadata ?? null,
              preferredRepairRouteMatchSummary,
            )!,
            matchedPointCount: repairedRoutePath.length,
            distanceMeters: polylineDistanceKm(repairedRoutePath) * 1000,
          }
        : null;
    const replacedLegacyRouteProvider =
      (item.routeMatchSummary?.provider === 'ors-directions' ||
        item.routeMatchSummary?.provider === 'osrm-route') &&
      repairedRouteMatchSummary?.provider !== item.routeMatchSummary.provider &&
      repairedRouteMatchSummary !== null;

    if (!hasMaterialRouteRepair(item.routePath, repairedRoutePath) && !replacedLegacyRouteProvider) {
      return null;
    }

    const repairedItem = normalizeTripHistoryItem({
      ...item,
      routePath: repairedRoutePath,
      startLocationMatched: repairedMatchedStartPoint,
      endLocationMatched: repairedMatchedEndPoint,
      startDisplayName: repairedLocationLabels.startDisplayName,
      endDisplayName: repairedLocationLabels.endDisplayName,
      startCoordinate: repairedLocationLabels.startCoordinate,
      endCoordinate: repairedLocationLabels.endCoordinate,
      matchedPointCount: repairedRoutePath.length,
      totalDistanceMatchedMeters: polylineDistanceKm(repairedRoutePath) * 1000,
      distance: undefined,
      routeTraceGeoJson: undefined,
      dashedStartConnector:
        repairedStartEndpointState.dashedStartConnector.length > 0
          ? repairedStartEndpointState.dashedStartConnector
          : undefined,
      dashedEndConnector:
        repairedEndpointState.dashedEndConnector.length > 0
          ? repairedEndpointState.dashedEndConnector
          : undefined,
      routeMatchSummary: repairedRouteMatchSummary,
    });

    if (targetDriverId !== null && item.syncStatus === 'SYNCED') {
      const serverTripId = parseServerTripIdFromHistoryId(item.id);
      if (serverTripId !== null) {
        const repairResult = await replaceTripRouteFallback({
          tripId: serverTripId,
          driverId: targetDriverId,
          routePoints: repairedRoutePath,
          startedAt: item.startedAt,
          localTripId: `repair-trip-${serverTripId}`,
          routeMatchSummary: repairedRouteMatchSummary,
          rawEndPoint: item.endLocationRaw ?? null,
          matchedEndPoint: repairedMatchedEndPoint,
          startDisplayName: repairedLocationLabels.startDisplayName,
          startCoordinate: repairedLocationLabels.startCoordinate,
          endDisplayName: repairedLocationLabels.endDisplayName,
          endCoordinate: repairedLocationLabels.endCoordinate,
          dashedEndConnector: repairedEndpointState.dashedEndConnector,
          endpointSelectionSummary: repairedEndpointState.endpointSelectionSummary,
        });

        if (repairResult.error) {
          console.warn('[TripRouteRepair] Failed to persist repaired fallback route.', {
            tripId: item.id,
            error: repairResult.error,
          });
        }
      }
    }

    return repairedItem;
  };

  const mapTripRecordToHistoryItem = (
    trip: {
      id: string | number;
      trip_date: string;
      started_at?: string | null;
      ended_at?: string | null;
      duration_seconds?: number | null;
      distance_km?: number | null;
      fare?: number | null;
      status: string;
      route_points?: Array<{ latitude: number; longitude: number }>;
      raw_start_point?: { latitude: number; longitude: number } | null;
      route_trace_geojson?: { type: 'LineString'; coordinates: number[][] } | null;
      trip_metrics?: Record<string, unknown> | null;
      gps_quality_summary?: Record<string, unknown> | null;
      raw_gps_point_count?: number | null;
      matched_point_count?: number | null;
      start_location_raw?: { latitude: number; longitude: number } | null;
      start_location_matched?: { latitude: number; longitude: number } | null;
      end_location_raw?: { latitude: number; longitude: number } | null;
      end_location_matched?: { latitude: number; longitude: number } | null;
      start_display_name?: string | null;
      end_display_name?: string | null;
      start_coordinate?: { latitude: number; longitude: number } | null;
      end_coordinate?: { latitude: number; longitude: number } | null;
      dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
      dashed_end_connector?: Array<{ latitude: number; longitude: number }> | null;
      sync_status?: string | null;
      raw_telemetry?: RawTripTelemetryPoint[];
    },
    fallbackTrip?: TripHistoryItem,
  ): TripHistoryItem => {
    const idSuffix = String(trip.id).split('-')[0]?.toUpperCase() ?? String(trip.id);
    const fallbackRoutePath = fallbackTrip?.routePath ?? [];
    const serverRouteMatchSummary =
      ((trip.trip_metrics as { routeMatchSummary?: TripRouteMatchSummary | null } | null)
        ?.routeMatchSummary) ?? null;
    const preserveDetailedServerRoute = shouldPreserveDetailedRouteGeometry(
      serverRouteMatchSummary,
    );
    const preserveDetailedFallbackRoute = shouldPreserveDetailedRouteGeometry(
      fallbackTrip?.routeMatchSummary,
    );
    const serverRoutePath = normalizeSavedRoutePath(trip.route_points ?? [], [], {
      preserveDetailedGeometry: preserveDetailedServerRoute,
    });
    const serverGeoJsonRoutePath = normalizeSavedRoutePath(
      normalizeGeoJsonRoutePath(trip.route_trace_geojson ?? null),
      serverRoutePath,
      {
        preserveDetailedGeometry: preserveDetailedServerRoute,
      },
    );
    const shouldTrustAuthoritativeServerRoute =
      trip.sync_status !== 'SYNC_PENDING' &&
      serverGeoJsonRoutePath.length > 1 &&
      preserveDetailedServerRoute;
    const preferredFallbackRoutePath = normalizeSavedRoutePath(
      fallbackRoutePath,
      serverRoutePath,
      {
        preserveDetailedGeometry: preserveDetailedFallbackRoute,
      },
    );
    const preferredServerRoutePath = normalizeSavedRoutePath(
      serverRoutePath,
      fallbackRoutePath,
      {
        preserveDetailedGeometry: preserveDetailedServerRoute,
      },
    );
    const routePath =
      shouldTrustAuthoritativeServerRoute
        ? serverGeoJsonRoutePath
        : shouldPreferFallbackRoutePath(fallbackTrip, serverRoutePath)
          ? preferredFallbackRoutePath
          : preferredServerRoutePath;
    return buildTripHistoryItem({
      id: `TRIP-${idSuffix}`,
      tripDate: trip.trip_date,
      fare: Number(trip.fare ?? fallbackTrip?.fareAmount ?? 0),
      durationSeconds: Number(trip.duration_seconds ?? 0),
      startedAt: trip.started_at ?? fallbackTrip?.startedAt ?? null,
      endedAt: trip.ended_at ?? fallbackTrip?.endedAt ?? null,
      distanceKm:
        typeof trip.distance_km === 'number' && Number.isFinite(trip.distance_km)
          ? trip.distance_km
          : typeof fallbackTrip?.totalDistanceMatchedMeters === 'number'
            ? fallbackTrip.totalDistanceMatchedMeters / 1000
            : null,
      matchedRoutePath: routePath,
      rawTelemetry: trip.raw_telemetry && trip.raw_telemetry.length > 0
        ? trip.raw_telemetry
        : fallbackTrip?.rawTelemetry ?? [],
      rawStartPoint:
        trip.start_location_raw ?? trip.raw_start_point ?? fallbackTrip?.rawStartPoint ?? null,
      rawEndPoint: trip.end_location_raw ?? fallbackTrip?.endLocationRaw ?? routePath.at(-1) ?? null,
      matchedStartPoint:
        trip.start_location_matched ?? fallbackTrip?.startLocationMatched ?? routePath[0] ?? null,
      matchedEndPoint:
        trip.end_location_matched ?? fallbackTrip?.endLocationMatched ?? routePath.at(-1) ?? null,
      startDisplayName:
        trip.start_display_name ?? fallbackTrip?.startDisplayName ?? null,
      endDisplayName:
        trip.end_display_name ?? fallbackTrip?.endDisplayName ?? null,
      startCoordinate:
        trip.start_coordinate ?? fallbackTrip?.startCoordinate ?? null,
      endCoordinate:
        trip.end_coordinate ?? fallbackTrip?.endCoordinate ?? null,
      dashedStartConnector:
        trip.dashed_start_connector ?? fallbackTrip?.dashedStartConnector ?? [],
      dashedEndConnector:
        trip.dashed_end_connector ??
        (shouldTrustAuthoritativeServerRoute ? [] : fallbackTrip?.dashedEndConnector ?? []),
      status: trip.status === 'ONGOING' ? 'ONGOING' : 'COMPLETED',
      syncStatus: trip.sync_status === 'SYNC_PENDING' ? 'SYNC_PENDING' : 'SYNCED',
      tripState: trip.status === 'ONGOING' ? 'ON_ROAD' : 'SYNCED',
      driverName: profileName,
      driverCode: profileDriverCode,
      vehiclePlateNumber: profilePlateNumber,
      routeName: fallbackTrip?.routeName ?? null,
      gpsQualitySummary:
        (trip.gps_quality_summary as TripGpsQualitySummary | null | undefined) ??
        fallbackTrip?.gpsQualitySummary ??
        null,
      routeTraceGeoJson: trip.route_trace_geojson ?? fallbackTrip?.routeTraceGeoJson ?? null,
      rawGpsPointCount:
        typeof trip.raw_gps_point_count === 'number'
          ? trip.raw_gps_point_count
          : fallbackTrip?.rawGpsPointCount,
      matchedPointCount:
        typeof trip.matched_point_count === 'number'
          ? trip.matched_point_count
          : fallbackTrip?.matchedPointCount,
      routeMatchSummary: pickPreferredRouteMatchSummary(
        serverRouteMatchSummary,
        fallbackTrip?.routeMatchSummary ?? null,
      ),
    });
  };

  const buildTripPointDedupKey = ({
    tripId,
    recordedAt,
    latitude,
    longitude,
  }: {
    tripId: number;
    recordedAt: string;
    latitude: number;
    longitude: number;
  }) => `trip-point:${tripId}:${recordedAt}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`;

  useEffect(() => {
    tripHistoryRef.current = tripHistory;
  }, [tripHistory]);

  useEffect(() => {
    tripHistoryHydratedRef.current = tripHistoryHydrated;
  }, [tripHistoryHydrated]);

  useEffect(() => {
    if (!tripHistoryHydrated) {
      return;
    }

    const nextTripHistory = tripHistoryRef.current.filter((item) => !isLegacyDummyTrip45(item));
    if (nextTripHistory.length === tripHistoryRef.current.length) {
      return;
    }

    setTripHistory(nextTripHistory);
    const totals = computeTripTotals(nextTripHistory);
    setTotalEarnings(totals.earnings);
    setTotalTrips(totals.trips);
    setTotalDistanceKm(totals.distance);
    setTotalMinutes(totals.minutes);
  }, [tripHistoryHydrated, tripHistory]);

  useEffect(() => {
    driverDbIdRef.current = driverDbId;
  }, [driverDbId]);

  useEffect(() => {
    tripRouteRepairAttemptedIdsRef.current = new Set();
    tripRouteRepairInFlightRef.current = false;
    notifiedViolationIdsRef.current = new Set();
    violationFeedHydratedRef.current = false;
  }, [driverDbId]);

  useEffect(() => {
    isDriverOnlineRef.current = isDriverOnline;
  }, [isDriverOnline]);

  useEffect(() => {
    const wasDriverOnline = previousDriverOnlineRef.current;
    previousDriverOnlineRef.current = isDriverOnline;

    if (wasDriverOnline && !isDriverOnline && driverDbId !== null) {
      void setDriverPresenceOffline(driverDbId);
    }
  }, [driverDbId, isDriverOnline]);

  const pushNotification = ({ category, title, message, icon, target, dedupeKey }: NotificationDraft) => {
    const createdAt = new Date().toISOString();
    const nextNotification: NotificationCenterItem = {
      id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      title,
      message,
      icon,
      target,
      dedupeKey,
      createdAt,
      read: false,
    };

    if (!isRelevantNotification(nextNotification)) {
      return;
    }

    const nextDedupeKey = getNotificationDedupeKey(nextNotification);
    const nowMs = Date.now();
    setNotifications((prev) => {
      const recentDuplicate = prev.some((item) => {
        if (getNotificationDedupeKey(item) !== nextDedupeKey) {
          return false;
        }

        const createdAtMs = parseNotificationDateMs(item.createdAt);
        return createdAtMs !== null && nowMs - createdAtMs <= NOTIFICATION_DUPLICATE_WINDOW_MS;
      });
      if (recentDuplicate) {
        return normalizeNotificationItems(prev, nowMs);
      }

      return normalizeNotificationItems([nextNotification, ...prev], nowMs);
    });
  };

  const refreshTripHistoryFromBackend = async (targetDriverId: number) => {
    const { trips, error } = await listTripsWithRoutePoints(targetDriverId, 250);
    if (error) {
      return null;
    }

    const previousRoutesById = new Map(
      tripHistoryRef.current.map((item) => [item.id, item]),
    );
    const mapped: TripHistoryItem[] = trips.map((trip) =>
      mapTripRecordToHistoryItem(
        trip,
        previousRoutesById.get(
          `TRIP-${String(trip.id).split('-')[0]?.toUpperCase() ?? String(trip.id)}`,
        ),
      ),
    );

    const mergedHistory = reconcileSyncedTripHistoryItems(tripHistoryRef.current, mapped);
    tripHistoryRef.current = mergedHistory;
    setTripHistory(mergedHistory);
    const totals = computeTripTotals(mergedHistory);
    setTotalEarnings(totals.earnings);
    setTotalTrips(totals.trips);
    setTotalDistanceKm(totals.distance);
    setTotalMinutes(totals.minutes);
    return mergedHistory;
  };

  const repairTripHistoryRoutes = async ({
    items = tripHistoryRef.current,
    targetDriverId = driverDbId,
    maxCount = MAX_TRIP_ROUTE_REPAIRS_PER_PASS,
  }: {
    items?: TripHistoryItem[];
    targetDriverId?: number | null;
    maxCount?: number;
  } = {}) => {
    if (
      !tripHistoryHydratedRef.current ||
      items.length === 0 ||
      tripRouteRepairInFlightRef.current ||
      !isNetworkAvailableRef.current
    ) {
      return 0;
    }

    const candidates = items
      .filter(
        (item) =>
          shouldAttemptTripRouteRepair(item) &&
          !tripRouteRepairAttemptedIdsRef.current.has(item.id),
      )
      .slice(0, maxCount);

    if (candidates.length === 0) {
      return 0;
    }

    for (const item of candidates) {
      tripRouteRepairAttemptedIdsRef.current.add(item.id);
    }

    tripRouteRepairInFlightRef.current = true;
    try {
      const repairedItems: TripHistoryItem[] = [];

      for (const item of candidates) {
        const repairedItem = await repairTripHistoryItemRoute(item, targetDriverId ?? null);
        if (repairedItem) {
          repairedItems.push(repairedItem);
        }
      }

      if (repairedItems.length === 0) {
        return 0;
      }

      setTripHistory((prev) => {
        const merged = upsertTripHistoryItems(prev, repairedItems);
        const totals = computeTripTotals(merged);
        setTotalEarnings(totals.earnings);
        setTotalTrips(totals.trips);
        setTotalDistanceKm(totals.distance);
        setTotalMinutes(totals.minutes);
        return merged;
      });

      return repairedItems.length;
    } finally {
      tripRouteRepairInFlightRef.current = false;
    }
  };

  const promoteOfflineHistoryItemToServerTrip = ({
    sourceHistoryId,
    localTripId,
    serverTripId,
    routePath,
    routeMatchSummary,
    startDisplayName,
    endDisplayName,
    startCoordinate,
    endCoordinate,
  }: {
    sourceHistoryId?: string | null;
    localTripId: string;
    serverTripId: number;
    routePath?: Array<{ latitude: number; longitude: number }>;
    routeMatchSummary?: TripRouteMatchSummary | null;
    startDisplayName?: string | null;
    endDisplayName?: string | null;
    startCoordinate?: { latitude: number; longitude: number } | null;
    endCoordinate?: { latitude: number; longitude: number } | null;
  }) => {
    const localHistoryId = `TRIP-${localTripId}`;
    const serverHistoryId = `TRIP-${serverTripId}`;

    setTripHistory((prev) => {
      const sourceItem =
        (sourceHistoryId ? prev.find((item) => item.id === sourceHistoryId) : null) ??
        prev.find((item) => item.id === localHistoryId) ??
        prev.find((item) => item.id === serverHistoryId && item.syncStatus === 'SYNC_PENDING') ??
        null;
      if (!sourceItem) {
        return prev;
      }

      const resolvedRoutePath = routePath ?? sourceItem.routePath;
      const promotedItem = normalizeTripHistoryItem({
        ...sourceItem,
        id: serverHistoryId,
        routePath: resolvedRoutePath,
        matchedPointCount: Math.max(resolvedRoutePath.length, sourceItem.matchedPointCount),
        totalDistanceMatchedMeters:
          resolvedRoutePath.length > 0
            ? polylineDistanceKm(resolvedRoutePath) * 1000
            : sourceItem.totalDistanceMatchedMeters,
        routeMatchSummary: pickPreferredRouteMatchSummary(
          routeMatchSummary ?? null,
          sourceItem.routeMatchSummary,
        ),
        startDisplayName: startDisplayName ?? sourceItem.startDisplayName,
        endDisplayName: endDisplayName ?? sourceItem.endDisplayName,
        startCoordinate: startCoordinate ?? sourceItem.startCoordinate,
        endCoordinate: endCoordinate ?? sourceItem.endCoordinate,
        syncStatus: 'SYNCED',
        tripState: 'SYNCED',
      });

      const nextItems = prev.filter((item) => {
        if (item.syncStatus !== 'SYNC_PENDING') {
          return true;
        }

        return (
          item.id !== localHistoryId &&
          item.id !== serverHistoryId &&
          item.id !== sourceHistoryId
        );
      });
      const merged = upsertTripHistoryItems(nextItems, [promotedItem]);
      tripHistoryRef.current = merged;
      const totals = computeTripTotals(merged);
      setTotalEarnings(totals.earnings);
      setTotalTrips(totals.trips);
      setTotalDistanceKm(totals.distance);
      setTotalMinutes(totals.minutes);
      return merged;
    });
  };

  useEffect(() => {
    if (!tripHistoryHydrated || tripHistory.length === 0) {
      return;
    }

    const legacyFallbackRouteTripIds = tripHistory
      .filter(
        (item) =>
          item.routeMatchSummary?.provider === 'ors-directions' ||
          item.routeMatchSummary?.provider === 'osrm-route',
      )
      .map((item) => item.id);
    if (legacyFallbackRouteTripIds.length > 0 && !hasRetriedLegacyOrsRouteConversionRef.current) {
      hasRetriedLegacyOrsRouteConversionRef.current = true;
      for (const tripId of legacyFallbackRouteTripIds) {
        tripRouteRepairAttemptedIdsRef.current.delete(tripId);
      }
    } else if (legacyFallbackRouteTripIds.length === 0) {
      hasRetriedLegacyOrsRouteConversionRef.current = false;
    }

    void (async () => {
      await repairTripHistoryRoutes({
        items: tripHistory,
        targetDriverId: driverDbId,
      });
    })();
  }, [driverDbId, tripHistory, tripHistoryHydrated]);

  const refreshViolationItems = async (
    targetDriverId: number,
    options?: { notifyNew?: boolean },
  ) => {
    const { violations, error } = await listViolations(targetDriverId);
    if (error) {
      return false;
    }

    if (driverDbIdRef.current !== targetDriverId) {
      return false;
    }

    const mappedViolations = violations.map(mapViolationRecordToItem);
    if (!violationFeedHydratedRef.current) {
      notifiedViolationIdsRef.current = new Set(mappedViolations.map((violation) => violation.id));
      violationFeedHydratedRef.current = true;
    } else if (options?.notifyNew !== false) {
      const unseenViolations = mappedViolations.filter(
        (violation) => !notifiedViolationIdsRef.current.has(violation.id),
      );

      for (const violation of [...unseenViolations].reverse()) {
        notifiedViolationIdsRef.current.add(violation.id);
        pushNotification({
          category: 'violation',
          title: violation.title,
          message: violation.details !== '--' ? violation.details : getViolationRealtimeMessage(violation),
          icon: 'alert-triangle',
        });
      }
    }

    setViolationItems(mappedViolations);
    return true;
  };

  const syncDriverPresenceLocation = async (
    location: Location.LocationObject | (Location.LocationObjectCoords & { timestamp?: number }),
    options?: { maxAccuracyMeters?: number },
  ) => {
    if (driverDbIdRef.current === null || !profileDriverCode) {
      return null;
    }

    const coords = 'coords' in location ? location.coords : location;
    const timestamp =
      'timestamp' in location && typeof location.timestamp === 'number'
        ? location.timestamp
        : Date.now();
    const accuracy =
      typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)
        ? coords.accuracy
        : null;
    const maxAccuracyMeters = options?.maxAccuracyMeters ?? MAX_LIVE_SYNC_ACCURACY_METERS;

    if (accuracy !== null && accuracy > maxAccuracyMeters) {
      return null;
    }

    const nextPoint = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
    const previousPoint = lastLiveSyncPointRef.current;
    const previousTimestamp = lastLiveSyncTimestampRef.current;
    if (previousPoint && previousTimestamp !== null) {
      const jumpKm = distanceBetweenKm(previousPoint, nextPoint);
      const elapsedSec = Math.max((timestamp - previousTimestamp) / 1000, 0);
      if (jumpKm > MAX_LIVE_SYNC_JUMP_KM && elapsedSec <= 3) {
        return null;
      }
    }

    const { error } = await upsertDriverLocation({
      driverId: driverDbIdRef.current,
      driverCode: profileDriverCode,
      latitude: nextPoint.latitude,
      longitude: nextPoint.longitude,
      speed: coords.speed ?? null,
      heading: coords.heading ?? null,
      accuracy,
      recordedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
    });

    if (!error) {
      lastLiveSyncPointRef.current = nextPoint;
      lastLiveSyncTimestampRef.current = timestamp;
    }

    return error;
  };

  const setDriverPresenceOffline = async (driverId: number | null) => {
    if (driverId === null) {
      return;
    }

    const { error } = await setDriverLocationOffline(driverId);
    if (error) {
      console.warn('Driver offline sync failed:', error);
    }
  };

  const markNotificationRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              read: true,
            }
          : item,
      ),
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.read
          ? item
          : {
              ...item,
              read: true,
            },
      ),
    );
  };

  const resolveNotificationTarget = (notification: NotificationCenterItem): NotificationCenterTarget => {
    if (notification.target) {
      return notification.target;
    }

    if (notification.category === 'account' || notification.category === 'profile') {
      return { screen: 'profile' };
    }

    if (notification.category === 'violation' || notification.category === 'appeal') {
      return { screen: 'violation' };
    }

    const normalizedTitle = notification.title.toLowerCase();
    if (
      notification.category === 'trip' &&
      (normalizedTitle.includes('started') || normalizedTitle.includes('recovered')) &&
      activeLocalTripId
    ) {
      return { screen: 'tripNavigation' };
    }

    if (notification.category === 'trip') {
      return { screen: 'trip' };
    }

    return { screen: 'home' };
  };

  const handleOpenNotification = (notification: NotificationCenterItem) => {
    markNotificationRead(notification.id);

    const target = resolveNotificationTarget(notification);
    if (target.screen === 'profile') {
      setScreen('profile');
      return;
    }

    if (target.screen === 'violation') {
      if (target.itemId) {
        setViolationNotificationFocusRequest({
          violationId: target.itemId,
          requestedAt: Date.now(),
        });
      }
      setScreen('violation');
      return;
    }

    if (target.screen === 'trip') {
      if (target.itemId) {
        setTripNotificationFocusRequest({
          tripId: target.itemId,
          requestedAt: Date.now(),
        });
      }
      setScreen('trip');
      return;
    }

    if (target.screen === 'tripNavigation') {
      if (activeLocalTripId) {
        setForceNewTripNavigationSession(false);
        setScreen('tripNavigation');
        return;
      }
      setScreen('trip');
      return;
    }

    if (target.screen === 'startTrip') {
      if (activeLocalTripId) {
        setForceNewTripNavigationSession(false);
        setScreen('tripNavigation');
        return;
      }
      setScreen(isDriverOnline ? 'startTrip' : 'home');
      return;
    }

    setScreen('home');
  };

  const unreadNotificationCount = notifications.reduce(
    (count, item) => count + (item.read ? 0 : 1),
    0,
  );

  const loadPermissionOnboardingState = async () => {
    if (ALWAYS_SHOW_PERMISSION_ONBOARDING) {
      return null;
    }
    try {
      const raw = await AsyncStorage.getItem(PERMISSION_ONBOARDING_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<PermissionOnboardingState>;
      if (
        parsed.phoneAccess !== 'granted' &&
        parsed.phoneAccess !== 'skipped'
      ) {
        return null;
      }
      if (
        parsed.locationAccess !== 'granted' &&
        parsed.locationAccess !== 'skipped'
      ) {
        return null;
      }
      if (typeof parsed.completedAt !== 'string') {
        return null;
      }

      return {
        phoneAccess: parsed.phoneAccess,
        locationAccess: parsed.locationAccess,
        completedAt: parsed.completedAt,
      } satisfies PermissionOnboardingState;
    } catch {
      return null;
    }
  };

  const refreshLocationAvailability = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setRouteLocationEnabled(false);
        return false;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      setRouteLocationEnabled(servicesEnabled);
      return servicesEnabled;
    } catch {
      setRouteLocationEnabled(false);
      return false;
    }
  };

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }

    let cancelled = false;
    const startupStartedAt = Date.now();

    const waitForMinimumStartupDisplay = async () => {
      const remainingMs = STARTUP_AUTH_MIN_DISPLAY_MS - (Date.now() - startupStartedAt);
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
      }
    };

    const navigateAfterStartup = async (nextScreen: 'home' | 'login') => {
      await waitForMinimumStartupDisplay();
      if (!cancelled) {
        setScreen(nextScreen);
      }
    };

    const openLogin = async () => {
      await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY).catch(() => undefined);
      await navigateAfterStartup('login');
    };

    const restoreStoredDriverSession = async () => {
      setStartupAuthText('Connecting to service...');

      try {
        const rawSession = await AsyncStorage.getItem(DRIVER_SESSION_STORAGE_KEY);
        if (!rawSession) {
          await openLogin();
          return;
        }

        const parsedSession = JSON.parse(rawSession) as {
          driverDbId?: number;
          driverId?: number;
        };
        const sessionDriverId =
          typeof parsedSession.driverDbId === 'number'
            ? parsedSession.driverDbId
            : typeof parsedSession.driverId === 'number'
              ? parsedSession.driverId
              : null;

        if (sessionDriverId === null || !Number.isFinite(sessionDriverId)) {
          await openLogin();
          return;
        }

        setStartupAuthText('Authenticating...');
        const cachedProfile = await readCachedDriverProfile(sessionDriverId).catch(() => null);
        const { profile, error } = await fetchDriverProfile(sessionDriverId);
        if (cancelled) {
          return;
        }

        if (profile) {
          applyDriverIdentity(profile);
          applyProfileQrDetails(profile);
          setProfileQrError(null);
        } else if (cachedProfile && error) {
          applyCachedDriverProfile(sessionDriverId, cachedProfile);
          setProfileQrError(null);
        } else {
          await openLogin();
          return;
        }

        setPendingPhoneAccessStatus('granted');
        const savedPermissionOnboarding = ALWAYS_SHOW_PERMISSION_ONBOARDING
          ? null
          : await loadPermissionOnboardingState();
        if (cancelled) {
          return;
        }
        setPermissionOnboardingState(savedPermissionOnboarding);
        await refreshLocationAvailability();
        await navigateAfterStartup('home');
      } catch {
        await openLogin();
      }
    };

    void restoreStoredDriverSession();

    return () => {
      cancelled = true;
    };
  }, [fontsLoaded]);

  const requestLocationAccessFromOnboarding = async () => {
    try {
      let permissionStatus = (await Location.getForegroundPermissionsAsync()).status;
      if (permissionStatus !== 'granted') {
        permissionStatus = (await Location.requestForegroundPermissionsAsync()).status;
      }

      if (permissionStatus !== 'granted') {
        setRouteLocationEnabled(false);
        return { granted: false, servicesEnabled: false };
      }

      let servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled && Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          // User may dismiss the system dialog and continue onboarding.
        }
        servicesEnabled = await Location.hasServicesEnabledAsync();
      }

      setRouteLocationEnabled(servicesEnabled);
      return { granted: true, servicesEnabled };
    } catch {
      setRouteLocationEnabled(false);
      return { granted: false, servicesEnabled: false };
    }
  };

  const completePermissionOnboarding = async (
    phoneAccess: PermissionOnboardingStatus,
    locationAccess: PermissionOnboardingStatus,
  ) => {
    const nextState: PermissionOnboardingState = {
      phoneAccess,
      locationAccess,
      completedAt: new Date().toISOString(),
    };

    setPermissionOnboardingState(nextState);
    if (!ALWAYS_SHOW_PERMISSION_ONBOARDING) {
      await AsyncStorage.setItem(
        PERMISSION_ONBOARDING_STORAGE_KEY,
        JSON.stringify(nextState),
      );
    }
    setScreen('home');
  };

  const refreshOfflineQueueStatus = async (
    overrides: Partial<OfflineQueueStatus> = {},
  ) => {
    try {
      await initOfflineTripStorage();
      const [pendingSessions, pendingGpsPoints, pendingMatchedPoints] = await Promise.all([
        getPendingOfflineTripSessions(1000),
        getUnsyncedOfflineTripPoints(10000),
        getUnsyncedOfflineMatchedTripPoints(10000),
      ]);

      setOfflineQueueStatus((current) => ({
        ...current,
        pendingTripCount: pendingSessions.length,
        pendingGpsPointCount: pendingGpsPoints.length,
        pendingMatchedPointCount: pendingMatchedPoints.length,
        ...overrides,
      }));
    } catch (error) {
      setOfflineQueueStatus((current) => ({
        ...current,
        ...overrides,
        lastError:
          overrides.lastError ??
          (error instanceof Error ? error.message : 'Offline queue status unavailable.'),
      }));
    }
  };

  const syncOfflineTripPoints = async (targetLocalTripId?: string | null) => {
    if (isSyncingOfflineTripPointsRef.current || !hasSupabaseConfig) {
      const error = isSyncingOfflineTripPointsRef.current
        ? 'sync-in-progress'
        : 'supabase-not-configured';
      setOfflineQueueStatus((current) => ({
        ...current,
        lastError: error,
      }));
      return {
        ok: false,
        error,
        syncedLocalTripIds: [] as string[],
      };
    }

    isSyncingOfflineTripPointsRef.current = true;
    const syncStartedAt = new Date().toISOString();
    let finalQueueStatusOverrides: Partial<OfflineQueueStatus> = {
      isSyncing: false,
      lastAttemptAt: syncStartedAt,
    };
    setOfflineQueueStatus((current) => ({
      ...current,
      isSyncing: true,
      lastAttemptAt: syncStartedAt,
      lastError: null,
    }));
    try {
      await initOfflineTripStorage();
      let shouldRefreshTripHistoryAfterSync = false;
      const syncedLocalTripIds: string[] = [];
      const failTripSync = (message: string): never => {
        throw new Error(message);
      };
      const scheduleOfflineSyncRetry = () => {
        if (offlineSyncRetryTimeoutRef.current) {
          clearTimeout(offlineSyncRetryTimeoutRef.current);
        }
        const retryDelay = offlineSyncRetryDelayMsRef.current;
        const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();
        setOfflineQueueStatus((current) => ({
          ...current,
          nextRetryAt,
        }));
        offlineSyncRetryTimeoutRef.current = setTimeout(() => {
          offlineSyncRetryTimeoutRef.current = null;
          void syncOfflineTripPoints();
        }, retryDelay);
        offlineSyncRetryDelayMsRef.current = Math.min(
          retryDelay * 2,
          OFFLINE_SYNC_RETRY_MAX_MS,
        );
      };
      const ensureServerTripForLocalRows = async ({
        localTripId,
        currentServerTripId,
        driverId,
        fallbackStartPoint,
      }: {
        localTripId: string;
        currentServerTripId: number | null;
        driverId: number;
        fallbackStartPoint?: { latitude: number; longitude: number } | null;
      }) => {
        if (currentServerTripId) {
          const { exists, error } = await checkTripExists(currentServerTripId);
          if (error) {
            failTripSync(error);
          }
          if (exists) {
            return currentServerTripId;
          }
        }

        const session = await getOfflineTripSession(localTripId);
        const startLatitude = session?.start_latitude ?? fallbackStartPoint?.latitude ?? undefined;
        const startLongitude = session?.start_longitude ?? fallbackStartPoint?.longitude ?? undefined;
        const { tripId, error } = await startTrip(driverId, startLatitude, startLongitude);
        if (error || !tripId) {
          failTripSync(error ?? `The server did not recreate trip ${localTripId}.`);
        }

        const parsedTripId = Number(tripId);
        if (!Number.isFinite(parsedTripId)) {
          failTripSync(`The server returned an invalid trip id (${tripId}).`);
        }

        await markOfflineTripSessionStartedSynced(localTripId, parsedTripId);
        await attachServerTripIdToOfflineTrip(localTripId, parsedTripId);
        shouldRefreshTripHistoryAfterSync = true;
        return parsedTripId;
      };

      while (true) {
        const sessions = (await getPendingOfflineTripSessions(100)).filter((session) =>
          targetLocalTripId ? session.local_trip_id === targetLocalTripId : true,
        );
        if (sessions.length === 0) {
          break;
        }

        for (const session of sessions) {
          let serverTripId = session.server_trip_id;

          if (serverTripId && session.start_synced === 1) {
            const { exists, error } = await checkTripExists(serverTripId);
            if (error) {
              failTripSync(error);
            }
            if (!exists) {
              serverTripId = null;
            }
          }

          if (!serverTripId || session.start_synced === 0) {
            const { tripId, error } = await startTrip(
              session.driver_id,
              session.start_latitude ?? undefined,
              session.start_longitude ?? undefined,
            );

            if (error || !tripId) {
              failTripSync(
                error ??
                  `The server did not create a trip for local trip ${session.local_trip_id}.`,
              );
            }

            const parsedTripId = Number(tripId);
            if (!Number.isFinite(parsedTripId)) {
              failTripSync(`The server returned an invalid trip id (${tripId}).`);
            }

            serverTripId = parsedTripId;
            await markOfflineTripSessionStartedSynced(session.local_trip_id, parsedTripId);
            await attachServerTripIdToOfflineTrip(session.local_trip_id, parsedTripId);
            shouldRefreshTripHistoryAfterSync = true;
            if (session.local_trip_id === activeLocalTripId) {
              setActiveTripDbId(String(parsedTripId));
            }
            const routeAttachResult = await attachTripRoutesToServerTrip(
              session.local_trip_id,
              parsedTripId,
            );
            if (routeAttachResult.error) {
              failTripSync(routeAttachResult.error);
            }
          }

          if (session.status !== 'completed' || session.completed_synced === 1) {
            continue;
          }

          const [tripPoints, matchedTripPoints, tripStatusEvents] = await Promise.all([
            getOfflineTripPointsByLocalTripId(session.local_trip_id),
            getOfflineMatchedTripPointsByLocalTripId(session.local_trip_id),
            getOfflineTripStatusEventsByLocalTripId(session.local_trip_id),
          ]);
          const reconstruction = await reconstructCompletedTripPath(
            tripPoints.map((point) => ({
              latitude: point.latitude,
              longitude: point.longitude,
              speed: point.speed,
              heading: point.heading,
              accuracy: point.accuracy,
              recordedAt: point.recorded_at,
            })),
          );
          console.info('[TripReconstruction] Offline session reconstruction.', {
            localTripId: session.local_trip_id,
            status: reconstruction.status,
            provider: reconstruction.matchedProvider,
            rawAcceptedPoints: reconstruction.rawAcceptedPath.length,
            smoothedPoints: reconstruction.smoothedAcceptedPath.length,
            preprocessedPoints: reconstruction.preprocessedPath.length,
            reconstructedPoints: reconstruction.reconstructedPath.length,
            rejectedOutliers: reconstruction.rejectedOutlierCount,
          });
          const preserveDetailedOfflineGeometry = shouldPreserveDetailedRouteGeometry(
            reconstruction.routeMatchMetadata,
          );
          let routePoints = await buildRoadAlignedRoutePath({
            candidatePath:
              reconstruction.reconstructedPath.length > 1
                ? reconstruction.reconstructedPath
                : reconstruction.preprocessedPath.length > 1
                  ? reconstruction.preprocessedPath
                  : reconstruction.rawAcceptedPath,
            fallbackPath:
              reconstruction.preprocessedPath.length > 1
                ? reconstruction.preprocessedPath
                : reconstruction.rawAcceptedPath,
            preserveDetailedGeometry: preserveDetailedOfflineGeometry,
            trustCandidateGeometry:
              reconstruction.reconstructedPath.length > 1 &&
              (preserveDetailedOfflineGeometry || reconstruction.preprocessedPath.length > 1),
          });
          const rawTripPointPath = tripPoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }));
          const matchedTripPointPath = matchedTripPoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          }));
          const statusEventPointPath = tripStatusEvents
            .filter((event) => event.latitude !== null && event.longitude !== null)
            .map((event) => ({
              latitude: event.latitude!,
              longitude: event.longitude!,
            }));
          const fallbackTripPath =
            rawTripPointPath.length > 0
              ? rawTripPointPath
              : matchedTripPointPath.length > 0
                ? matchedTripPointPath
                : statusEventPointPath;
          if (routePoints.length === 0 && fallbackTripPath.length > 0) {
            routePoints = fallbackTripPath;
          }
          const firstFallbackTripPoint = fallbackTripPath[0] ?? routePoints[0] ?? null;
          const lastFallbackTripPoint = fallbackTripPath.at(-1) ?? routePoints.at(-1) ?? null;
          const rawEndPoint =
            session.end_latitude !== null && session.end_longitude !== null
              ? { latitude: session.end_latitude, longitude: session.end_longitude }
              : lastFallbackTripPoint ??
                (session.start_latitude !== null && session.start_longitude !== null
                  ? { latitude: session.start_latitude, longitude: session.start_longitude }
                  : null);
          const finalizedEndpointState = await resolveFinalizedTripEndpointState({
            routePath: routePoints,
            rawEndPoint,
          });
          const endPoint = finalizedEndpointState.matchedEndPoint ?? rawEndPoint;
          const rawStartPoint =
            session.start_latitude !== null && session.start_longitude !== null
              ? { latitude: session.start_latitude, longitude: session.start_longitude }
              : firstFallbackTripPoint;
          const finalizedStartEndpointState = await resolveFinalizedTripStartEndpointState({
            routePath: routePoints,
            rawStartPoint,
          });
          const offlineMatchedStartPoint =
            finalizedStartEndpointState.matchedStartPoint ?? routePoints[0] ?? rawStartPoint;
          const offlineMatchedEndPoint =
            finalizedEndpointState.matchedEndPoint ?? routePoints.at(-1) ?? rawEndPoint;
          const offlineTripDisplayLabels = await resolveTripDisplayLocationLabels({
            matchedStartPoint: offlineMatchedStartPoint,
            matchedEndPoint: offlineMatchedEndPoint,
            routePath: routePoints,
            filteredStartPoint: rawStartPoint,
            filteredEndPoint: rawEndPoint,
          });

          if (!serverTripId) {
            failTripSync(`Local trip ${session.local_trip_id} could not create or restore a server trip id.`);
          }

          if (!endPoint) {
            console.warn('[TripSync] Skipping completed offline trip with no stored location points.', {
              localTripId: session.local_trip_id,
              rawPointCount: tripPoints.length,
              matchedPointCount: matchedTripPoints.length,
              statusEventPointCount: statusEventPointPath.length,
            });
            failTripSync(
              `Local trip ${session.local_trip_id} is incomplete and cannot sync until it has a valid endpoint.`,
            );
          }

          const completeResult = await completeTrip({
            tripId: String(serverTripId),
            endLat: endPoint!.latitude,
            endLng: endPoint!.longitude,
            distanceKm: Number(session.distance_km ?? 0),
            fare: Number(session.fare ?? 0),
            durationSeconds: Number(session.duration_seconds ?? 0),
            routePoints,
            routeMatchSummary: reconstruction.routeMatchMetadata ?? null,
            matchedPointCount: routePoints.length,
            rawGpsPointCount: tripPoints.length,
            matchedStartPoint: offlineMatchedStartPoint,
            rawEndPoint,
            matchedEndPoint: offlineMatchedEndPoint,
            startDisplayName: offlineTripDisplayLabels.startDisplayName,
            endDisplayName: offlineTripDisplayLabels.endDisplayName,
            startCoordinate: offlineTripDisplayLabels.startCoordinate,
            endCoordinate: offlineTripDisplayLabels.endCoordinate,
            dashedStartConnector: finalizedStartEndpointState.dashedStartConnector,
            dashedEndConnector: finalizedEndpointState.dashedEndConnector,
            endpointSelectionSummary: finalizedEndpointState.endpointSelectionSummary,
          });

          if (completeResult.error) {
            failTripSync(completeResult.error);
          }

          promoteOfflineHistoryItemToServerTrip({
            localTripId: session.local_trip_id,
            serverTripId,
            routePath: routePoints,
            routeMatchSummary: pickPreferredRouteMatchSummary(
              reconstruction.routeMatchMetadata ?? null,
              null,
            ),
            startDisplayName: offlineTripDisplayLabels.startDisplayName,
            endDisplayName: offlineTripDisplayLabels.endDisplayName,
            startCoordinate: offlineTripDisplayLabels.startCoordinate,
            endCoordinate: offlineTripDisplayLabels.endCoordinate,
          });
          await markOfflineTripSessionCompletedSynced(session.local_trip_id);
          syncedLocalTripIds.push(session.local_trip_id);
          shouldRefreshTripHistoryAfterSync = true;
        }

      }

      while (true) {
        const rows = (await getUnsyncedOfflineTripPoints(OFFLINE_POINT_SYNC_BATCH_SIZE)).filter((row) =>
          targetLocalTripId ? row.local_trip_id === targetLocalTripId : true,
        );
        if (rows.length === 0) {
          break;
        }

        const rowsByTrip = new Map<string, typeof rows>();
        for (const row of rows) {
          const list = rowsByTrip.get(row.local_trip_id) ?? [];
          list.push(row);
          rowsByTrip.set(row.local_trip_id, list);
        }

        let syncFailed = false;
        let syncFailureReason: string | null = null;
        for (const tripRows of rowsByTrip.values()) {
          const firstTripRow = tripRows[0];
          if (!firstTripRow) {
            syncFailed = true;
            syncFailureReason = 'Trip GPS point batch was empty.';
            break;
          }
          let serverTripId = firstTripRow.server_trip_id ?? null;
          serverTripId = await ensureServerTripForLocalRows({
            localTripId: firstTripRow.local_trip_id,
            currentServerTripId: serverTripId,
            driverId: firstTripRow.driver_id,
            fallbackStartPoint: { latitude: firstTripRow.latitude, longitude: firstTripRow.longitude },
          });

          const { error } = await insertTripPointBatch(
            tripRows.map((row) => ({
              driver_id: row.driver_id,
              trip_id: serverTripId,
              lat: row.latitude,
              lng: row.longitude,
              speed: row.speed,
              heading: row.heading,
              accuracy: row.accuracy,
              altitude: row.altitude,
              provider: row.provider,
              recorded_at: row.recorded_at,
              dedup_key: row.idempotency_key || buildTripPointDedupKey({
                tripId: serverTripId,
                recordedAt: row.recorded_at,
                latitude: row.latitude,
                longitude: row.longitude,
              }),
            })),
          );

          if (error) {
            syncFailed = true;
            syncFailureReason = error;
            break;
          }

          await markOfflineTripPointsSynced(tripRows.map((row) => row.id));
        }

        if (syncFailed) {
          scheduleOfflineSyncRetry();
          failTripSync(syncFailureReason ?? 'Trip GPS point sync failed.');
        }
      }

      while (true) {
        const rows = (await getUnsyncedOfflineMatchedTripPoints(OFFLINE_POINT_SYNC_BATCH_SIZE)).filter((row) =>
          targetLocalTripId ? row.local_trip_id === targetLocalTripId : true,
        );
        if (rows.length === 0) {
          offlineSyncRetryDelayMsRef.current = OFFLINE_SYNC_RETRY_BASE_MS;
          break;
        }

        const rowsByTrip = new Map<string, typeof rows>();
        for (const row of rows) {
          const list = rowsByTrip.get(row.local_trip_id) ?? [];
          list.push(row);
          rowsByTrip.set(row.local_trip_id, list);
        }

        let syncFailed = false;
        let syncFailureReason: string | null = null;
        for (const tripRows of rowsByTrip.values()) {
          const firstTripRow = tripRows[0];
          if (!firstTripRow) {
            syncFailed = true;
            syncFailureReason = 'Trip route point batch was empty.';
            break;
          }
          const serverTripId = await ensureServerTripForLocalRows({
            localTripId: firstTripRow.local_trip_id,
            currentServerTripId: firstTripRow.server_trip_id ?? null,
            driverId: firstTripRow.driver_id,
            fallbackStartPoint: { latitude: firstTripRow.latitude, longitude: firstTripRow.longitude },
          });
          const { error } = await insertTripRouteBatch(
            tripRows.map((row) => ({
              local_trip_id: row.local_trip_id,
              trip_id: serverTripId,
              driver_id: row.driver_id,
              latitude: row.latitude,
              longitude: row.longitude,
              recorded_at: row.recorded_at,
            })),
          );

          if (error) {
            syncFailed = true;
            syncFailureReason = error;
            break;
          }

          await markOfflineMatchedTripPointsSynced(tripRows.map((row) => row.id));
        }

        if (syncFailed) {
          scheduleOfflineSyncRetry();
          failTripSync(syncFailureReason ?? 'Trip route sync failed.');
        }
      }
      if (
        shouldRefreshTripHistoryAfterSync &&
        driverDbIdRef.current !== null &&
        tripHistoryHydratedDriverIdRef.current === driverDbIdRef.current
      ) {
        tripRouteRepairAttemptedIdsRef.current = new Set();
        await refreshTripHistoryFromBackend(driverDbIdRef.current);
        const repairedCount = await repairTripHistoryRoutes({
          targetDriverId: driverDbIdRef.current,
          maxCount: MAX_TRIP_ROUTE_REPAIRS_PER_PASS,
        });
        if (repairedCount > 0) {
          await refreshTripHistoryFromBackend(driverDbIdRef.current);
        }
      }
      offlineSyncRetryDelayMsRef.current = OFFLINE_SYNC_RETRY_BASE_MS;
      if (offlineSyncRetryTimeoutRef.current) {
        clearTimeout(offlineSyncRetryTimeoutRef.current);
        offlineSyncRetryTimeoutRef.current = null;
      }
      finalQueueStatusOverrides = {
        ...finalQueueStatusOverrides,
        lastError: null,
        nextRetryAt: null,
      };
      return {
        ok: true,
        error: null,
        syncedLocalTripIds,
      };
    } catch (error) {
      if (offlineSyncRetryTimeoutRef.current) {
        clearTimeout(offlineSyncRetryTimeoutRef.current);
      }
      const errorMessage = error instanceof Error ? error.message : 'offline-trip-session-sync-failed';
      const retryDelay = offlineSyncRetryDelayMsRef.current;
      const nextRetryAt = new Date(Date.now() + retryDelay).toISOString();
      offlineSyncRetryTimeoutRef.current = setTimeout(() => {
        offlineSyncRetryTimeoutRef.current = null;
        void syncOfflineTripPoints();
      }, retryDelay);
      offlineSyncRetryDelayMsRef.current = Math.min(
        retryDelay * 2,
        OFFLINE_SYNC_RETRY_MAX_MS,
      );
      finalQueueStatusOverrides = {
        ...finalQueueStatusOverrides,
        lastError: errorMessage,
        nextRetryAt,
      };
      return {
        ok: false,
        error: errorMessage,
        syncedLocalTripIds: [] as string[],
      };
    } finally {
      isSyncingOfflineTripPointsRef.current = false;
      await refreshOfflineQueueStatus(finalQueueStatusOverrides);
    }
  };

  const refreshTripHistoryAfterNetworkRestore = async () => {
    const targetDriverId = driverDbIdRef.current;
    if (
      targetDriverId === null ||
      tripHistoryHydratedDriverIdRef.current !== targetDriverId ||
      !hasSupabaseConfig
    ) {
      return;
    }

    await syncOfflineTripPoints();

    if (
      driverDbIdRef.current !== targetDriverId ||
      tripHistoryHydratedDriverIdRef.current !== targetDriverId
    ) {
      return;
    }

    tripRouteRepairAttemptedIdsRef.current = new Set();
    await refreshTripHistoryFromBackend(targetDriverId);

    const repairedCount = await repairTripHistoryRoutes({
      targetDriverId,
      maxCount: MAX_TRIP_ROUTE_REPAIRS_PER_PASS,
    });
    if (repairedCount > 0) {
      await refreshTripHistoryFromBackend(targetDriverId);
    }
  };

  const refreshDriverWorkflowState = async (
    targetDriverId: number,
    options?: {
      includeProfile?: boolean;
      includeTripHistory?: boolean;
      includeViolations?: boolean;
      includeOfflineSync?: boolean;
      force?: boolean;
    },
  ) => {
    if (driverDbIdRef.current !== targetDriverId) {
      return;
    }

    const now = Date.now();
    if (!options?.force && now - lastWorkflowRefreshAtRef.current < 10_000) {
      return workflowRefreshInFlightRef.current ?? Promise.resolve();
    }

    if (workflowRefreshInFlightRef.current) {
      return workflowRefreshInFlightRef.current;
    }

    lastWorkflowRefreshAtRef.current = now;
    const pendingRefresh = (async () => {
      if (options?.includeOfflineSync) {
        await refreshTripHistoryAfterNetworkRestore();
      }

      const followUpTasks: Promise<unknown>[] = [];
      if (options?.includeProfile) {
        followUpTasks.push(
          refreshDriverProfileFromBackend(targetDriverId, { preserveError: true }),
        );
      }
      if (
        options?.includeTripHistory &&
        tripHistoryHydratedDriverIdRef.current === targetDriverId
      ) {
        followUpTasks.push(refreshTripHistoryFromBackend(targetDriverId));
      }
      if (options?.includeViolations) {
        followUpTasks.push(refreshViolationItems(targetDriverId, { notifyNew: true }));
      }

      if (followUpTasks.length > 0) {
        await Promise.allSettled(followUpTasks);
      }
    })().finally(() => {
      workflowRefreshInFlightRef.current = null;
    });

    workflowRefreshInFlightRef.current = pendingRefresh;
    return pendingRefresh;
  };

  useEffect(() => {
    void (async () => {
      await initOfflineTripStorage();
      await refreshOfflineQueueStatus();
    })();
  }, []);

  useEffect(() => {
    if (driverDbId === null || activeLocalTripId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const session = await getLatestOngoingOfflineTripSession(driverDbId);
      if (!session || cancelled) {
        return;
      }

      const [rawPoints, matchedPoints, statusEvents] = await Promise.all([
        getOfflineTripPointsByLocalTripId(session.local_trip_id),
        getOfflineMatchedTripPointsByLocalTripId(session.local_trip_id),
        getOfflineTripStatusEventsByLocalTripId(session.local_trip_id),
      ]);
      if (cancelled) {
        return;
      }

      const rawPath = dedupeSequentialRoutePoints(
        rawPoints.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        })),
      );
      const matchedPath = buildPreferredOfflineMatchedPath(matchedPoints);
      const recoveredMatchedPath =
        matchedPath.length > 1
          ? matchedPath
          : rawPath.length > 1
            ? await buildRoadAlignedRoutePath({
                candidatePath: rawPath,
                fallbackPath: rawPath,
                preserveDetailedGeometry: false,
                trustCandidateGeometry: false,
              })
            : rawPath;
      if (cancelled) {
        return;
      }

      setActiveLocalTripId(session.local_trip_id);
      if (typeof session.server_trip_id === 'number') {
        setActiveTripDbId(String(session.server_trip_id));
      }
      setRestoredTripTrace({
        rawStartPoint:
          session.start_latitude !== null && session.start_longitude !== null
            ? {
                latitude: session.start_latitude,
                longitude: session.start_longitude,
              }
            : null,
        matchedPath: recoveredMatchedPath,
        hasConfirmedMovement:
          statusEvents.some((event) => event.status === 'movement_confirmed') ||
          recoveredMatchedPath.length > 1,
        startedAt: session.started_at,
      });
      await refreshOfflineQueueStatus();
    })();

    return () => {
      cancelled = true;
    };
  }, [activeLocalTripId, driverDbId]);

  useEffect(() => {
    if (!activeLocalTripId || !restoredTripTrace) {
      return;
    }

    const canOpenRecoveredTrip =
      screen === 'home' ||
      screen === 'trip' ||
      screen === 'startTrip' ||
      screen === 'tripNavigation';
    if (!canOpenRecoveredTrip) {
      return;
    }

    if (!recoveredTripNotificationIdsRef.current.has(activeLocalTripId)) {
      recoveredTripNotificationIdsRef.current.add(activeLocalTripId);
      pushNotification({
        category: 'trip',
        title: 'Trip recovered',
        message: 'Your active trip was restored from this device and tracking can continue.',
        icon: 'refresh-cw',
        target: { screen: 'tripNavigation' },
        dedupeKey: `trip-recovered-${activeLocalTripId}`,
      });
    }

    setForceNewTripNavigationSession(false);
    if (screen !== 'tripNavigation') {
      setScreen('tripNavigation');
    }
  }, [activeLocalTripId, restoredTripTrace, screen]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const nextIsOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      isNetworkAvailableRef.current = nextIsOnline;
      if (nextIsOnline) {
        const targetDriverId = driverDbIdRef.current;
        if (targetDriverId !== null) {
          void refreshDriverWorkflowState(targetDriverId, {
            includeProfile: true,
            includeViolations: true,
            includeOfflineSync: true,
            force: true,
          });
        } else {
          void refreshTripHistoryAfterNetworkRestore();
        }
      }
    });

    void NetInfo.fetch().then((state) => {
      isNetworkAvailableRef.current = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (state.isConnected && state.isInternetReachable !== false) {
        const targetDriverId = driverDbIdRef.current;
        if (targetDriverId !== null) {
          void refreshDriverWorkflowState(targetDriverId, {
            includeProfile: true,
            includeViolations: true,
            includeOfflineSync: true,
            force: true,
          });
        } else {
          void refreshTripHistoryAfterNetworkRestore();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;
      const resumedToActive =
        (previousState === 'background' || previousState === 'inactive') &&
        nextAppState === 'active';

      if (
        !resumedToActive ||
        driverDbIdRef.current === null ||
        !hasSupabaseConfig ||
        !isNetworkAvailableRef.current
      ) {
        return;
      }

      void refreshDriverWorkflowState(driverDbIdRef.current, {
        includeProfile: true,
        includeTripHistory: true,
        includeViolations: true,
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (offlineSyncRetryTimeoutRef.current) {
        clearTimeout(offlineSyncRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (driverDbId === null) {
      setProfileQrDetails(createEmptyProfileQrDetails());
      setProfileQrError(null);
      setIsProfileQrLoading(false);
      setProfileHydrated(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const raw = await AsyncStorage.getItem(`${PROFILE_STORAGE_KEY}${driverDbId}`);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          name?: string;
          driverCode?: string;
          contact?: string;
          plateNumber?: string;
          imageUri?: string | null;
          qrId?: number | null;
          qrToken?: string | null;
          qrStatus?: DriverQrStatus | null;
          qrIssuedAt?: string | null;
          reportPath?: string | null;
        };

        if (parsed.name) {
          setProfileName(parsed.name);
        }
        if (parsed.driverCode) {
          setProfileDriverCode(parsed.driverCode);
        }
        if (parsed.contact) {
          setProfileContact(parsed.contact);
        }
        if (parsed.plateNumber) {
          setProfilePlateNumber(parsed.plateNumber);
        }
        if (typeof parsed.imageUri !== 'undefined') {
          setProfileImageUri(parsed.imageUri);
        }
        applyProfileQrDetails({
          qr_id: parsed.qrId,
          qr_token: parsed.qrToken,
          qr_status: parsed.qrStatus,
          qr_issued_at: parsed.qrIssuedAt,
          report_path: parsed.reportPath,
        });
      } catch {
        // Keep defaults on corrupted storage payload.
      } finally {
        setProfileHydrated(true);
      }
    };

    void loadProfile();
  }, [driverDbId]);

  useEffect(() => {
    if (driverDbId === null || !profileHydrated) {
      return;
    }

    void refreshDriverProfileFromBackend(driverDbId, { preserveError: true });
  }, [driverDbId, profileHydrated]);

  useEffect(() => {
    if (driverDbId === null) {
      setViolationItems([]);
      return;
    }

    void refreshViolationItems(driverDbId);
  }, [driverDbId]);

  useEffect(() => {
    if (screen !== 'profile' || driverDbId === null) {
      return;
    }

    void refreshDriverProfileFromBackend(driverDbId);
  }, [driverDbId, screen]);

  useEffect(() => {
    if (driverDbId === null) {
      setNotifications([]);
      setNotificationsHydrated(false);
      return;
    }

    const loadNotifications = async () => {
      try {
        const raw = await AsyncStorage.getItem(`${NOTIFICATION_STORAGE_KEY}${driverDbId}`);
        if (!raw) {
          setNotifications([]);
          return;
        }

        const parsed = JSON.parse(raw) as Array<Partial<NotificationCenterItem>>;
        if (!Array.isArray(parsed)) {
          setNotifications([]);
          return;
        }

        const normalized = normalizeNotificationItems(
          parsed
            .map((item) => normalizeStoredNotificationItem(item))
            .filter((item): item is NotificationCenterItem => item !== null),
        );

        setNotifications(normalized);
      } catch {
        setNotifications([]);
      } finally {
        setNotificationsHydrated(true);
      }
    };

    void loadNotifications();
  }, [driverDbId]);

  useEffect(() => {
    let cancelled = false;

    setTripHistoryHydrated(false);
    setTripHistoryHydratedDriverId(null);
    tripHistoryHydratedDriverIdRef.current = null;

    if (driverDbId === null) {
      const demoOnly = [createDemoTrip()];
      setTripHistory(upsertTripHistoryItems([], demoOnly));
      const totals = computeTripTotals(demoOnly);
      setTotalEarnings(totals.earnings);
      setTotalTrips(totals.trips);
      setTotalDistanceKm(totals.distance);
      setTotalMinutes(totals.minutes);
      setTripHistoryHydrated(true);
      setTripHistoryHydratedDriverId(null);
      tripHistoryHydratedDriverIdRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    setTripHistory([]);
    setTotalEarnings(0);
    setTotalTrips(0);
    setTotalDistanceKm(0);
    setTotalMinutes(0);

    const loadTripHistory = async () => {
      try {
        const raw = await AsyncStorage.getItem(getTripHistoryStorageKey(driverDbId));
        if (!raw) {
          if (!cancelled) {
            setTripHistory([]);
            setTotalEarnings(0);
            setTotalTrips(0);
            setTotalDistanceKm(0);
            setTotalMinutes(0);
          }
          return;
        }

        const parsed = JSON.parse(raw) as Array<Partial<TripHistoryItem> & { routePath?: unknown }>;
        if (!Array.isArray(parsed)) {
          if (!cancelled) {
            setTripHistory([]);
            setTotalEarnings(0);
            setTotalTrips(0);
            setTotalDistanceKm(0);
            setTotalMinutes(0);
          }
          return;
        }

        const normalized = parsed
          .filter((item) => item.id !== 'TRIP-9001')
          .map((item) =>
            normalizeTripHistoryItem({
              ...item,
              routePath: normalizeSavedRoutePath(
                Array.isArray(item.routePath) ? item.routePath : [],
                [],
                {
                  preserveDetailedGeometry: shouldPreserveDetailedRouteGeometry(
                    (item.routeMatchSummary as TripRouteMatchSummary | null | undefined) ?? null,
                  ),
                },
              ),
            }),
          );

        if (cancelled) {
          return;
        }

        const hydratedList = upsertTripHistoryItems([], normalized);
        setTripHistory(hydratedList);

        const parsedTotals = computeTripTotals(hydratedList);
        setTotalEarnings(parsedTotals.earnings);
        setTotalTrips(parsedTotals.trips);
        setTotalDistanceKm(parsedTotals.distance);
        setTotalMinutes(parsedTotals.minutes);
      } catch {
        if (!cancelled) {
          setTripHistory([]);
          setTotalEarnings(0);
          setTotalTrips(0);
          setTotalDistanceKm(0);
          setTotalMinutes(0);
        }
      } finally {
        if (!cancelled) {
          setTripHistoryHydrated(true);
          setTripHistoryHydratedDriverId(driverDbId);
          tripHistoryHydratedDriverIdRef.current = driverDbId;
        }
      }
    };

    void loadTripHistory();

    return () => {
      cancelled = true;
    };
  }, [driverDbId]);

  useEffect(() => {
    if (!profileHydrated) {
      return;
    }

    const payload = JSON.stringify({
      name: profileName,
      driverCode: profileDriverCode,
      contact: profileContact,
      plateNumber: profilePlateNumber,
      imageUri: profileImageUri,
      qrId: profileQrDetails.qrId,
      qrToken: profileQrDetails.qrToken,
      qrStatus: profileQrDetails.qrStatus,
      qrIssuedAt: profileQrDetails.qrIssuedAt,
      reportPath: profileQrDetails.reportPath,
    });

    if (driverDbId === null) {
      return;
    }

    AsyncStorage.setItem(`${PROFILE_STORAGE_KEY}${driverDbId}`, payload).catch(() => {
      // Ignore write failures to avoid blocking UI.
    });
  }, [
    profileName,
    profileDriverCode,
    profileContact,
    profilePlateNumber,
    profileImageUri,
    profileQrDetails.qrId,
    profileQrDetails.qrIssuedAt,
    profileQrDetails.qrStatus,
    profileQrDetails.qrToken,
    profileQrDetails.reportPath,
    profileHydrated,
    driverDbId,
  ]);
  const isDarkMode = isLowBatteryMapMode;
  const isNavbarFixedScreen =
    screen === 'home' || screen === 'trip' || screen === 'violation' || screen === 'profile';
  const themedAuthStyles = useMemo(
    () => ({
      ...styles,
      inputWrapper: [
        styles.inputWrapper,
        isDarkMode
          ? {
              backgroundColor: MAXIM_UI_SURFACE_DARK,
              borderWidth: 1,
              borderColor: MAXIM_UI_BORDER_DARK,
            }
          : null,
      ],
      input: [styles.input, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null],
      smallLinkDark: [styles.smallLinkDark, isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null],
      helperText: [styles.helperText, isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null],
    }),
    [isDarkMode],
  );

  useEffect(() => {
    screenTransitionOpacity.setValue(0);
    screenTransitionTranslateY.setValue(10);
    Animated.parallel([
      Animated.timing(screenTransitionOpacity, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(screenTransitionTranslateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screen, screenTransitionOpacity, screenTransitionTranslateY]);

  useEffect(() => {
    if (!notificationsHydrated || driverDbId === null) {
      return;
    }

    AsyncStorage.setItem(
      `${NOTIFICATION_STORAGE_KEY}${driverDbId}`,
      JSON.stringify(notifications),
    ).catch(() => {
      // Ignore write failures to avoid blocking UI.
    });
  }, [driverDbId, notifications, notificationsHydrated]);

  useEffect(() => {
    if (!isDriverOnline || !routeLocationEnabled) {
      pendingOpenTripScreenRef.current = false;
      setIsHomeLocationVisible(false);
       setIsWaitingForTripLocation(false);
      return;
    }
  }, [isDriverOnline, routeLocationEnabled]);

  useEffect(() => {
    if (!pendingOpenTripScreenRef.current || !isHomeLocationVisible) {
      return;
    }

    pendingOpenTripScreenRef.current = false;
    setIsWaitingForTripLocation(false);
  }, [isHomeLocationVisible]);

  useEffect(() => {
    return () => {
      if (isDriverOnlineRef.current && driverDbIdRef.current !== null) {
        void setDriverPresenceOffline(driverDbIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const shouldTrackLiveLocation =
      driverDbId !== null &&
      Boolean(profileDriverCode) &&
      isDriverOnline &&
      routeLocationEnabled;

    if (!shouldTrackLiveLocation) {
      liveTrackingSubscriptionRef.current?.remove();
      liveTrackingSubscriptionRef.current = null;
      lastLiveSyncPointRef.current = null;
      lastLiveSyncTimestampRef.current = null;
      return;
    }

    let active = true;

    const startLiveTracking = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!active) {
        return;
      }

      if (status !== 'granted') {
        setIsDriverOnline(false);
        if (!hasShownTrackingPermissionErrorRef.current) {
          hasShownTrackingPermissionErrorRef.current = true;
          Alert.alert(
            'Location Required',
            'Enable location permission so your driver account appears on the admin dashboard.',
          );
        }
        return;
      }

      const initialLocationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      }).catch(() => null);

      liveTrackingSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: LIVE_SYNC_INTERVAL_MS,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          if (!active || driverDbId === null) {
            return;
          }

          void syncDriverPresenceLocation(location).then((error) => {
            if (error) {
              console.warn('Live driver tracking sync failed:', error);
            }
          });
        },
      );

      const initialLocation = await Promise.race<Location.LocationObject | null>([
        initialLocationPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), INITIAL_LIVE_FIX_TIMEOUT_MS)),
      ]);

      if (!active || !initialLocation) {
        return;
      }

      const initialError = await syncDriverPresenceLocation(initialLocation);
      if (initialError) {
        console.warn('Initial live sync failed:', initialError);
      }
    };

    void startLiveTracking();

    return () => {
      active = false;
      liveTrackingSubscriptionRef.current?.remove();
      liveTrackingSubscriptionRef.current = null;
      lastLiveSyncPointRef.current = null;
      lastLiveSyncTimestampRef.current = null;
    };
  }, [driverDbId, isDriverOnline, profileDriverCode, routeLocationEnabled]);

  const handleGoOnline = async (options?: { openTripScreen?: boolean }) => {
    if (driverDbId === null || !profileDriverCode) {
      Alert.alert('Profile Missing', 'Log in again before going online.');
      setIsWaitingForTripLocation(false);
      return false;
    }

    const latestNetworkState = await NetInfo.fetch();
    const hasReachableInternet = Boolean(
      latestNetworkState.isConnected && latestNetworkState.isInternetReachable !== false,
    );
    isNetworkAvailableRef.current = hasReachableInternet;
    if (!hasReachableInternet) {
      Alert.alert(
        'Internet required',
        'Connect to the internet before going online or opening trip tools.',
      );
      setIsDriverOnline(false);
      setIsWaitingForTripLocation(false);
      return false;
    }

    const enabled = await refreshLocationAvailability();
    if (!enabled) {
      Alert.alert(
        'Location Required',
        permissionOnboardingState?.locationAccess === 'skipped'
          ? 'Location access was skipped during setup. Turn on location permission and device services in Settings before going online.'
          : 'Turn on location permission and device services before going online.',
      );
      setIsDriverOnline(false);
      setIsWaitingForTripLocation(false);
      return false;
    }

    const queueTripOpen = () => {
      if (!options?.openTripScreen) {
        return;
      }
      pendingOpenTripScreenRef.current = false;
      setIsWaitingForTripLocation(false);
      setScreen('startTrip');
    };

    try {
      hasShownTrackingPermissionErrorRef.current = false;
      setIsDriverOnline(true);
      pushNotification({
        category: 'trip',
        title: 'You are now online',
        message: options?.openTripScreen
          ? 'Trip tools are ready. You can start or manage a trip from the route flow.'
          : 'Live trip operations are ready. Your location will keep updating while you stay online.',
        icon: 'radio',
        target: { screen: options?.openTripScreen ? 'startTrip' : 'home' },
        dedupeKey: `driver-online-${driverDbId ?? 'local'}`,
      });
      queueTripOpen();

      void (async () => {
        try {
          const lastKnownLocation = await Location.getLastKnownPositionAsync({
            maxAge: 5 * 60 * 1000,
            requiredAccuracy: MAX_FAST_START_ACCURACY_METERS,
          }).catch(() => null);

          if (lastKnownLocation) {
            const warmStartError = await syncDriverPresenceLocation(lastKnownLocation, {
              maxAccuracyMeters: MAX_FAST_START_ACCURACY_METERS,
            });
            if (warmStartError) {
              console.warn('Last known live sync failed:', warmStartError);
            }
          }

          const location = await Promise.race<Location.LocationObject | null>([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.BestForNavigation,
              mayShowUserSettingsDialog: true,
            }).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), INITIAL_LIVE_FIX_TIMEOUT_MS)),
          ]);

          if (!location) {
            return;
          }

          const error = await syncDriverPresenceLocation(location, {
            maxAccuracyMeters: MAX_FAST_START_ACCURACY_METERS,
          });
          if (error) {
            console.warn('High-accuracy live sync failed:', error);
          }
        } catch {
          // The watcher will keep trying; don't block the driver on this warm-up fix.
        }
      })();

      return true;
    } catch {
      Alert.alert(
        'Location Error',
        'Unable to get your current location. Please wait for GPS to stabilize, then try again.',
      );
      setIsDriverOnline(false);
      setIsWaitingForTripLocation(false);
      return false;
    }
  };

  const handleDriverLogin = async (driverCode: string, password: string) => {
    if (!driverCode || !password) {
      Alert.alert('Missing fields', 'Enter driver code and password.');
      return;
    }

    setIsAuthenticating(true);
    const { driver, error } = await authenticateDriver(driverCode, password);
    setIsAuthenticating(false);

    if (error) {
      Alert.alert('Login Error', error);
      return;
    }

    if (!driver) {
      Alert.alert('Invalid credentials', 'Driver code or password is incorrect.');
      return;
    }

    applyDriverIdentity(driver);
    setPendingPhoneAccessStatus('granted');
    await AsyncStorage.setItem(
      DRIVER_SESSION_STORAGE_KEY,
      JSON.stringify({
        driverDbId: driver.id,
        driverCode: driver.driver_id,
        savedAt: new Date().toISOString(),
      }),
    ).catch(() => undefined);

    const savedPermissionOnboarding = ALWAYS_SHOW_PERMISSION_ONBOARDING
      ? null
      : await loadPermissionOnboardingState();
    setPermissionOnboardingState(savedPermissionOnboarding);
    await refreshLocationAvailability();
    setScreen(savedPermissionOnboarding ? 'home' : 'permissionPhone');
  };

  const handleCreatePassword = async (driverCode: string, password: string) => {
    setIsSettingPassword(true);
    const { driver, error } = await setDriverPassword(driverCode, password);
    setIsSettingPassword(false);

    if (error) {
      Alert.alert('Create Password Error', error);
      return;
    }

    if (!driver) {
      Alert.alert('Driver not found', 'The driver code was not found in the database.');
      return;
    }

    Alert.alert('Password created', 'Your password has been saved. You can now log in.');
    setScreen('login');
  };

  useEffect(() => {
    if (driverDbId === null || tripHistoryHydratedDriverId !== driverDbId) {
      return;
    }

    void refreshTripHistoryFromBackend(driverDbId);
  }, [driverDbId, tripHistoryHydratedDriverId]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (
      driverDbId === null ||
      tripHistoryHydratedDriverId !== driverDbId ||
      !hasSupabaseConfig ||
      !supabaseClient
    ) {
      return;
    }

    let tripRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleTripRefresh = () => {
      if (tripRefreshTimeout) {
        clearTimeout(tripRefreshTimeout);
      }
      tripRefreshTimeout = setTimeout(() => {
        void refreshTripHistoryFromBackend(driverDbId);
      }, 250);
    };

    const tripHistoryChannel = supabaseClient
      .channel(`driver-trip-history-${driverDbId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driverDbId}` },
        scheduleTripRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_routes', filter: `driver_id=eq.${driverDbId}` },
        scheduleTripRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_route_points' },
        scheduleTripRefresh,
      )
      .subscribe();

    const violationChannel = supabaseClient
      .channel(`driver-violations-${driverDbId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mobile_violations',
          filter: `driver_id=eq.${driverDbId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const violation = payload.new as RealtimeViolationPayload | null;
            const violationId =
              typeof violation?.id === 'string' && violation.id.trim().length > 0
                ? violation.id.trim()
                : null;

            if (violationId && !notifiedViolationIdsRef.current.has(violationId)) {
              notifiedViolationIdsRef.current.add(violationId);
              pushNotification({
                category: 'violation',
                title: getViolationRealtimeTitle(violation ?? {}),
                message: getViolationRealtimeMessage(violation ?? {}),
                icon: 'alert-triangle',
              });
            }
          }
          void refreshViolationItems(driverDbId);
        },
      )
      .subscribe();
    const violationAppealsChannel = supabaseClient
      .channel(`driver-violation-appeals-${driverDbId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'violation_appeals',
          filter: `driver_id=eq.${driverDbId}`,
        },
        () => {
          void refreshViolationItems(driverDbId);
        },
      )
      .subscribe();
    const violationProofsChannel = supabaseClient
      .channel(`driver-violation-proofs-${driverDbId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'violation_proofs',
          filter: `driver_id=eq.${driverDbId}`,
        },
        () => {
          void refreshViolationItems(driverDbId);
        },
      )
      .subscribe();

    return () => {
      if (tripRefreshTimeout) {
        clearTimeout(tripRefreshTimeout);
      }
      void supabaseClient.removeChannel(tripHistoryChannel);
      void supabaseClient.removeChannel(violationChannel);
      void supabaseClient.removeChannel(violationAppealsChannel);
      void supabaseClient.removeChannel(violationProofsChannel);
    };
  }, [driverDbId, tripHistoryHydratedDriverId]);

  useEffect(() => {
    if (
      !tripHistoryHydrated ||
      driverDbId === null ||
      tripHistoryHydratedDriverId !== driverDbId
    ) {
      return;
    }

    const persistedTripHistory = tripHistory.filter((item) => item.id !== 'TRIP-9001');
    AsyncStorage.setItem(
      getTripHistoryStorageKey(driverDbId),
      JSON.stringify(persistedTripHistory),
    ).catch(() => {
      // Ignore write failures to avoid blocking UI.
    });
  }, [driverDbId, tripHistory, tripHistoryHydrated, tripHistoryHydratedDriverId]);

  const handlePhoneOnboardingContinue = () => {
    void (async () => {
      setIsPermissionOnboardingSubmitting(true);
      let phoneAccess: PermissionOnboardingStatus = 'skipped';

      try {
        const isContactsAvailable = await Contacts.isAvailableAsync();
        if (isContactsAvailable) {
          const response = await Contacts.requestPermissionsAsync();
          phoneAccess = response.status === 'granted' ? 'granted' : 'skipped';
        }
      } catch {
        phoneAccess = 'skipped';
      }

      setPendingPhoneAccessStatus(phoneAccess);
      setIsPermissionOnboardingSubmitting(false);
      setScreen('permissionLocation');
    })();
  };

  const handlePhoneOnboardingSkip = () => {
    setPendingPhoneAccessStatus('skipped');
    setScreen('permissionLocation');
  };

  const handleLocationOnboardingContinue = async () => {
    setIsPermissionOnboardingSubmitting(true);
    const result = await requestLocationAccessFromOnboarding();
    if (result.granted && !result.servicesEnabled) {
      Alert.alert(
        'Location Services Off',
        'Location permission was granted, but your device location services are still off. You can enable them later from Settings before going online.',
      );
    }
    if (!result.granted) {
      Alert.alert(
        'Location Access Skipped',
        'You can still continue, but trips will need location access enabled before you go online.',
      );
    }
    await completePermissionOnboarding(
      pendingPhoneAccessStatus,
      result.granted && result.servicesEnabled ? 'granted' : 'skipped',
    );
    setIsPermissionOnboardingSubmitting(false);
  };

  const handleLocationOnboardingSkip = async () => {
    setIsPermissionOnboardingSubmitting(true);
    setRouteLocationEnabled(false);
    await completePermissionOnboarding(pendingPhoneAccessStatus, 'skipped');
    setIsPermissionOnboardingSubmitting(false);
  };

  const openTripActionModal = () => {
    setShowTripActionModal(true);
  };

  const confirmTripActionModal = async () => {
    setShowTripActionModal(false);
    if (activeLocalTripId) {
      setForceNewTripNavigationSession(false);
      setScreen('tripNavigation');
      return;
    }

    if (isDriverOnline) {
      const latestNetworkState = await NetInfo.fetch();
      const hasReachableInternet = Boolean(
        latestNetworkState.isConnected && latestNetworkState.isInternetReachable !== false,
      );
      isNetworkAvailableRef.current = hasReachableInternet;
      if (!hasReachableInternet) {
        Alert.alert(
          'Internet required',
          'Connect to the internet before opening trip tools.',
        );
        return;
      }

      setScreen('startTrip');
      return;
    }
    await handleGoOnline({ openTripScreen: true });
  };

  const tripActionModalContent = isDriverOnline
    ? {
        title: 'Open trip activity?',
        description:
          'You are already online. Open the trip workspace now to start or manage your current trip activity.',
        confirmLabel: 'Open Trip',
      }
    : {
        title: 'Go online and open trip tools?',
        description:
          'You’re about to start trip activity. We’ll put you online first, then open the trip workspace so you can begin when you’re ready.',
        confirmLabel: 'Go Online',
      };

  const handleMainTabNavigate = async (tab: 'home' | 'route' | 'trip' | 'violation' | 'profile') => {
    if (tab === 'home') {
      setScreen('home');
      return;
    }
    if (tab === 'route') {
      if (activeLocalTripId) {
        setForceNewTripNavigationSession(false);
        setScreen('tripNavigation');
        return;
      }
      openTripActionModal();
      return;
    }
    if (tab === 'trip') {
      setScreen('trip');
      return;
    }
    if (tab === 'violation') {
      setScreen('violation');
      return;
    }
    if (tab === 'profile') {
      setScreen('profile');
    }
  };

  const handleTrackingLogout = () => {
    if (driverDbId !== null && isDriverOnlineRef.current) {
      void setDriverPresenceOffline(driverDbId);
    }
    setIsDriverOnline(false);
    setDriverDbId(null);
    setActiveTripDbId(null);
    setActiveLocalTripId(null);
    lastOfflineStoredPointRef.current = null;
    activeTripStartPromiseRef.current = null;
    setShowTripActionModal(false);
    setPermissionOnboardingState(null);
    setPendingPhoneAccessStatus('granted');
    setRouteLocationEnabled(false);
    setRestoredTripTrace(null);
    void AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY);
    setScreen('login');
  };

  const handleTrackingOffline = () => {
    if (driverDbId !== null) {
      void setDriverPresenceOffline(driverDbId);
    }
    pendingOpenTripScreenRef.current = false;
    setIsHomeLocationVisible(false);
    setScreen('home');
    setIsDriverOnline(false);
    pushNotification({
      category: 'trip',
      title: 'You are now offline',
      message: 'Trip availability has been paused. Use the route action any time you want to go back online.',
      icon: 'moon',
      target: { screen: 'home' },
      dedupeKey: `driver-offline-${driverDbId ?? 'local'}`,
    });
    setActiveLocalTripId(null);
    setRestoredTripTrace(null);
    lastOfflineStoredPointRef.current = null;
  };

  const clearActiveTripState = () => {
    setActiveTripDbId(null);
    setActiveLocalTripId(null);
    setRestoredTripTrace(null);
    lastOfflineStoredPointRef.current = null;
    activeTripStartPromiseRef.current = null;
  };

  const handleTrackingTripStart = async ({
    startLocation,
  }: {
    startLocation: { latitude: number; longitude: number } | null;
  }) => {
    if (driverDbId === null) {
      Alert.alert('Trip start unavailable', 'Sign in again before starting a trip.');
      return false;
    }

    const latestNetworkState = await NetInfo.fetch();
    const hasReachableInternet = Boolean(
      latestNetworkState.isConnected && latestNetworkState.isInternetReachable !== false,
    );
    isNetworkAvailableRef.current = hasReachableInternet;
    if (!hasReachableInternet) {
      Alert.alert(
        'Internet required',
        'Connect to the internet before starting a trip. You can still finish an active trip if the connection drops later.',
      );
      return false;
    }

    if (!hasSupabaseConfig) {
      Alert.alert(
        'Trip start unavailable',
        'The app is not connected to the trip server yet, so a new trip cannot start.',
      );
      return false;
    }

    const localTripId = `trip-${driverDbId}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const startPromise = startTrip(
      driverDbId,
      startLocation?.latitude,
      startLocation?.longitude,
    );
    activeTripStartPromiseRef.current = startPromise.then(({ tripId, error }) => {
      if (error || !tripId) {
        return null;
      }
      return tripId;
    });

    const { tripId, error } = await startPromise;
    if (error || !tripId) {
      Alert.alert(
        'Trip start unavailable',
        isRecoverableConnectivityError(error ?? '')
          ? 'Internet is required to start a trip. Check your connection, then try again.'
          : error ?? 'The trip server did not create a trip. Try again before driving.',
      );
      activeTripStartPromiseRef.current = null;
      return false;
    }

    const serverTripId = Number(tripId);
    if (!Number.isFinite(serverTripId)) {
      Alert.alert('Trip start unavailable', `The trip server returned an invalid trip id (${tripId}).`);
      activeTripStartPromiseRef.current = null;
      return false;
    }

    pushNotification({
      category: 'trip',
      title: 'Trip started',
      message: 'Your live trip is now active and route tracking has started.',
      icon: 'map',
      target: { screen: 'tripNavigation' },
      dedupeKey: `trip-started-${tripId}`,
    });
    setActiveLocalTripId(localTripId);
    setActiveTripDbId(tripId);
    setRestoredTripTrace(null);
    lastOfflineStoredPointRef.current = null;

    await insertOfflineTripSession({
      localTripId,
      serverTripId,
      driverId: driverDbId,
      startedAt,
      startLatitude: startLocation?.latitude ?? null,
      startLongitude: startLocation?.longitude ?? null,
    });
    await insertOfflineTripStatusEvent({
      localTripId,
      serverTripId,
      driverId: driverDbId,
      status: 'trip_started',
      recordedAt: startedAt,
      latitude: startLocation?.latitude ?? null,
      longitude: startLocation?.longitude ?? null,
      payload: {
        localTripId,
        serverTripId,
        driverId: driverDbId,
        driverCode: profileDriverCode,
        tricycleNumber: profileDriverCode,
        plateNumber: profilePlateNumber,
        startedAt,
        startPoint: startLocation,
        tripStatus: 'ONGOING',
      },
    });
    await refreshOfflineQueueStatus();
    await attachTripRoutesToServerTrip(localTripId, serverTripId);
    activeTripStartPromiseRef.current = Promise.resolve(tripId);
    return true;
  };

  const handleTrackingGeofenceExit = ({ location }: { location: { latitude: number; longitude: number } | null }) => {
    if (driverDbId === null) {
      return;
    }

    const nowMs = Date.now();
    const lastFeedbackAtMs = lastGeofenceViolationFeedbackAtRef.current ?? 0;
    const shouldTriggerViolationFeedback = nowMs - lastFeedbackAtMs >= 5000;

    if (shouldTriggerViolationFeedback) {
      lastGeofenceViolationFeedbackAtRef.current = nowMs;
      Vibration.cancel();
      Vibration.vibrate([0, 400, 150, 400, 150, 400, 150, 400, 150, 400, 150, 400], false);
      Alert.alert(
        'Geofence violation detected',
        'You exited the authorized Obrero geofence during an active trip.',
      );
    }

    pushNotification({
      category: 'violation',
      title: 'Geofence warning',
      message:
        'Your trip point will be validated by the server and synced as an official violation if confirmed.',
      icon: 'alert-triangle',
    });
  };

  const buildRawTelemetryFromOfflinePoints = (
    offlineTripPoints: Awaited<ReturnType<typeof getOfflineTripPointsByLocalTripId>>,
  ): RawTripTelemetryPoint[] =>
    offlineTripPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speed: point.speed,
      heading: point.heading,
      accuracy: point.accuracy,
      altitude: point.altitude,
      provider: point.provider,
      recordedAt: point.recorded_at,
    }));

  const buildCompletedTripHistoryRecord = ({
    id,
    tripDate,
    fare,
    durationSeconds,
    routePath,
    rawTelemetry,
    rawStartPoint,
    rawEndPoint,
    matchedStartPoint,
    matchedEndPoint,
    dashedStartConnector = [],
    dashedEndConnector = [],
    syncStatus,
    tripState,
    matchedPointCount,
    offlineSegmentsCount,
    averageSpeedKph,
    maxSpeedKph,
    idleDurationSeconds,
    gpsQualitySummary,
    routeMatchSummary,
    startDisplayName,
    endDisplayName,
    startCoordinate,
    endCoordinate,
    startedAt,
    endedAt,
    distanceKm,
  }: {
    id: string;
    tripDate: string;
    fare: number;
    durationSeconds: number;
    routePath: Array<{ latitude: number; longitude: number }>;
    rawTelemetry?: RawTripTelemetryPoint[];
    rawStartPoint?: { latitude: number; longitude: number } | null;
    rawEndPoint?: { latitude: number; longitude: number } | null;
    matchedStartPoint?: { latitude: number; longitude: number } | null;
    matchedEndPoint?: { latitude: number; longitude: number } | null;
    dashedStartConnector?: Array<{ latitude: number; longitude: number }>;
    dashedEndConnector?: Array<{ latitude: number; longitude: number }>;
    syncStatus: 'SYNC_PENDING' | 'SYNCED';
    tripState:
      | 'IDLE'
      | 'TRIP_STARTING'
      | 'PRE_ROAD'
      | 'ON_ROAD'
      | 'TRIP_ENDING'
      | 'COMPLETED'
      | 'SYNC_PENDING'
      | 'SYNCED';
    matchedPointCount?: number;
    offlineSegmentsCount?: number;
    averageSpeedKph?: number | null;
    maxSpeedKph?: number | null;
    idleDurationSeconds?: number;
    gpsQualitySummary?: TripGpsQualitySummary | null;
    routeMatchSummary?: import('./lib/tripTransactions').TripRouteMatchSummary | null;
    startDisplayName?: string | null;
    endDisplayName?: string | null;
    startCoordinate?: { latitude: number; longitude: number } | null;
    endCoordinate?: { latitude: number; longitude: number } | null;
    startedAt?: string | null;
    endedAt?: string | null;
    distanceKm?: number | null;
  }) =>
    buildTripHistoryItem({
      id,
      tripDate,
      fare,
      durationSeconds,
      matchedRoutePath: routePath,
      rawTelemetry,
      rawStartPoint: rawStartPoint ?? null,
      rawEndPoint: rawEndPoint ?? null,
      matchedStartPoint: matchedStartPoint ?? routePath[0] ?? null,
      matchedEndPoint: matchedEndPoint ?? routePath.at(-1) ?? null,
      dashedStartConnector,
      dashedEndConnector,
      syncStatus,
      tripState,
      driverName: profileName,
      driverCode: profileDriverCode,
      vehiclePlateNumber: profilePlateNumber,
      matchedPointCount,
      offlineSegmentsCount,
      averageSpeedKph,
      maxSpeedKph,
      idleDurationSeconds,
      gpsQualitySummary,
      routeMatchSummary,
      startDisplayName,
      endDisplayName,
      startCoordinate,
      endCoordinate,
      startedAt,
      endedAt,
      distanceKm,
    });

  const handleTrackingTripComplete = (payload: TripCompletionPayload) => {
    const { fare, distanceKm, durationSeconds, endLocation } = payload;
    const routeMatchSummary = payload.routeMatchSummary ?? null;
    const preserveDetailedRouteGeometry = shouldPreserveDetailedRouteGeometry(routeMatchSummary);
    const routePath = Array.isArray((payload as { routePath?: unknown }).routePath)
      ? ((payload as { routePath?: Array<{ latitude: number; longitude: number }> }).routePath ?? [])
      : [];
    setTotalEarnings((prev) => prev + fare);
    setTotalTrips((prev) => prev + 1);
    setTotalDistanceKm((prev) => prev + distanceKm);
    setTotalMinutes((prev) => prev + durationSeconds / 60);
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationLabel = mins > 0 ? `${mins} min` : `${secs} sec`;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const tripDate = `${yyyy}-${mm}-${dd}`;
    const completedTripNotificationId = activeTripDbId
      ? `TRIP-${activeTripDbId}`
      : activeLocalTripId
        ? `TRIP-${activeLocalTripId}`
        : null;
    pushNotification({
      category: 'trip',
      title: 'Trip completed',
      message: `Trip saved with ${distanceKm.toFixed(2)} km travelled and ${fare.toFixed(2)} fare recorded.`,
      icon: 'check-circle',
      target: { screen: 'trip', itemId: completedTripNotificationId },
      dedupeKey: `trip-completed-${completedTripNotificationId ?? payload.startedAt ?? 'local'}`,
    });

    if (driverDbId === null) {
      const optimisticRoutePath = buildOptimisticTripRoutePath({
        routePath,
        rawTelemetry: payload.rawTelemetry,
        routeMatchSummary,
      });
      void (async () => {
        const optimisticTripId = buildTripHistoryId({
          fallbackOrdinal: tripHistoryRef.current.length + 1,
        });
        const optimisticHistoryItem = buildCompletedTripHistoryRecord({
          id: optimisticTripId,
          tripDate,
          fare,
          durationSeconds,
          distanceKm,
          startedAt: payload.startedAt ?? payload.rawTelemetry?.[0]?.recordedAt ?? null,
          endedAt: payload.endedAt ?? payload.rawTelemetry?.at(-1)?.recordedAt ?? null,
          routePath: optimisticRoutePath,
          rawTelemetry: payload.rawTelemetry,
          rawStartPoint:
            payload.rawStartPoint ??
            (payload.rawTelemetry?.[0]
              ? {
                  latitude: payload.rawTelemetry[0].latitude,
                  longitude: payload.rawTelemetry[0].longitude,
                }
              : optimisticRoutePath[0] ?? null),
          rawEndPoint:
            payload.rawEndPoint ??
            (payload.rawTelemetry?.at(-1)
              ? {
                  latitude: payload.rawTelemetry.at(-1)!.latitude,
                  longitude: payload.rawTelemetry.at(-1)!.longitude,
                }
              : endLocation),
          matchedStartPoint: payload.matchedStartPoint ?? optimisticRoutePath[0] ?? null,
          matchedEndPoint: payload.matchedEndPoint ?? optimisticRoutePath.at(-1) ?? null,
          dashedStartConnector: payload.dashedStartConnector ?? [],
          syncStatus: 'SYNC_PENDING',
          tripState: 'COMPLETED',
          matchedPointCount: payload.matchedPointCount,
          offlineSegmentsCount: payload.offlineSegmentsCount ?? 0,
          averageSpeedKph: payload.averageSpeedKph ?? null,
          maxSpeedKph: payload.maxSpeedKph ?? null,
          idleDurationSeconds: payload.idleDurationSeconds,
          gpsQualitySummary: payload.gpsQualitySummary ?? null,
          routeMatchSummary,
          startDisplayName: payload.startDisplayName ?? null,
          endDisplayName: payload.endDisplayName ?? null,
          startCoordinate: payload.startCoordinate ?? null,
          endCoordinate: payload.endCoordinate ?? null,
        });
        setTripHistory((prev) => upsertTripHistoryItems(prev, [optimisticHistoryItem]));

        const reconstruction = await reconstructCompletedTripPath(
          payload.rawTelemetry ??
            routePath.map((point) => ({
              ...point,
              recordedAt: new Date().toISOString(),
            })),
        );
        console.info('[TripReconstruction] Local completed trip reconstruction.', {
          status: reconstruction.status,
          provider: reconstruction.matchedProvider,
          rawAcceptedPoints: reconstruction.rawAcceptedPath.length,
          smoothedPoints: reconstruction.smoothedAcceptedPath.length,
          preprocessedPoints: reconstruction.preprocessedPath.length,
          reconstructedPoints: reconstruction.reconstructedPath.length,
          rejectedOutliers: reconstruction.rejectedOutlierCount,
        });
        const reconstructedMatchedPath = normalizeSavedRoutePath(
          reconstruction.reconstructedPath,
          optimisticRoutePath,
          {
            preserveDetailedGeometry:
              preserveDetailedRouteGeometry ||
              shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
          },
        );
        const resolvedRoutePath =
          reconstruction.status === 'matched' && reconstructedMatchedPath.length > 1
            ? reconstructedMatchedPath
            : normalizeSavedRoutePath(reconstruction.reconstructedPath, optimisticRoutePath, {
                preserveDetailedGeometry:
                  preserveDetailedRouteGeometry ||
                  shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
              });
        const preferredLocalRouteMatchSummary = pickPreferredRouteMatchSummary(
          reconstruction.routeMatchMetadata ?? null,
          routeMatchSummary,
        );
        const roadAlignedRoutePath = await buildRoadAlignedRoutePath({
          candidatePath:
            resolvedRoutePath.length > 2
              ? resolvedRoutePath
              : reconstruction.status === 'matched' && reconstruction.reconstructedPath.length > 1
                ? reconstruction.reconstructedPath
                : reconstruction.rawAcceptedPath.length > 1
                ? reconstruction.rawAcceptedPath
                : resolvedRoutePath,
          fallbackPath: resolvedRoutePath.length > 1 ? resolvedRoutePath : optimisticRoutePath,
          preserveDetailedGeometry:
            preserveDetailedRouteGeometry ||
            shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
          trustCandidateGeometry:
            resolvedRoutePath.length > 1 &&
            (shouldPreserveDetailedRouteGeometry(preferredLocalRouteMatchSummary) ||
              reconstruction.preprocessedPath.length > 1 ||
              reconstruction.rawAcceptedPath.length > 1),
        });
        const finalLocalRouteMatchSummary = pickPreferredRouteMatchSummary(
          reconstruction.routeMatchMetadata ?? null,
          routeMatchSummary,
        );
        const finalLocalRawEndPoint =
          payload.rawEndPoint ??
          (payload.rawTelemetry?.at(-1)
            ? {
                latitude: payload.rawTelemetry.at(-1)!.latitude,
                longitude: payload.rawTelemetry.at(-1)!.longitude,
              }
            : endLocation);
        const finalLocalEndpointState = await resolveFinalizedTripEndpointState({
          routePath: roadAlignedRoutePath,
          rawEndPoint: finalLocalRawEndPoint,
        });
        const finalLocalStartEndpointState = await resolveFinalizedTripStartEndpointState({
          routePath: roadAlignedRoutePath,
          rawStartPoint: payload.rawStartPoint ?? null,
        });
        const finalLocalMatchedStartPoint =
          finalLocalStartEndpointState.matchedStartPoint ??
          roadAlignedRoutePath[0] ??
          payload.matchedStartPoint ??
          resolvedRoutePath[0] ??
          null;
        const finalLocalMatchedEndPoint =
          finalLocalEndpointState.matchedEndPoint ??
          roadAlignedRoutePath.at(-1) ??
          payload.matchedEndPoint ??
          resolvedRoutePath.at(-1) ??
          null;
        const finalLocalLabels = await resolveTripDisplayLocationLabels({
          matchedStartPoint: finalLocalMatchedStartPoint,
          matchedEndPoint: finalLocalMatchedEndPoint,
          routePath: roadAlignedRoutePath,
          filteredStartPoint: payload.rawStartPoint ?? null,
          filteredEndPoint: finalLocalRawEndPoint,
        });
        setTripHistory((prev) =>
          upsertTripHistoryItems(prev, [
            buildCompletedTripHistoryRecord({
              id: optimisticTripId,
              tripDate,
              fare,
              durationSeconds,
              distanceKm,
              startedAt: payload.startedAt ?? payload.rawTelemetry?.[0]?.recordedAt ?? null,
              endedAt: payload.endedAt ?? payload.rawTelemetry?.at(-1)?.recordedAt ?? null,
              routePath: roadAlignedRoutePath,
              rawTelemetry: payload.rawTelemetry,
              rawStartPoint:
                payload.rawStartPoint ??
                (payload.rawTelemetry?.[0]
                  ? {
                      latitude: payload.rawTelemetry[0].latitude,
                      longitude: payload.rawTelemetry[0].longitude,
                    }
                  : null),
              rawEndPoint:
                finalLocalRawEndPoint,
              matchedStartPoint: finalLocalMatchedStartPoint,
              matchedEndPoint: finalLocalMatchedEndPoint,
              dashedStartConnector:
                finalLocalStartEndpointState.dashedStartConnector.length > 0
                  ? finalLocalStartEndpointState.dashedStartConnector
                  : payload.dashedStartConnector ?? [],
              dashedEndConnector: finalLocalEndpointState.dashedEndConnector,
              syncStatus: 'SYNC_PENDING',
              tripState: 'COMPLETED',
              matchedPointCount: payload.matchedPointCount ?? roadAlignedRoutePath.length,
              offlineSegmentsCount: payload.offlineSegmentsCount ?? 0,
              averageSpeedKph: payload.averageSpeedKph ?? null,
              maxSpeedKph: payload.maxSpeedKph ?? null,
              idleDurationSeconds: payload.idleDurationSeconds,
              gpsQualitySummary: payload.gpsQualitySummary ?? null,
              routeMatchSummary: finalLocalRouteMatchSummary,
              startDisplayName: finalLocalLabels.startDisplayName,
              endDisplayName: finalLocalLabels.endDisplayName,
              startCoordinate: finalLocalLabels.startCoordinate,
              endCoordinate: finalLocalLabels.endCoordinate,
            }),
          ]),
        );
      })();
      return;
    }

    void (async () => {
      const localTripId = activeLocalTripId;
      const optimisticTripId = buildTripHistoryId({
        serverTripId: activeTripDbId,
        localTripId,
        fallbackOrdinal: tripHistoryRef.current.length + 1,
      });
      const optimisticRoutePath = buildOptimisticTripRoutePath({
        routePath,
        rawTelemetry: payload.rawTelemetry,
        routeMatchSummary,
      });
      const shouldAttemptImmediateSync = hasSupabaseConfig && isNetworkAvailableRef.current;
      setTripHistory((prev) =>
        upsertTripHistoryItems(prev, [
          buildCompletedTripHistoryRecord({
            id: optimisticTripId,
            tripDate,
            fare,
            durationSeconds,
            distanceKm,
            startedAt: payload.startedAt ?? payload.rawTelemetry?.[0]?.recordedAt ?? null,
            endedAt: payload.endedAt ?? payload.rawTelemetry?.at(-1)?.recordedAt ?? null,
            routePath: optimisticRoutePath,
            rawTelemetry: payload.rawTelemetry,
            rawStartPoint:
              payload.rawStartPoint ??
              (payload.rawTelemetry?.[0]
                ? {
                    latitude: payload.rawTelemetry[0].latitude,
                    longitude: payload.rawTelemetry[0].longitude,
                  }
                : optimisticRoutePath[0] ?? null),
            rawEndPoint:
              payload.rawEndPoint ??
              (payload.rawTelemetry?.at(-1)
                ? {
                    latitude: payload.rawTelemetry.at(-1)!.latitude,
                    longitude: payload.rawTelemetry.at(-1)!.longitude,
                  }
                : endLocation),
            matchedStartPoint: payload.matchedStartPoint ?? optimisticRoutePath[0] ?? null,
            matchedEndPoint: payload.matchedEndPoint ?? optimisticRoutePath.at(-1) ?? null,
            dashedStartConnector: payload.dashedStartConnector ?? [],
            syncStatus: shouldAttemptImmediateSync ? 'SYNCED' : 'SYNC_PENDING',
            tripState: shouldAttemptImmediateSync ? 'COMPLETED' : 'SYNC_PENDING',
            matchedPointCount: payload.matchedPointCount ?? optimisticRoutePath.length,
            offlineSegmentsCount: payload.offlineSegmentsCount ?? 0,
            averageSpeedKph: payload.averageSpeedKph ?? null,
            maxSpeedKph: payload.maxSpeedKph ?? null,
            idleDurationSeconds: payload.idleDurationSeconds,
            gpsQualitySummary: payload.gpsQualitySummary ?? null,
            routeMatchSummary,
            startDisplayName: payload.startDisplayName ?? null,
            endDisplayName: payload.endDisplayName ?? null,
            startCoordinate: payload.startCoordinate ?? null,
            endCoordinate: payload.endCoordinate ?? null,
          }),
        ]),
      );

      const endedAt = new Date().toISOString();
      const offlineTripPoints = localTripId
        ? await getOfflineTripPointsByLocalTripId(localTripId)
        : [];
      const offlineMatchedPoints = localTripId
        ? await getOfflineMatchedTripPointsByLocalTripId(localTripId)
        : [];
      const offlineStatusEvents = localTripId
        ? await getOfflineTripStatusEventsByLocalTripId(localTripId)
        : [];
      const rawTelemetry =
        offlineTripPoints.length > 0
          ? buildRawTelemetryFromOfflinePoints(offlineTripPoints)
          : (payload.rawTelemetry ??
            routePath.map((point) => ({
              ...point,
              recordedAt: new Date().toISOString(),
            })));
      const reconstruction = await reconstructCompletedTripPath(
        rawTelemetry,
      );
      console.info('[TripReconstruction] Completed trip reconstruction.', {
        localTripId,
        status: reconstruction.status,
        provider: reconstruction.matchedProvider,
        rawAcceptedPoints: reconstruction.rawAcceptedPath.length,
        reconstructedPoints: reconstruction.reconstructedPath.length,
      });
      const locallyMatchedPath = buildPreferredOfflineMatchedPath(offlineMatchedPoints);
      const reconstructedMatchedPath = normalizeSavedRoutePath(
        reconstruction.reconstructedPath,
        dedupeSequentialRoutePoints(routePath),
        {
          preserveDetailedGeometry:
            preserveDetailedRouteGeometry ||
            shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
        },
      );
      const resolvedRoutePath =
        reconstruction.status === 'matched' && reconstructedMatchedPath.length > 1
          ? reconstructedMatchedPath
          : locallyMatchedPath.length > 1
          ? locallyMatchedPath
          : normalizeSavedRoutePath(
              reconstruction.reconstructedPath,
              buildOptimisticTripRoutePath({
                routePath,
                rawTelemetry,
                routeMatchSummary,
              }),
              {
                preserveDetailedGeometry:
                  preserveDetailedRouteGeometry ||
                  shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
              },
            );
      const finalRouteMatchSummary = pickPreferredRouteMatchSummary(
        reconstruction.routeMatchMetadata ?? null,
        routeMatchSummary,
      );
      const roadAlignedRoutePath = await buildRoadAlignedRoutePath({
        candidatePath:
          resolvedRoutePath.length > 2
            ? resolvedRoutePath
            : reconstruction.status === 'matched' && reconstruction.reconstructedPath.length > 1
              ? reconstruction.reconstructedPath
              : reconstruction.rawAcceptedPath.length > 1
                ? reconstruction.rawAcceptedPath
                : resolvedRoutePath,
        fallbackPath:
          resolvedRoutePath.length > 1
            ? resolvedRoutePath
            : buildOptimisticTripRoutePath({
                routePath,
                rawTelemetry,
                routeMatchSummary,
              }),
        preserveDetailedGeometry:
          preserveDetailedRouteGeometry ||
          shouldPreserveDetailedRouteGeometry(reconstruction.routeMatchMetadata),
        trustCandidateGeometry:
          resolvedRoutePath.length > 1 &&
          (shouldPreserveDetailedRouteGeometry(finalRouteMatchSummary) ||
            reconstruction.preprocessedPath.length > 1 ||
            reconstruction.rawAcceptedPath.length > 1),
      });
      const rawStartPoint =
        offlineTripPoints[0]
          ? { latitude: offlineTripPoints[0].latitude, longitude: offlineTripPoints[0].longitude }
          : payload.rawTelemetry?.[0]
            ? {
                latitude: payload.rawTelemetry[0].latitude,
                longitude: payload.rawTelemetry[0].longitude,
              }
            : null;
      const rawEndPoint =
        offlineTripPoints.length > 0
          ? {
              latitude: offlineTripPoints[offlineTripPoints.length - 1].latitude,
              longitude: offlineTripPoints[offlineTripPoints.length - 1].longitude,
            }
          : payload.rawTelemetry?.at(-1)
            ? {
                latitude: payload.rawTelemetry.at(-1)!.latitude,
                longitude: payload.rawTelemetry.at(-1)!.longitude,
              }
            : endLocation;
      const finalizedEndpointState = await resolveFinalizedTripEndpointState({
        routePath: roadAlignedRoutePath,
        rawEndPoint,
      });
      const finalizedStartEndpointState = await resolveFinalizedTripStartEndpointState({
        routePath: roadAlignedRoutePath,
        rawStartPoint,
      });
      const finalMatchedStartPoint =
        finalizedStartEndpointState.matchedStartPoint ??
        roadAlignedRoutePath[0] ??
        payload.matchedStartPoint ??
        resolvedRoutePath[0] ??
        null;
      const finalMatchedEndPoint =
        finalizedEndpointState.matchedEndPoint ??
        roadAlignedRoutePath.at(-1) ??
        payload.matchedEndPoint ??
        resolvedRoutePath.at(-1) ??
        null;
      const tripDisplayLabels = await resolveTripDisplayLocationLabels({
        matchedStartPoint: finalMatchedStartPoint,
        matchedEndPoint: finalMatchedEndPoint,
        routePath: roadAlignedRoutePath,
        filteredStartPoint: rawStartPoint,
        filteredEndPoint: rawEndPoint,
      });
      const finalMatchedPointCount = Math.max(
        roadAlignedRoutePath.length,
        payload.matchedPointCount ?? 0,
        finalRouteMatchSummary?.matchedPointCount ?? 0,
        offlineMatchedPoints.length,
      );
      const finalMatchedPointSource: OfflineMatchedPointSource =
        shouldPreserveDetailedRouteGeometry(finalRouteMatchSummary)
          ? 'reconstructed'
          : 'local-fallback';
      const reconstructedOfflineMatchedPoints =
        localTripId && driverDbId !== null && roadAlignedRoutePath.length > 1
          ? buildMatchedTracePointsFromSegment({
              path: roadAlignedRoutePath,
              rawSamples: rawTelemetry,
              source: finalMatchedPointSource,
            }).map((point) => ({
              localTripId,
              serverTripId: activeTripDbId ? Number(activeTripDbId) : null,
              driverId: driverDbId,
              latitude: point.latitude,
              longitude: point.longitude,
              recordedAt: point.recordedAt,
              matchSource: point.source,
            }))
          : [];
      const offlineSegmentsCount =
        payload.offlineSegmentsCount ??
        countOfflineSegments(offlineTripPoints.map((point) => point.capture_status));
      const fallbackTripState = shouldAttemptImmediateSync ? 'COMPLETED' : 'SYNC_PENDING';

      setTripHistory((prev) =>
        upsertTripHistoryItems(prev, [
          buildCompletedTripHistoryRecord({
            id: optimisticTripId,
            tripDate,
            fare,
            durationSeconds,
            distanceKm,
            startedAt: rawTelemetry[0]?.recordedAt ?? payload.startedAt ?? null,
            endedAt,
            routePath: roadAlignedRoutePath,
            rawTelemetry,
            rawStartPoint,
            rawEndPoint,
            matchedStartPoint: finalMatchedStartPoint,
            matchedEndPoint: finalMatchedEndPoint,
            dashedStartConnector:
              finalizedStartEndpointState.dashedStartConnector.length > 0
                ? finalizedStartEndpointState.dashedStartConnector
                : payload.dashedStartConnector ?? [],
            dashedEndConnector: finalizedEndpointState.dashedEndConnector,
            syncStatus: shouldAttemptImmediateSync ? 'SYNCED' : 'SYNC_PENDING',
            tripState: fallbackTripState,
            matchedPointCount: finalMatchedPointCount,
            offlineSegmentsCount,
            averageSpeedKph: payload.averageSpeedKph ?? null,
            maxSpeedKph: payload.maxSpeedKph ?? null,
            idleDurationSeconds: payload.idleDurationSeconds,
            gpsQualitySummary: payload.gpsQualitySummary ?? null,
            routeMatchSummary: finalRouteMatchSummary,
            startDisplayName: tripDisplayLabels.startDisplayName,
            endDisplayName: tripDisplayLabels.endDisplayName,
            startCoordinate: tripDisplayLabels.startCoordinate,
            endCoordinate: tripDisplayLabels.endCoordinate,
          }),
        ]),
      );

      if (localTripId) {
        if (reconstructedOfflineMatchedPoints.length > 0) {
          await insertOfflineMatchedTripPoints(reconstructedOfflineMatchedPoints);
        }
        await completeOfflineTripSession({
          localTripId,
          endLatitude: finalMatchedEndPoint?.latitude ?? rawEndPoint?.latitude ?? null,
          endLongitude: finalMatchedEndPoint?.longitude ?? rawEndPoint?.longitude ?? null,
          endedAt,
          fare,
          distanceKm,
          durationSeconds,
        });
        await insertOfflineTripStatusEvent({
          localTripId,
          serverTripId: activeTripDbId ? Number(activeTripDbId) : null,
          driverId: driverDbId,
          status: 'trip_completed',
          recordedAt: endedAt,
          latitude: finalMatchedEndPoint?.latitude ?? rawEndPoint?.latitude ?? null,
          longitude: finalMatchedEndPoint?.longitude ?? rawEndPoint?.longitude ?? null,
          payload: {
            localTripId,
            serverTripId: activeTripDbId ? Number(activeTripDbId) : null,
            driverId: driverDbId,
            driverCode: profileDriverCode,
            tricycleNumber: profileDriverCode,
            plateNumber: profilePlateNumber,
            startedAt: rawTelemetry[0]?.recordedAt ?? payload.startedAt ?? null,
            endedAt,
            tripStatus: 'COMPLETED',
            syncStatus: shouldAttemptImmediateSync ? 'SYNCED' : 'SYNC_PENDING',
            fare,
            distanceKm,
            durationSeconds,
            rawStartPoint,
            rawEndPoint,
            matchedStartPoint: finalMatchedStartPoint,
            matchedEndPoint: finalMatchedEndPoint,
            startDisplayName: tripDisplayLabels.startDisplayName,
            endDisplayName: tripDisplayLabels.endDisplayName,
            startCoordinate: tripDisplayLabels.startCoordinate,
            endCoordinate: tripDisplayLabels.endCoordinate,
            routePath: roadAlignedRoutePath,
            routeMatchSummary: finalRouteMatchSummary,
            gpsQualitySummary: payload.gpsQualitySummary ?? null,
            rawTelemetry,
            offlineSegmentsCount,
            matchedPointCount: finalMatchedPointCount,
            rawGpsPointCount: rawTelemetry.length,
            averageSpeedKph: payload.averageSpeedKph ?? null,
            maxSpeedKph: payload.maxSpeedKph ?? null,
            idleDurationSeconds: payload.idleDurationSeconds ?? null,
            compliance: 100,
            violations: '0',
            statusEvents: offlineStatusEvents.length,
          },
        });
        await refreshOfflineQueueStatus();
      }

      if (!hasSupabaseConfig || !isNetworkAvailableRef.current) {
        clearActiveTripState();
        return;
      }

      const markOptimisticTripUnsynced = () => {
        setTripHistory((prev) =>
          upsertTripHistoryItems(prev, [
            buildCompletedTripHistoryRecord({
              id: optimisticTripId,
              tripDate,
              fare,
              durationSeconds,
              distanceKm,
              startedAt: rawTelemetry[0]?.recordedAt ?? payload.startedAt ?? null,
              endedAt,
              routePath: roadAlignedRoutePath,
              rawTelemetry,
              rawStartPoint,
              rawEndPoint,
              matchedStartPoint: finalMatchedStartPoint,
              matchedEndPoint: finalMatchedEndPoint,
              dashedStartConnector:
                finalizedStartEndpointState.dashedStartConnector.length > 0
                  ? finalizedStartEndpointState.dashedStartConnector
                  : payload.dashedStartConnector ?? [],
              dashedEndConnector: finalizedEndpointState.dashedEndConnector,
              syncStatus: 'SYNC_PENDING',
              tripState: 'SYNC_PENDING',
              matchedPointCount: finalMatchedPointCount,
              offlineSegmentsCount,
              averageSpeedKph: payload.averageSpeedKph ?? null,
              maxSpeedKph: payload.maxSpeedKph ?? null,
              idleDurationSeconds: payload.idleDurationSeconds,
              gpsQualitySummary: payload.gpsQualitySummary ?? null,
              routeMatchSummary: finalRouteMatchSummary,
              startDisplayName: tripDisplayLabels.startDisplayName,
              endDisplayName: tripDisplayLabels.endDisplayName,
              startCoordinate: tripDisplayLabels.startCoordinate,
              endCoordinate: tripDisplayLabels.endCoordinate,
            }),
          ]),
        );
      };

      const startLocation =
        roadAlignedRoutePath.length > 0
          ? { latitude: roadAlignedRoutePath[0].latitude, longitude: roadAlignedRoutePath[0].longitude }
          : null;
      const resolvedTripId =
        activeTripDbId ?? (await activeTripStartPromiseRef.current?.catch(() => null)) ?? null;
      const tripId =
        resolvedTripId ??
        (await (async () => {
          const { tripId, error } = await startTrip(
            driverDbId,
            startLocation?.latitude,
            startLocation?.longitude,
          );
          if (error) {
            if (isRecoverableConnectivityError(error)) {
              return null;
            }
            if (isTemporarilyIgnorableRouteError(error)) {
              return null;
            }
            Alert.alert('Trip Sync Error', error);
            return null;
          }
          if (tripId && localTripId) {
            const serverTripId = Number(tripId);
            if (Number.isFinite(serverTripId)) {
              await attachServerTripIdToOfflineTrip(localTripId, serverTripId);
              await attachTripRoutesToServerTrip(localTripId, serverTripId);
            }
          }
          return tripId;
        })());

      if (!tripId) {
        markOptimisticTripUnsynced();
        return;
      }

      const resolvedEndLat =
        finalizedEndpointState.matchedEndPoint?.latitude ?? endLocation?.latitude ?? startLocation?.latitude;
      const resolvedEndLng =
        finalizedEndpointState.matchedEndPoint?.longitude ?? endLocation?.longitude ?? startLocation?.longitude;
      if (typeof resolvedEndLat !== 'number' || typeof resolvedEndLng !== 'number') {
        markOptimisticTripUnsynced();
        return;
      }

      const { error } = await completeTrip({
        tripId,
        endLat: resolvedEndLat,
        endLng: resolvedEndLng,
        distanceKm,
        fare,
        durationSeconds,
        routePoints: roadAlignedRoutePath,
        routeMatchSummary: finalRouteMatchSummary,
        gpsQualitySummary: payload.gpsQualitySummary ?? null,
        matchedPointCount: finalMatchedPointCount,
        rawGpsPointCount: rawTelemetry.length,
        rawStartPoint,
        matchedStartPoint: finalMatchedStartPoint,
        rawEndPoint,
        matchedEndPoint: finalMatchedEndPoint,
        startDisplayName: tripDisplayLabels.startDisplayName,
        endDisplayName: tripDisplayLabels.endDisplayName,
        startCoordinate: tripDisplayLabels.startCoordinate,
        endCoordinate: tripDisplayLabels.endCoordinate,
        dashedStartConnector:
          finalizedStartEndpointState.dashedStartConnector.length > 0
            ? finalizedStartEndpointState.dashedStartConnector
            : payload.dashedStartConnector ?? [],
        dashedEndConnector: finalizedEndpointState.dashedEndConnector,
        offlineSegmentsCount,
        endpointSelectionSummary: finalizedEndpointState.endpointSelectionSummary,
      });

      if (error) {
        if (!isRecoverableConnectivityError(error)) {
          Alert.alert('Trip Sync Error', error);
        }
        markOptimisticTripUnsynced();
        clearActiveTripState();
        return;
      }

      if (localTripId) {
        await markOfflineTripSessionCompletedSynced(localTripId);
      }

      const syncedHistoryId = buildTripHistoryId({
        serverTripId: tripId,
        localTripId,
        fallbackOrdinal: tripHistoryRef.current.length + 1,
      });
      setTripHistory((prev) =>
        upsertTripHistoryItems(
          optimisticTripId !== syncedHistoryId
            ? prev.filter((item) => item.id !== optimisticTripId)
            : prev,
          [
          buildCompletedTripHistoryRecord({
            id: syncedHistoryId,
            tripDate,
            fare,
            durationSeconds,
            distanceKm,
            startedAt: rawTelemetry[0]?.recordedAt ?? payload.startedAt ?? null,
            endedAt,
            routePath: roadAlignedRoutePath,
            rawTelemetry,
            rawStartPoint,
            rawEndPoint,
            matchedStartPoint: finalMatchedStartPoint,
            matchedEndPoint: finalMatchedEndPoint,
            dashedStartConnector:
              finalizedStartEndpointState.dashedStartConnector.length > 0
                ? finalizedStartEndpointState.dashedStartConnector
                : payload.dashedStartConnector ?? [],
            dashedEndConnector: finalizedEndpointState.dashedEndConnector,
            syncStatus: 'SYNCED',
            tripState: 'SYNCED',
            matchedPointCount: finalMatchedPointCount,
            offlineSegmentsCount,
            averageSpeedKph: payload.averageSpeedKph ?? null,
            maxSpeedKph: payload.maxSpeedKph ?? null,
            idleDurationSeconds: payload.idleDurationSeconds,
            gpsQualitySummary: payload.gpsQualitySummary ?? null,
            routeMatchSummary: finalRouteMatchSummary,
            startDisplayName: tripDisplayLabels.startDisplayName,
            endDisplayName: tripDisplayLabels.endDisplayName,
            startCoordinate: tripDisplayLabels.startCoordinate,
            endCoordinate: tripDisplayLabels.endCoordinate,
          }),
        ]),
      );

      clearActiveTripState();

      const refreshed = await listTripsWithRoutePoints(driverDbId, 250);
      if (!refreshed.error) {
        const previousRoutesById = new Map(
          tripHistoryRef.current.map((item) => [item.id, item]),
        );
        const mapped: TripHistoryItem[] = refreshed.trips.map((t) => {
          const fallbackTrip = previousRoutesById.get(
            `TRIP-${String(t.id).split('-')[0]?.toUpperCase() ?? String(t.id)}`,
          );
          return {
            ...mapTripRecordToHistoryItem(
              t,
              fallbackTrip
                ? fallbackTrip
                  : buildCompletedTripHistoryRecord({
                    id: syncedHistoryId,
                    tripDate,
                    fare,
                    durationSeconds,
                    distanceKm,
                    startedAt: rawTelemetry[0]?.recordedAt ?? payload.startedAt ?? null,
                    endedAt,
                    routePath: roadAlignedRoutePath,
                    rawTelemetry,
                    rawStartPoint,
                    rawEndPoint,
                    matchedStartPoint: finalMatchedStartPoint,
                    matchedEndPoint: finalMatchedEndPoint,
                    dashedStartConnector:
                      finalizedStartEndpointState.dashedStartConnector.length > 0
                        ? finalizedStartEndpointState.dashedStartConnector
                        : payload.dashedStartConnector ?? [],
                    dashedEndConnector: finalizedEndpointState.dashedEndConnector,
                    syncStatus: 'SYNCED',
                    tripState: 'SYNCED',
                    matchedPointCount: finalMatchedPointCount,
                    offlineSegmentsCount,
                    averageSpeedKph: payload.averageSpeedKph ?? null,
                    maxSpeedKph: payload.maxSpeedKph ?? null,
                    idleDurationSeconds: payload.idleDurationSeconds,
                    gpsQualitySummary: payload.gpsQualitySummary ?? null,
                    routeMatchSummary: finalRouteMatchSummary,
                    startDisplayName: tripDisplayLabels.startDisplayName,
                    endDisplayName: tripDisplayLabels.endDisplayName,
                    startCoordinate: tripDisplayLabels.startCoordinate,
                    endCoordinate: tripDisplayLabels.endCoordinate,
                  }),
            ),
            rawStartPoint: fallbackTrip?.rawStartPoint ?? null,
          };
        });
        const mergedHistory = reconcileSyncedTripHistoryItems(tripHistoryRef.current, mapped);
        tripHistoryRef.current = mergedHistory;
        setTripHistory(mergedHistory);
        const totals = computeTripTotals(mergedHistory);
        setTotalEarnings(totals.earnings);
        setTotalTrips(totals.trips);
        setTotalDistanceKm(totals.distance);
        setTotalMinutes(totals.minutes);
      }

      await syncOfflineTripPoints();
    })();
  };

  const handleDeleteTrip = async (tripId: string) => {
    const localTripId = getLocalTripIdFromHistoryId(tripId);
    const nextTripHistory = removeTripHistoryItem(tripHistoryRef.current, tripId);
    setTripHistory(nextTripHistory);
    tripHistoryRef.current = nextTripHistory;
    const totals = computeTripTotals(nextTripHistory);
    setTotalEarnings(totals.earnings);
    setTotalTrips(totals.trips);
    setTotalDistanceKm(totals.distance);
    setTotalMinutes(totals.minutes);

    if (localTripId) {
      await deleteOfflineTrip(localTripId);
      return;
    }

    if (!hasSupabaseConfig) {
      return;
    }

    const parsedTripId = Number(tripId.replace(/^TRIP-/, ''));
    if (!Number.isFinite(parsedTripId)) {
      return;
    }

    const { error } = await deleteTripFromBackend(parsedTripId);
    if (error) {
      Alert.alert('Delete Trip Error', error);
      if (driverDbId !== null) {
        await refreshTripHistoryFromBackend(driverDbId);
      }
    }
  };

  const handleRefreshTripHistory = async () => {
    if (isTripHistoryRefreshing) {
      return tripHistoryRef.current;
    }

    if (!hasSupabaseConfig) {
      throw new Error('Supabase is not configured, so pending trips cannot sync yet.');
    }

    if (!isNetworkAvailableRef.current) {
      throw new Error('The app still reports no reachable internet connection. Toggle Wi-Fi/mobile data or restart the app, then try again.');
    }

    setIsTripHistoryRefreshing(true);
    try {
      let latestHistory: TripHistoryItem[] | null = null;
      tripRouteRepairAttemptedIdsRef.current = new Set();

      const syncResult = await syncOfflineTripPoints();
      if (!syncResult.ok) {
        throw new Error(syncResult.error ?? 'Trip sync failed before the app could refresh trip history.');
      }

      if (driverDbId !== null) {
        latestHistory = await refreshTripHistoryFromBackend(driverDbId);
      }

      const repairedCount = await repairTripHistoryRoutes({
        targetDriverId: driverDbId,
        maxCount: MAX_TRIP_ROUTE_REPAIRS_PER_PASS,
      });

      if (repairedCount > 0 && driverDbId !== null) {
        latestHistory = await refreshTripHistoryFromBackend(driverDbId);
      }

      return latestHistory ?? tripHistoryRef.current;
    } finally {
      setIsTripHistoryRefreshing(false);
    }
  };

  const handleSyncPendingTrip = async (tripId: string) => {
    if (isTripHistoryRefreshing) {
      return tripHistoryRef.current;
    }

    if (!hasSupabaseConfig || !isNetworkAvailableRef.current) {
      Alert.alert(
        'Sync unavailable',
        'Connect to the internet first so this trip can sync and rerun the OSRM road match.',
      );
      return tripHistoryRef.current;
    }

    setIsTripHistoryRefreshing(true);
    try {
      const targetLocalTripIdFromHistoryId = tripId.startsWith('TRIP-trip-')
        ? getLocalTripIdFromHistoryId(tripId)
        : null;
      const targetServerTripId =
        targetLocalTripIdFromHistoryId === null ? parseServerTripIdFromHistoryId(tripId) : null;
      const targetOfflineSession =
        targetLocalTripIdFromHistoryId !== null
          ? await getOfflineTripSession(targetLocalTripIdFromHistoryId)
          : targetServerTripId !== null
            ? await getOfflineTripSessionByServerTripId(targetServerTripId)
            : null;
      const targetLocalTripId = targetOfflineSession?.local_trip_id ?? targetLocalTripIdFromHistoryId;
      if (!targetLocalTripId) {
        if (driverDbId !== null) {
          return (await refreshTripHistoryFromBackend(driverDbId)) ?? tripHistoryRef.current;
        }
        return tripHistoryRef.current;
      }

      const syncResult = await syncOfflineTripPoints(targetLocalTripId);
      const refreshedOfflineSession = await getOfflineTripSession(targetLocalTripId);
      let latestHistory =
        driverDbId !== null
          ? await refreshTripHistoryFromBackend(driverDbId)
          : tripHistoryRef.current;

      const repairedCount = await repairTripHistoryRoutes({
        targetDriverId: driverDbId,
        maxCount: MAX_TRIP_ROUTE_REPAIRS_PER_PASS,
      });
      if (repairedCount > 0 && driverDbId !== null) {
        latestHistory = await refreshTripHistoryFromBackend(driverDbId);
      }

      const syncedServerTripId =
        refreshedOfflineSession && typeof refreshedOfflineSession.server_trip_id === 'number'
          ? refreshedOfflineSession.server_trip_id
          : null;
      const didSessionFinishSync =
        syncResult.ok &&
        refreshedOfflineSession?.completed_synced === 1 &&
        syncedServerTripId !== null;
      if (didSessionFinishSync) {
        promoteOfflineHistoryItemToServerTrip({
          sourceHistoryId: tripId,
          localTripId: targetLocalTripId,
          serverTripId: syncedServerTripId,
        });
        latestHistory = tripHistoryRef.current;
      }

      const relevantPendingIds = new Set(
        [
          tripId,
          `TRIP-${targetLocalTripId}`,
          typeof refreshedOfflineSession?.server_trip_id === 'number'
            ? `TRIP-${refreshedOfflineSession.server_trip_id}`
            : null,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0),
      );
      const nextHistory = latestHistory ?? tripHistoryRef.current;
      const pendingTripStillExists = nextHistory.some(
        (item) => item.syncStatus === 'SYNC_PENDING' && relevantPendingIds.has(item.id),
      );
      if (pendingTripStillExists) {
        Alert.alert(
          'Sync did not finish',
          !targetLocalTripId
            ? 'This pending trip is missing its local sync session. Refresh trips, then try again.'
            : syncResult.ok
              ? 'This trip is still waiting to sync. Check your connection, then tap Sync now again.'
              : syncResult.error ?? 'This trip could not sync yet. Check your connection, then tap Sync now again.',
        );
      }

      return nextHistory;
    } finally {
      setIsTripHistoryRefreshing(false);
    }
  };

  const trackingScreenSharedProps = {
    onLogout: handleTrackingLogout,
    onNavigate: handleMainTabNavigate,
    totalEarnings: filteredHomeTotals.earnings,
    totalTrips: filteredHomeTotals.trips,
    totalDistanceKm: filteredHomeTotals.distance,
    totalMinutes: filteredHomeTotals.minutes,
    homeStatsFilter,
    onChangeHomeStatsFilter: setHomeStatsFilter,
    onGoOnline: () => {
      void handleGoOnline({ openTripScreen: true });
    },
    onGoOffline: handleTrackingOffline,
    onBackToHome: () => setScreen('home'),
    onRequestTripNavigation: () => {
      setForceNewTripNavigationSession(!activeLocalTripId);
      setScreen('tripNavigation');
    },
    onExitTripNavigation: () => {
      setForceNewTripNavigationSession(false);
      setScreen('trip');
    },
    isDriverOnline,
    locationEnabled: routeLocationEnabled,
    tripOpenPending: isWaitingForTripLocation,
    onLocationVisibilityChange: setIsHomeLocationVisible,
    notifications,
    unreadNotificationCount,
    onMarkNotificationRead: markNotificationRead,
    onMarkAllNotificationsRead: markAllNotificationsRead,
    onOpenNotification: handleOpenNotification,
    profileName,
    profileDriverCode,
    profilePlateNumber,
    profileImageUri,
    activeTripNumber: activeTripDbId ? `TRIP-${activeTripDbId}` : activeLocalTripId ? `TRIP-${activeLocalTripId}` : null,
    localSnapRoadPath,
    restoredTripTrace,
    isLowBatteryMapMode,
    onTripStart: handleTrackingTripStart,
    onTripPointRecord: ({
      latitude,
      longitude,
      recordedAt,
      speed,
      heading,
      accuracy,
      altitude,
      provider,
    }: {
      latitude: number;
      longitude: number;
      recordedAt: string;
      speed?: number | null;
      heading?: number | null;
      accuracy?: number | null;
      altitude?: number | null;
      provider?: string | null;
    }) => {
      if (driverDbId === null || !activeLocalTripId) {
        return;
      }

      const previousStoredPoint = lastOfflineStoredPointRef.current;
      if (
        previousStoredPoint &&
        previousStoredPoint.localTripId === activeLocalTripId &&
        distanceBetweenKm(previousStoredPoint, { latitude, longitude }) < OFFLINE_POINT_MIN_DISTANCE_KM
      ) {
        return;
      }

      const serverTripId = activeTripDbId ? Number(activeTripDbId) : null;
      lastOfflineStoredPointRef.current = {
        localTripId: activeLocalTripId,
        latitude,
        longitude,
      };
      void (async () => {
        await insertOfflineTripPoint({
          localTripId: activeLocalTripId,
          serverTripId: serverTripId !== null && Number.isFinite(serverTripId) ? serverTripId : null,
          driverId: driverDbId,
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          altitude,
          provider,
          recordedAt,
          captureStatus: isNetworkAvailableRef.current ? 'online' : 'offline',
        });
        if (isNetworkAvailableRef.current) {
          await syncOfflineTripPoints();
        } else {
          await refreshOfflineQueueStatus();
        }
      })();
    },
    onTripMatchedPathRecord: ({ points }: {
      points: Array<{
        latitude: number;
        longitude: number;
        recordedAt: string;
        source: OfflineMatchedPointSource;
      }>;
    }) => {
      if (driverDbId === null || !activeLocalTripId || points.length === 0) {
        return;
      }

      const serverTripId = activeTripDbId ? Number(activeTripDbId) : null;
      void (async () => {
        await insertOfflineMatchedTripPoints(
          points.map((point) => ({
            localTripId: activeLocalTripId,
            serverTripId: serverTripId !== null && Number.isFinite(serverTripId) ? serverTripId : null,
            driverId: driverDbId,
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: point.recordedAt,
            matchSource: point.source,
          })),
        );
        if (isNetworkAvailableRef.current) {
          await syncOfflineTripPoints();
        } else {
          await refreshOfflineQueueStatus();
        }
      })();
    },
    onTripStatusChange: ({
      status,
      recordedAt,
      latitude,
      longitude,
      metadata,
    }: {
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
    }) => {
      if (driverDbId === null || !activeLocalTripId) {
        return;
      }

      const serverTripId = activeTripDbId ? Number(activeTripDbId) : null;
      void insertOfflineTripStatusEvent({
        localTripId: activeLocalTripId,
        serverTripId: serverTripId !== null && Number.isFinite(serverTripId) ? serverTripId : null,
        driverId: driverDbId,
        status,
        recordedAt,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        payload: metadata ?? null,
      }).then(() => refreshOfflineQueueStatus());
    },
    onGeofenceExit: handleTrackingGeofenceExit,
    onTripComplete: handleTrackingTripComplete,
    styles,
  } as const;

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaInsetsContext.Consumer>
        {(insets) => {
          const bottomInset = insets?.bottom ?? 0;

          return (
      <View style={[styles.safeArea, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: undefined })}
          style={styles.grow}
        >
        <Animated.View
          style={[
            {
              flex: 1,
            },
            isNavbarFixedScreen
              ? null
              : {
                  opacity: screenTransitionOpacity,
                  transform: [{ translateY: screenTransitionTranslateY }],
                },
          ]}
        >
        {screen === 'permissionPhone' ? (
          <PermissionOnboardingScreen
            step={1}
            kind="phone"
            title="Allow access to your phone"
            description="We’ll request your device contacts permission to support account protection and trusted device setup on this phone."
            onContinue={handlePhoneOnboardingContinue}
            onSkip={handlePhoneOnboardingSkip}
            isSubmitting={isPermissionOnboardingSubmitting}
            isDarkMode={isDarkMode}
          />
        ) : screen === 'permissionLocation' ? (
          <PermissionOnboardingScreen
            step={2}
            kind="location"
            title="Allow location services"
            description="Location access improves trip accuracy and address precision so your live trips stay aligned with the road."
            onContinue={handleLocationOnboardingContinue}
            onSkip={handleLocationOnboardingSkip}
            isSubmitting={isPermissionOnboardingSubmitting}
            isDarkMode={isDarkMode}
          />
        ) : screen === 'home' ? (
          <HomeScreen {...trackingScreenSharedProps} isTripScreen={false} />
        ) : screen === 'startTrip' ? (
          <StartTripScreen {...trackingScreenSharedProps} />
        ) : screen === 'tripNavigation' ? (
          <TripNavigationScreen
            {...trackingScreenSharedProps}
            forceNewTripSession={forceNewTripNavigationSession}
            initialTripLocation={
              lastLiveSyncPointRef.current
                ? {
                    latitude: lastLiveSyncPointRef.current.latitude,
                    longitude: lastLiveSyncPointRef.current.longitude,
                    timestampMs: lastLiveSyncTimestampRef.current,
                  }
                : null
            }
          />
        ) : screen === 'trip' ? (
          <TripScreen
            onLogout={handleTrackingLogout}
            onNavigate={handleMainTabNavigate}
            tripHistory={tripHistory}
            focusTripRequest={tripNotificationFocusRequest}
            offlineQueueStatus={offlineQueueStatus}
            onDeleteTrip={handleDeleteTrip}
            onRefreshTripHistory={handleRefreshTripHistory}
            onSyncTrip={handleSyncPendingTrip}
            isRefreshingTripHistory={isTripHistoryRefreshing}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            isLowBatteryMapMode={isLowBatteryMapMode}
            activeTab="trip"
            styles={styles}
          />
        ) : screen === 'violation' ? (
          <ViolationScreen
            onLogout={handleTrackingLogout}
            onNavigate={handleMainTabNavigate}
            driverDbId={driverDbId}
            violationItems={violationItems}
            focusViolationRequest={violationNotificationFocusRequest}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            isLowBatteryMapMode={isLowBatteryMapMode}
            onViolationChanged={() => {
              if (driverDbId !== null) {
                void refreshViolationItems(driverDbId);
              }
            }}
            styles={styles}
          />
        ) : screen === 'profile' ? (
        <ProfileScreen
            onLogout={handleTrackingLogout}
            onNavigate={handleMainTabNavigate}
            profileName={profileName}
            profileDriverCode={profileDriverCode}
            profileContact={profileContact}
            profilePlateNumber={profilePlateNumber}
            profileImageUri={profileImageUri}
            profileQrId={profileQrDetails.qrId}
            profileQrIssuedAt={profileQrDetails.qrIssuedAt}
            profileQrReportPath={profileQrDetails.reportPath}
            profileQrStatus={profileQrDetails.qrStatus}
            profileQrError={profileQrError}
            isProfileQrLoading={isProfileQrLoading}
            totalViolationCount={violationItems.length}
            isLowBatteryMapMode={isLowBatteryMapMode}
            onUpdateProfile={async ({ name, contact, imageUri }) => {
              const changedFields: string[] = [];
              if (name !== profileName) {
                changedFields.push('name');
              }
              if (contact !== profileContact) {
                changedFields.push('contact number');
              }
              if (imageUri !== profileImageUri) {
                changedFields.push('profile photo');
              }

              setProfileName(name);
              setProfileContact(contact);
              setProfileImageUri(imageUri);

              const shouldUploadAvatar =
                driverDbId !== null &&
                typeof imageUri === 'string' &&
                imageUri.length > 0 &&
                !imageUri.startsWith('http://') &&
                !imageUri.startsWith('https://');

              if (shouldUploadAvatar) {
                const { publicUrl, error, warning } = await uploadDriverAvatar({
                  driverId: driverDbId,
                  localUri: imageUri,
                });

                if (publicUrl) {
                  setProfileImageUri(publicUrl);
                }

                if (warning) {
                  Alert.alert('Avatar Saved Locally', warning);
                } else if (error) {
                  Alert.alert(
                    'Avatar Saved Locally',
                    `Your profile photo was updated on this device, but it could not sync to the server yet. ${error}`,
                  );
                }
              }

              if (changedFields.length > 0) {
                pushNotification({
                  category: 'profile',
                  title: 'Profile updated',
                  message: `Updated ${changedFields.join(', ')} in your account details.`,
                  icon: 'user',
                  target: { screen: 'profile' },
                  dedupeKey: `profile-updated-${driverDbId ?? 'local'}-${changedFields.sort().join('-')}`,
                });
              }
            }}
            styles={styles}
          />
        ) : (
          <ScrollView
            style={[styles.scrollView, isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null]}
            contentContainerStyle={[
              styles.scrollContainer,
              screen === 'getStarted' && styles.scrollContainerNoTop,
            ]}
            bounces={false}
          >
              {screen === 'getStarted' ? (
                <GetStartedScreen
                  styles={styles}
                  isDarkMode={isDarkMode}
                  authText={startupAuthText}
                />
              ) : (
                <View
                  style={[
                    styles.fullScreenCard,
                    { paddingBottom: 28 + bottomInset },
                    screen === 'login' && styles.loginScreenLowered,
                    screen === 'createPassword' && styles.forgotScreenLowered,
                    isDarkMode ? { backgroundColor: MAXIM_UI_BG_DARK } : null,
                  ]}
                >
                {screen === 'createPassword' ? (
                  <Pressable
                    onPress={() => setScreen('login')}
                    style={[
                      styles.backButton,
                      isDarkMode
                        ? {
                            backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                            borderWidth: 1,
                            borderColor: MAXIM_UI_BORDER_SOFT_DARK,
                            shadowOpacity: 0,
                            elevation: 0,
                          }
                        : null,
                    ]}
                  >
                    <AppIcon
                      name="chevron-left"
                      size={20}
                      color={isDarkMode ? MAXIM_UI_TEXT_DARK : '#030318'}
                    />
                  </Pressable>
                ) : null}

                <Text
                  style={[
                    styles.title,
                    (screen === 'login' || screen === 'createPassword') &&
                      styles.loginTitleOffset,
                    (screen === 'login' ||
                      screen === 'createPassword') &&
                      styles.authTitleSmall,
                    isDarkMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                  ]}
                >
                  {content.title}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    isDarkMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                  ]}
                >
                  {content.subtitle}
                </Text>

              {screen === 'login' ? (
                <View style={styles.loginScreenFill}>
                  <LoginScreen
                    onCreatePassword={() => setScreen('createPassword')}
                    onLogin={handleDriverLogin}
                    isAuthenticating={isAuthenticating}
                    styles={themedAuthStyles}
                    isDarkMode={isDarkMode}
                  />
                </View>
                ) : null}

                {screen === 'createPassword' ? (
                  <CreatePasswordScreen
                    onBackToLogin={() => setScreen('login')}
                    onSubmit={handleCreatePassword}
                    isSubmitting={isSettingPassword}
                    styles={themedAuthStyles}
                    isDarkMode={isDarkMode}
                  />
                ) : null}
              </View>
            )}
          </ScrollView>
        )}

        <TripActionModal
          visible={showTripActionModal}
          onRequestClose={() => setShowTripActionModal(false)}
          onConfirm={confirmTripActionModal}
          onCancel={() => setShowTripActionModal(false)}
          title={tripActionModalContent.title}
          description={tripActionModalContent.description}
          confirmLabel={tripActionModalContent.confirmLabel}
          cancelLabel="Cancel"
        />
        </Animated.View>
      </KeyboardAvoidingView>

        <StatusBar
          style={isDarkMode ? 'light' : 'dark'}
          translucent={false}
          backgroundColor={isDarkMode ? MAXIM_UI_BG_DARK : '#F5F6F8'}
        />
      </View>
          );
        }}
      </SafeAreaInsetsContext.Consumer>
    </SafeAreaProvider>
  );
}

const STATUS_BAR_HEIGHT = RNStatusBar.currentHeight ?? 0;
const ACTION_BUTTON_HEIGHT = 52;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EDEFF2',
  },
  grow: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F5F6F8',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  scrollContainerNoTop: {
    paddingTop: 0,
  },
  fullScreenCard: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#F5F6F8',
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  authScreenLowered: {
    marginTop: 150,
  },
  loginScreenLowered: {
    marginTop: 50,
  },
  forgotScreenLowered: {
    marginTop: 50,
  },
  homeScreen: {
    flex: 1,
    backgroundColor: '#F3F5F7',
  },
  homeContentArea: {
    flex: 1,
  },
  homeDashboardScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 14,
  },
  homeProfileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  homeProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  homeProfileAvatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DCE5EC',
    overflow: 'hidden',
  },
  homeProfileAvatar: {
    width: '100%',
    height: '100%',
  },
  homeProfileTextWrap: {
    flex: 1,
  },
  homeProfileName: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeProfileSub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  homeProfileNotif: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F2FBF6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE5EC',
  },
  homeProfileNotifDot: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  homeEarningsCard: {
    backgroundColor: '#E8FAF1',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#C6EEDB',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeEarningsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeEarningsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeEarningsTitleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  homeEarningsPesoTiny: {
    color: '#047857',
    fontSize: 12,
    lineHeight: 13,
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsLabel: {
    fontSize: 13,
    lineHeight: 16,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  homeEarningsStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
    marginRight: 5,
  },
  homeEarningsStatusText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsValueWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  homeEarningsValue: {
    marginTop: 0,
    fontSize: 32,
    lineHeight: 38,
    color: '#065F46',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsSubText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#4B5563',
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeEarningsTrend: {
    fontSize: 12,
    lineHeight: 15,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  homeEarningsButton: {
    marginTop: 12,
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  homeEarningsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeSectionTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 12,
  },
  homePerformanceBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  homePerformanceBoardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  homePerformanceBoardTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceBoardSub: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  homePerformanceItem: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 122,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  homePerformanceItemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homePerformanceTripsCard: {
    backgroundColor: '#ECF9F3',
    borderColor: '#D0F0E2',
  },
  homePerformanceViolationsCard: {
    backgroundColor: '#FFF2F2',
    borderColor: '#FFDADA',
  },
  homePerformanceEarningsCard: {
    backgroundColor: '#FFF8E8',
    borderColor: '#FFE7B3',
  },
  homePerformanceRatingsCard: {
    backgroundColor: '#F4EEFF',
    borderColor: '#E7DAFF',
  },
  homePerformanceIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homePerformancePesoIcon: {
    fontSize: 11,
    lineHeight: 12,
    color: '#A16207',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceLabel: {
    fontSize: 15,
    lineHeight: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homePerformanceValue: {
    marginTop: 14,
    fontSize: 30,
    lineHeight: 32,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeViolationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeViolationsTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationItem: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  homeViolationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 5,
    marginRight: 10,
  },
  homeViolationDotRed: {
    backgroundColor: '#FF1E1E',
  },
  homeViolationDotGreen: {
    backgroundColor: '#18E43F',
  },
  homeViolationTextWrap: {
    flex: 1,
  },
  homeViolationMainText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationSubText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertItem: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  homeViolationAlertDanger: {
    backgroundColor: '#FFF4F4',
    borderColor: '#FFD6D6',
  },
  homeViolationAlertWarn: {
    backgroundColor: '#FFF9EE',
    borderColor: '#FFE3B5',
  },
  homeViolationAlertInfo: {
    backgroundColor: '#F6F8FF',
    borderColor: '#DDE4FF',
  },
  homeViolationAlertSuccess: {
    backgroundColor: '#F3FFF7',
    borderColor: '#CDEFD9',
  },
  homeViolationAlertTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  homeViolationAlertTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  homeViolationBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  homeViolationBadgeDanger: {
    backgroundColor: '#FF4D4D',
  },
  homeViolationBadgeWarn: {
    backgroundColor: '#E7A400',
  },
  homeViolationBadgeInfo: {
    backgroundColor: '#5B7BFF',
  },
  homeViolationBadgeSuccess: {
    backgroundColor: '#57c7a8',
  },
  homeViolationAlertTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationTag: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  homeViolationTagText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationAlertDesc: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#374151',
    fontFamily: 'CircularStdMedium500',
  },
  homeTripListSection: {
    marginTop: 14,
  },
  homeViolationsCardPro: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
  },
  homeCardHeadLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 10,
  },
  homeCardHeadIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  homeViolationsProHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeViolationsProTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProTitleWrap: {
    flex: 1,
  },
  homeViolationsProSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProBadge: {
    borderRadius: 999,
    backgroundColor: '#EAF8F1',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  homeViolationsProBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  homeViolationsProStatItem: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 3,
  },
  homeViolationsProStatValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProStatLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProList: {
    marginTop: 2,
  },
  homeViolationsProItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3F6',
  },
  homeViolationsProMarker: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },
  homeViolationsProMarkerDanger: {
    backgroundColor: '#EF4444',
  },
  homeViolationsProMarkerWarn: {
    backgroundColor: '#F59E0B',
  },
  homeViolationsProMarkerSuccess: {
    backgroundColor: '#57c7a8',
  },
  homeViolationsProTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  homeViolationsProItemTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProItemMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeViolationsProItemTag: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 15,
  },
  homeRecentTripsLedgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  homeRecentTripsLedgerTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    marginBottom: 2,
  },
  homeRecentTripsLedgerHeadText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3F6',
  },
  homeRecentTripsLedgerRowLast: {
    borderBottomWidth: 0,
  },
  homeRecentTripsLedgerLeft: {
    flex: 1,
    marginRight: 8,
  },
  homeRecentTripsLedgerRoute: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerRight: {
    alignItems: 'flex-end',
  },
  homeRecentTripsLedgerFare: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsLedgerStatus: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEEF2',
    padding: 12,
  },
  homeRecentTripsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeRecentTripsTitle: {
    fontSize: 19,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripsSeeAll: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF2F5',
  },
  homeRecentTripRowLast: {
    borderBottomWidth: 0,
  },
  homeRecentTripLeft: {
    flex: 1,
    marginRight: 8,
  },
  homeRecentTripRoute: {
    fontSize: 15,
    lineHeight: 19,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripRight: {
    alignItems: 'flex-end',
  },
  homeRecentTripFare: {
    fontSize: 13,
    lineHeight: 16,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 4,
  },
  homeRecentTripStatusPill: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  homeRecentTripStatusText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  homeRecentTripItem: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF2F5',
  },
  homeRecentTripItemLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  homeScroll: {
    paddingHorizontal: 16,
    paddingBottom: 160,
    paddingTop: 8,
  },
  homeHeaderSticky: {
    backgroundColor: '#F3F5F7',
    marginBottom: 8,
    zIndex: 10,
  },
  homeHeaderCard: {
    backgroundColor: '#57c7a8',
    borderRadius: 0,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    minHeight: 98,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'hidden',
  },
  homeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  homeAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  homeAvatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  homeAvatarStatus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#57c7a8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  homeHeaderText: {
    marginLeft: 10,
  },
  homeHeaderIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  homeWelcomeText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeName: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 26,
    fontFamily: 'CircularStdMedium500',
  },
  homeHeaderSubText: {
    color: '#FFFFFF',
    opacity: 0.95,
    fontSize: 15,
    lineHeight: 18,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeDriver: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeHeaderAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeHeaderBottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  homeLicenseLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  homeLicenseValue: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
  },
  homeAvailabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  homeAvailabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CFE0D8',
    marginRight: 6,
  },
  homeAvailabilityText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  homeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  homeCardTitle: {
    fontSize: 18,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 14,
  },
  homeOnlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  homeOnlineText: {
    fontSize: 18,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  homeOnlineSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 3,
  },
  homeOnlineSwitchDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  homeRadarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  homeRadarOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarMid: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(60,183,126,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeRadarCore: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeTripTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  homeTripTopLabel: {
    fontSize: 12,
    color: '#68737E',
    fontFamily: 'CircularStdMedium500',
  },
  homeTripTopValue: {
    fontSize: 14,
    color: '#111827',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripTimePill: {
    backgroundColor: '#EAF8F1',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  homeTripTimeText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  homeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  homeStatBox: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  homeStatTrips: {
    backgroundColor: '#ECF8F2',
  },
  homeStatEarnings: {
    backgroundColor: '#FFF5E9',
  },
  homeStatRating: {
    backgroundColor: '#F5EEFF',
  },
  homeStatViolations: {
    backgroundColor: '#FFF0F0',
  },
  homeStatValue: {
    fontSize: 13,
    fontFamily: 'CircularStdMedium500',
    marginTop: 6,
    color: '#030318',
  },
  homeStatLabel: {
    fontSize: 10,
    color: '#667085',
    fontFamily: 'CircularStdMedium500',
    marginTop: 2,
  },
  homeMapMock: {
    borderRadius: 14,
    height: 170,
    backgroundColor: '#F4F6F7',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    marginBottom: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMapView: {
    width: '100%',
    height: '100%',
  },
  homeMapOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(241,245,242,0.85)',
  },
  homeMapStatusText: {
    color: '#3A4A42',
    fontSize: 12,
    fontFamily: 'CircularStdMedium500',
  },
  homeMapIndicatorOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(59,183,126,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#57c7a8',
  },
  homeMapIndicatorInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#57c7a8',
  },
  homeMapFallbackPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -9,
    marginTop: -9,
  },
  homeMapFallbackEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAF1EC',
  },
  homeTripMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  homeTripMeta: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DFE5E2',
    paddingVertical: 10,
    alignItems: 'center',
  },
  homeTripMetaValue: {
    color: '#030318',
    fontSize: 14,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripMetaLabel: {
    color: '#7A838C',
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  homeTripButton: {
    backgroundColor: '#57c7a8',
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  homeTripButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'CircularStdMedium500',
  },
  homeBottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'android' ? 0 : 0,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 10 : 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    zIndex: 100,
    elevation: 0,
    overflow: 'visible',
  },
  homeBottomSlot: {
    width: '20%',
    alignItems: 'center',
  },
  homeBottomSlotNoCenter: {
    width: '25%',
    alignItems: 'center',
  },
  homeBottomItem: {
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  homeBottomCenterSlot: {
    width: '20%',
    alignItems: 'center',
    position: 'relative',
    minHeight: 46,
    justifyContent: 'flex-end',
  },
  homeCenterRouteButton: {
    position: 'absolute',
    top: -24,
    left: '50%',
    transform: [{ translateX: -36 }],
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#57c7a8',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  homeCenterRouteButtonActive: {
    shadowColor: '#57c7a8',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  homeBottomActiveLine: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    marginBottom: 6,
  },
  homeBottomActiveLineVisible: {
    backgroundColor: '#57c7a8',
  },
  homeBottomItemActive: {
    alignItems: 'center',
    gap: 4,
  },
  homeBottomText: {
    fontSize: 12,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  homeBottomTextActive: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  violationTitle: {
    fontSize: 34,
    lineHeight: 36,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginTop: 2,
  },
  violationOpenBadge: {
    backgroundColor: '#EAF8F1',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  violationOpenBadgeText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  violationSummaryBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  violationSummaryValue: {
    fontSize: 16,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryLabel: {
    fontSize: 11,
    color: '#6D7480',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanHeader: {
    fontSize: 34,
    lineHeight: 38,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSubHeader: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 15,
    lineHeight: 20,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSummary: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationCleanSummaryItem: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  violationCleanSummaryValue: {
    fontSize: 20,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSummaryLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanSectionTitle: {
    marginBottom: 8,
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  violationCleanMarker: {
    width: 6,
  },
  violationCleanMarkerOpen: {
    backgroundColor: '#E34A4A',
  },
  violationCleanMarkerReview: {
    backgroundColor: '#E0B400',
  },
  violationCleanMarkerResolved: {
    backgroundColor: '#57c7a8',
  },
  violationCleanMain: {
    flex: 1,
    padding: 14,
  },
  violationCleanTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  violationCleanTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanId: {
    fontSize: 12,
    lineHeight: 14,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationCleanMetaText: {
    marginLeft: 6,
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanDetails: {
    marginTop: 3,
    marginBottom: 9,
    fontSize: 14,
    lineHeight: 19,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationCleanPriority: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  violationCleanPriorityHigh: {
    backgroundColor: '#FEE2E2',
  },
  violationCleanPriorityMedium: {
    backgroundColor: '#FEF3C7',
  },
  violationCleanPriorityLow: {
    backgroundColor: '#DCFCE7',
  },
  violationCleanPriorityText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCleanAction: {
    minWidth: 104,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CDEFD9',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationCleanActionText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSummaryRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationSimpleSummaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  violationSimpleSummaryValue: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSummaryLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleSection: {
    marginBottom: 14,
  },
  violationSimpleSectionTitle: {
    marginBottom: 10,
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  violationSimpleCardResolved: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    marginBottom: 10,
  },
  violationSimpleAccent: {
    width: 6,
  },
  violationSimpleAccentHigh: {
    backgroundColor: '#E34A4A',
  },
  violationSimpleAccentMedium: {
    backgroundColor: '#E0B400',
  },
  violationSimpleCardBody: {
    flex: 1,
    padding: 12,
  },
  violationSimpleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  violationSimpleId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleStatusPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  violationSimpleStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationSimpleStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationSimpleStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationSimpleStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleStatusTextOpen: {
    color: '#B91C1C',
  },
  violationSimpleStatusTextReview: {
    color: '#B7791F',
  },
  violationSimpleStatusTextResolved: {
    color: '#15803D',
  },
  violationSimpleCardTitle: {
    fontSize: 17,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 7,
  },
  violationSimpleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationSimpleMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleDetails: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationSimpleActionBtn: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 10,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  violationSimpleActionText: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  violationAltTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltFilterBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationAltStatsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationAltStatPill: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF0',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  violationAltStatValue: {
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltStatLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltTimeline: {
    paddingBottom: 4,
  },
  violationAltTimelineRow: {
    flexDirection: 'row',
  },
  violationAltRailWrap: {
    width: 22,
    alignItems: 'center',
  },
  violationAltRailDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  violationAltRailDotHigh: {
    backgroundColor: '#E34A4A',
  },
  violationAltRailDotMedium: {
    backgroundColor: '#E0B400',
  },
  violationAltRailDotLow: {
    backgroundColor: '#3CCB71',
  },
  violationAltRailLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: '#DDE5EC',
  },
  violationAltCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  violationAltCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  violationAltId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltTime: {
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltCardTitle: {
    fontSize: 16,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltRoute: {
    marginTop: 2,
    marginBottom: 7,
    fontSize: 12,
    lineHeight: 14,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  violationAltMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltDetails: {
    marginTop: 4,
    marginBottom: 9,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationAltFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationAltStatusChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  violationAltStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationAltStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationAltStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationAltStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationAltStatusTextOpen: {
    color: '#B91C1C',
  },
  violationAltStatusTextReview: {
    color: '#B7791F',
  },
  violationAltStatusTextResolved: {
    color: '#15803D',
  },
  violationAltActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CDEFD9',
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  violationAltActionText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationCenterTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  violationCenterSub: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  violationHealthTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  violationHealthLabel: {
    fontSize: 12,
    lineHeight: 14,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthValue: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 22,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  violationHealthBadgeText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#D1FAE5',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  violationHealthBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#E34A4A',
  },
  violationHealthStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  violationHealthStat: {
    flex: 1,
    alignItems: 'center',
  },
  violationHealthStatValue: {
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationHealthStatLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#94A3B8',
    fontFamily: 'CircularStdMedium500',
  },
  violationFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  violationFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  violationFilterChipActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#EAF8F1',
  },
  violationFilterText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  violationFilterTextActive: {
    color: '#047857',
  },
  violationTicketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3EAF0',
    padding: 14,
    marginBottom: 12,
  },
  violationTicketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  violationTicketIdWrap: {
    flex: 1,
    marginRight: 10,
  },
  violationTicketId: {
    fontSize: 11,
    lineHeight: 13,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketRoute: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketStatus: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  violationTicketStatusOpen: {
    backgroundColor: '#FFF2F2',
  },
  violationTicketStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationTicketStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationTicketStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketStatusTextOpen: {
    color: '#B91C1C',
  },
  violationTicketStatusTextReview: {
    color: '#B7791F',
  },
  violationTicketStatusTextResolved: {
    color: '#15803D',
  },
  violationTicketTitle: {
    fontSize: 17,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  violationTicketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  violationTicketMetaText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketDetails: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 17,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  violationSeverityPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  violationSeverityHigh: {
    backgroundColor: '#FEE2E2',
  },
  violationSeverityMedium: {
    backgroundColor: '#FEF3C7',
  },
  violationSeverityLow: {
    backgroundColor: '#DCFCE7',
  },
  violationSeverityText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationTicketAction: {
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#CDEFD9',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  violationTicketActionText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  violationHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  violationHeroTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  violationHeroSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#FFE1E1',
  },
  violationHeroBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#B91C1C',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryRowNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  violationSummaryBoxNew: {
    flex: 1,
    alignItems: 'center',
  },
  violationSummaryValueNew: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationSummaryLabelNew: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5EBF1',
  },
  violationCardAccent: {
    width: 6,
  },
  violationCardBody: {
    flex: 1,
    padding: 15,
  },
  violationCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  violationIdPill: {
    borderRadius: 999,
    backgroundColor: '#F3F7FB',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8EF',
  },
  violationIdText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  violationStatusPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  violationStatusOpen: {
    backgroundColor: '#FFF3F3',
  },
  violationStatusReview: {
    backgroundColor: '#FFF9EA',
  },
  violationStatusResolved: {
    backgroundColor: '#EAF8F1',
  },
  violationStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'CircularStdMedium500',
  },
  violationStatusTextOpen: {
    color: '#B91C1C',
  },
  violationStatusTextReview: {
    color: '#B7791F',
  },
  violationStatusTextResolved: {
    color: '#15803D',
  },
  violationCardTitleNew: {
    fontSize: 18,
    lineHeight: 22,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardType: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 14,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  violationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  violationInfoText: {
    marginLeft: 6,
    fontSize: 12,
    lineHeight: 15,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  violationDetailsNew: {
    marginTop: 6,
    marginBottom: 11,
    fontSize: 13,
    lineHeight: 18,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionButtonNew: {
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationActionOpen: {
    backgroundColor: '#E03A3A',
  },
  violationActionReview: {
    backgroundColor: '#F3CF61',
  },
  violationActionResolvedNew: {
    backgroundColor: '#BDE27A',
  },
  violationActionTextNew: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionTextDarkNew: {
    color: '#1F2937',
  },
  violationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  violationTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F2',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 8,
  },
  violationTypeText: {
    fontSize: 11,
    color: '#3A4A42',
    fontFamily: 'CircularStdMedium500',
  },
  violationCardTitle: {
    fontSize: 20,
    lineHeight: 23,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  violationMuted: {
    fontSize: 13,
    lineHeight: 17,
    color: '#4A535D',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 4,
  },
  violationDetails: {
    fontSize: 14,
    lineHeight: 19,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
    marginTop: 8,
    marginBottom: 12,
  },
  violationActionButton: {
    borderRadius: 8,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violationActionDanger: {
    backgroundColor: '#E03A3A',
  },
  violationActionWarning: {
    backgroundColor: '#F3CF61',
  },
  violationActionResolved: {
    backgroundColor: '#BDE27A',
  },
  violationActionTextLight: {
    fontSize: 14,
    lineHeight: 16,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  violationActionTextDark: {
    fontSize: 14,
    lineHeight: 16,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tripTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripEtaPill: {
    backgroundColor: '#EAF8F1',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tripEtaText: {
    fontSize: 12,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  tripMapCard: {
    height: 190,
    borderRadius: 16,
    backgroundColor: '#F4F6F7',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  tripMapText: {
    fontSize: 14,
    color: '#3A4A42',
    marginTop: 8,
    fontFamily: 'CircularStdMedium500',
  },
  tripMapSubText: {
    fontSize: 12,
    color: '#7A838C',
    marginTop: 4,
    fontFamily: 'CircularStdMedium500',
  },
  tripStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tripStatPill: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DFE5E2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 10,
  },
  tripStatValue: {
    fontSize: 14,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripStatLabel: {
    fontSize: 11,
    color: '#6D7480',
    marginTop: 2,
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tripSectionTitle: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripAvatarStub: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripPassengerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  tripPassengerName: {
    fontSize: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripPassengerSub: {
    fontSize: 12,
    color: '#6D7480',
    marginTop: 3,
    fontFamily: 'CircularStdMedium500',
  },
  tripCallButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripActionRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  tripActionButton: {
    flex: 1,
    borderRadius: 10,
    height: ACTION_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripActionSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E6E3',
    marginRight: 8,
  },
  tripActionSecondaryText: {
    fontSize: 14,
    color: '#46515B',
    fontFamily: 'CircularStdMedium500',
  },
  tripActionPrimary: {
    backgroundColor: '#57c7a8',
    marginLeft: 8,
  },
  tripActionPrimaryText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  tripFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE3E0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  tripFilterChipActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#EAF8F1',
  },
  tripFilterText: {
    fontSize: 12,
    color: '#68737E',
    fontFamily: 'CircularStdMedium500',
  },
  tripFilterTextActive: {
    color: '#57c7a8',
  },
  tripLogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  tripLogTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tripLogId: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusPill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tripLogStatusCompleted: {
    backgroundColor: '#EAF8F1',
  },
  tripLogStatusCancelled: {
    backgroundColor: '#FFF1F1',
  },
  tripLogStatusText: {
    fontSize: 11,
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusCompletedText: {
    color: '#57c7a8',
  },
  tripLogStatusCancelledText: {
    color: '#D94444',
  },
  tripLogRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripLogRoute: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogDate: {
    fontSize: 12,
    color: '#6D7480',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripLogBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripLogMeta: {
    fontSize: 12,
    color: '#6D7480',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogFare: {
    fontSize: 14,
    color: '#57c7a8',
    fontFamily: 'CircularStdMedium500',
  },
  tripListTitle: {
    fontSize: 32,
    lineHeight: 35,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 0,
  },
  tripScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 10,
  },
  tripHero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  tripHeroTitleWrap: {
    flex: 1,
    marginRight: 10,
  },
  tripHeroSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#EBF8F1',
    borderWidth: 1,
    borderColor: '#D0EEDD',
  },
  tripHeroBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#047857',
    fontFamily: 'CircularStdMedium500',
  },
  tripTopFilterRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripTopFilterChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  tripTopFilterChipActive: {
    backgroundColor: '#030318',
  },
  tripTopFilterText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'CircularStdMedium500',
  },
  tripTopFilterTextActive: {
    color: '#FFFFFF',
  },
  tripSearchBar: {
    height: 46,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  tripSearchText: {
    fontSize: 12,
    color: '#7B848D',
    marginLeft: 8,
    fontFamily: 'CircularStdMedium500',
  },
  tripOfflineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  tripOfflineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F7B93A',
    marginRight: 6,
  },
  tripOfflineText: {
    fontSize: 12,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
  },
  tripSummaryStrip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingVertical: 11,
    paddingHorizontal: 8,
    flexDirection: 'row',
    marginBottom: 14,
  },
  tripSummaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripSummaryValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripSummaryLabel: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogCardNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5EBF1',
  },
  tripLogLeftAccent: {
    width: 6,
  },
  tripLogContent: {
    flex: 1,
    padding: 15,
  },
  tripLogMetaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  tripLogIdPill: {
    borderRadius: 999,
    backgroundColor: '#EEF7F1',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#D7ECDD',
  },
  tripLogIdPillText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#15803D',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogDateText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tripLogRouteTitle: {
    fontSize: 18,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    flex: 1,
    marginRight: 8,
  },
  tripLogStatusBadge: {
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tripLogStatusBadgeOngoing: {
    backgroundColor: '#FFF8D8',
  },
  tripLogStatusBadgeCompleted: {
    backgroundColor: '#EAF8F1',
  },
  tripLogStatusBadgeFlagged: {
    backgroundColor: '#FFF1F1',
  },
  tripLogStatusBadgeText: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatusTextOngoing: {
    color: '#D6A308',
  },
  tripLogStatusTextCompleted: {
    color: '#27A866',
  },
  tripLogStatusTextFlagged: {
    color: '#D94444',
  },
  tripLogMuted: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
    fontFamily: 'CircularStdMedium500',
  },
  tripMetricPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tripMetricPill: {
    width: '32%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9EEF4',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tripMetricPillLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripMetricPillValue: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 14,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  tripLogStatsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  tripLogStatBlock: {
    marginRight: 24,
  },
  tripLogStatValue: {
    fontSize: 21,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
  },
  tripLogStatMeta: {
    fontSize: 15,
    color: '#111827',
    marginRight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceText: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceValue: {
    fontSize: 11,
    lineHeight: 13,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  tripComplianceTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tripComplianceFill: {
    height: '100%',
    borderRadius: 999,
  },
  routeScreenContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  routeMapBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EEF2F1',
    transform: [{ scale: 1.2 }],
  },
  routeMapLine: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#D9DEDE',
  },
  routeMapLineA: {
    width: '90%',
    top: '20%',
    left: '-5%',
    transform: [{ rotate: '-18deg' }],
  },
  routeMapLineB: {
    width: '95%',
    top: '42%',
    left: '4%',
    transform: [{ rotate: '12deg' }],
  },
  routeMapLineC: {
    width: '85%',
    top: '62%',
    left: '-8%',
    transform: [{ rotate: '-8deg' }],
  },
  routeMapLineD: {
    width: '78%',
    top: '82%',
    left: '18%',
    transform: [{ rotate: '16deg' }],
  },
  routeMapCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(217,222,222,0.45)',
  },
  routeMapCircleA: {
    top: '30%',
    right: -30,
  },
  routeMapCircleB: {
    bottom: '22%',
    left: -20,
  },
  routeScreenBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 150,
  },
  routePinWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  routeTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    marginBottom: 8,
  },
  routeSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    color: '#6B7280',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
    marginBottom: 22,
  },
  routeEnableButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 110,
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  routeEnableButtonText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  routeMapScreen: {
    flex: 1,
  },
  routeBackButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? STATUS_BAR_HEIGHT + 12 : 52,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E5ECF3',
    zIndex: 10,
  },
  routeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  routePersonMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#11B377',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeTargetMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  routeTripPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 90,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3EAF1',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  routeGeofenceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  routeGeofenceStatusLabel: {
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  routeGeofencePill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  routeGeofencePillInside: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  routeGeofencePillOutside: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  routeGeofencePillText: {
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'CircularStdMedium500',
  },
  routeGeofencePillTextInside: {
    color: '#047857',
  },
  routeGeofencePillTextOutside: {
    color: '#B91C1C',
  },
  routeTripStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  routeTripStatPill: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE8EF',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F7FAFD',
  },
  routeTripStatValue: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  routeTripStatLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  routeFareList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  routeFareOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E1E9',
    backgroundColor: '#F6FAFC',
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  routeFareOptionActive: {
    borderColor: '#57c7a8',
    backgroundColor: '#ECFDF5',
  },
  routeFareOptionText: {
    fontSize: 13,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  routeFareOptionTextActive: {
    color: '#047857',
  },
  routeStartTripButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStartTripText: {
    fontSize: 18,
    lineHeight: 21,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  profileScroll: {
    paddingHorizontal: 16,
    paddingBottom: 150,
    paddingTop: 10,
  },
  profileIdentityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  profileIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profileName: {
    fontSize: 24,
    lineHeight: 28,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSub: {
    marginTop: 4,
    fontSize: 20,
    lineHeight: 22,
    color: '#4B5563',
    fontFamily: 'CircularStdMedium500',
  },
  profileDetailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ECEEF2',
  },
  profileDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F4',
  },
  profileDetailLabel: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileDetailValue: {
    fontSize: 17,
    lineHeight: 20,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profilePageTitle: {
    fontSize: 30,
    lineHeight: 34,
    color: '#030318',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 12,
  },
  profileSettingsUserCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileSettingsUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileSettingsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 10,
  },
  profileSettingsUserTextWrap: {
    flex: 1,
  },
  profileSettingsName: {
    fontSize: 18,
    lineHeight: 21,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsSub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSettingsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7EDF3',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    marginBottom: 12,
  },
  profileSettingsSectionTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    marginBottom: 8,
  },
  profileSettingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  profileSettingsActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },
  profileSettingsRowLast: {
    borderBottomWidth: 0,
  },
  profileSettingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  profileSettingsRowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  profileSettingsRowLabel: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsRowValue: {
    fontSize: 14,
    lineHeight: 17,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsActionTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: '#111827',
    fontFamily: 'CircularStdMedium500',
  },
  profileSettingsActionSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 14,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
  },
  profileLogoutButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#57c7a8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 4,
    gap: 8,
  },
  profileLogoutButtonText: {
    fontSize: 15,
    lineHeight: 18,
    color: '#FFFFFF',
    fontFamily: 'CircularStdMedium500',
  },
  backButton: {
    width: 45,
    height: 45,
    borderRadius: 18,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  backButtonCreateAccount: {
    marginBottom: 20,
    marginTop: -38
  },
  title: {
    textAlign: 'center',
    fontSize: 52,
    lineHeight: 56,
    fontFamily: 'CircularStdMedium500',
    color: '#111827',
    marginBottom: 8,
  },
  authTitleSmall: {
    fontSize: 44,
    lineHeight: 48,
  },
  loginTitleOffset: {
    marginTop: 20,
  },
  createAccountTitle: {
    marginTop: 8,
    marginBottom:0,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    color: '#6D7480',
    marginBottom: 20,
    fontFamily: 'CircularStdMedium500',
  },
  createAccountSubtitle: {
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputWrapper: {
    height: 62,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  inputIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    marginLeft: 8,
    color: '#1F2937',
    fontFamily: 'CircularStdMedium500',
    textAlignVertical: 'center',
  },
  trailingIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
    marginBottom: 16,
  },
  forgotPasswordRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  smallMuted: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  smallLinkDark: {
    fontSize: 13,
    color: '#1F2937',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  primaryButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 6,
  },
  loginPrimaryButtonLower: {
    marginTop: 8,
  },
  loginFormContainer: {
    flex: 1,
  },
  loginScreenFill: {
    flex: 1,
  },
  loginButtonBottomSpacer: {
    flex: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
  rowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  createAccountRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  helperText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
    fontFamily: 'CircularStdMedium500',
  },
  createAccountContent: {
    marginTop: 0,
    marginBottom: 0,
  },
  createAccountLowered: {
    marginTop: 0,
  },
  createAccountFooterGap: {
    height:8,
  },
  greenLink: {
    fontSize: 14,
    color: '#26B97B',
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#DADDE2',
    marginTop: 18,
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 14,
  },
  socialBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonGapTop: {
    marginTop: 12,
  },
  getStartedContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  getStartedHero: {
    position: 'absolute',
    top: 100,
    right: 0,
    bottom: 0,
    left: 40,
    backgroundColor: 'white',
  },
  getStartedCard: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    maxWidth: '100%',
  },
  getStartedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 32,
    textAlign: 'center',
    fontFamily: 'CircularStdMedium500',
  },
  getStartedSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'CircularStdMedium500',
  },
  getStartedDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  getStartedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FAFAFA',
    opacity: 0.6,
  },
  getStartedDotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C0EC4E',
    opacity: 1,
  },
  getStartedButton: {
    height: ACTION_BUTTON_HEIGHT,
    borderRadius: 100,
    backgroundColor: '#C0EC4E',
    alignSelf: 'center',
    width: '95%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 35,
  },
  getStartedButtonWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  getStartedButtonText: {
    color: '#030318',
    fontSize: 18,
    lineHeight: 20,
    fontFamily: 'CircularStdMedium500',
    fontWeight: '600',
  },
  getStartedButtonIcon: {
    position: 'absolute',
    right: 8,
    width: 60,
    height: 60,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedTopCopy: {
    position: 'absolute',
    top: 75,
    left: 24,
    right: 24,
    zIndex: 2,
  },
  getStartedBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    fontSize: 40,
    lineHeight: 30,
    fontFamily: 'CircularStdMedium500',
    fontWeight: '700',
    marginBottom: 32,
  },
  getStartedBrandText: {
    fontSize: 36,
    lineHeight: 36,
    fontFamily: 'NissanOpti',
    color: '#030318',
    marginBottom: 32,
    letterSpacing: 1,
    fontWeight: 'normal',
  },
  getStartedBrandAccent: {
    color: '#C0EC4E',
    fontFamily: 'NissanOpti',
    fontWeight: 'normal',
  },
  getStartedBrandMain: {
    color: '#030318',
    fontFamily: 'NissanOpti',
    fontWeight: 'normal',
  },
  getStartedHeadline: {
    color: '#030318',
    fontSize: 26,
    lineHeight: 33,
    fontFamily: 'NissanOpti',
    marginTop: 45,
    textAlign: 'left',
    fontWeight: 'normal',
    letterSpacing: 1,
  },
});
