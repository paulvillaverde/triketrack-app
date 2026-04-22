import type { RawTripTelemetryPoint } from './tripPathReconstruction';
import type { RoadPathMatchMetadata } from './roadPath';

export type TripCoordinate = {
  latitude: number;
  longitude: number;
};

export type TripTelemetryPoint = RawTripTelemetryPoint & {
  altitude?: number | null;
  provider?: string | null;
};

export type TripSyncStatus = 'SYNC_PENDING' | 'SYNCED';

export type TripTrackingState =
  | 'IDLE'
  | 'TRIP_STARTING'
  | 'PRE_ROAD'
  | 'ON_ROAD'
  | 'TRIP_ENDING'
  | 'COMPLETED'
  | 'SYNC_PENDING'
  | 'SYNCED';

export type TripGpsQualitySummary = {
  averageAccuracyMeters: number | null;
  bestAccuracyMeters: number | null;
  worstAccuracyMeters: number | null;
  lowConfidencePointCount: number;
  highConfidencePointCount: number;
  confidence: 'high' | 'medium' | 'low';
};

export type TripRouteGeoJson = {
  type: 'LineString';
  coordinates: number[][];
};

export type TripRouteMatchSummary = RoadPathMatchMetadata;

const getRouteMatchSummaryPriority = (summary?: TripRouteMatchSummary | null) => {
  switch (summary?.provider) {
    case 'osrm-match':
      return 6;
    case 'osrm-route':
      return 0;
    case 'ors-directions':
      return 0;
    case 'local-directional':
      return 1;
    default:
      return 0;
  }
};

const preferBetterRouteMatchSummary = (
  current: TripRouteMatchSummary | null,
  candidate: TripRouteMatchSummary | null,
) => {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }

  const currentPriority = getRouteMatchSummaryPriority(current);
  const candidatePriority = getRouteMatchSummaryPriority(candidate);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current;
  }

  const currentMatchedPoints = Number(current.matchedPointCount ?? 0);
  const candidateMatchedPoints = Number(candidate.matchedPointCount ?? 0);
  if (candidateMatchedPoints !== currentMatchedPoints) {
    return candidateMatchedPoints > currentMatchedPoints ? candidate : current;
  }

  const currentConfidence =
    typeof current.confidence === 'number' && Number.isFinite(current.confidence)
      ? current.confidence
      : -1;
  const candidateConfidence =
    typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : -1;
  if (candidateConfidence !== currentConfidence) {
    return candidateConfidence > currentConfidence ? candidate : current;
  }

  return candidate;
};

export const pickPreferredRouteMatchSummary = (
  ...summaries: Array<TripRouteMatchSummary | null | undefined>
): TripRouteMatchSummary | null =>
  summaries.reduce<TripRouteMatchSummary | null>(
    (best, summary) => preferBetterRouteMatchSummary(best, summary ?? null),
    null,
  );

export type TripHistoryItem = {
  id: string;
  tripDate: string;
  duration: string;
  distance: string;
  fare: string;
  fareAmount: number;
  violations: string;
  status: 'ONGOING' | 'COMPLETED' | 'FLAGGED';
  compliance: number;
  routePath: TripCoordinate[];
  rawStartPoint: TripCoordinate | null;
  startLocationRaw: TripCoordinate | null;
  startLocationMatched: TripCoordinate | null;
  endLocationRaw: TripCoordinate | null;
  endLocationMatched: TripCoordinate | null;
  startDisplayName: string | null;
  endDisplayName: string | null;
  startCoordinate: TripCoordinate | null;
  endCoordinate: TripCoordinate | null;
  dashedStartConnector: TripCoordinate[];
  dashedEndConnector: TripCoordinate[];
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  totalDistanceRawMeters: number;
  totalDistanceMatchedMeters: number;
  averageSpeedKph: number;
  maxSpeedKph: number;
  idleDurationSeconds: number;
  offlineSegmentsCount: number;
  gpsQualitySummary: TripGpsQualitySummary | null;
  routeMatchSummary: TripRouteMatchSummary | null;
  routeTraceGeoJson: TripRouteGeoJson | null;
  rawGpsPointCount: number;
  matchedPointCount: number;
  syncStatus: TripSyncStatus;
  tripState: TripTrackingState;
  driverName: string | null;
  driverCode: string | null;
  vehiclePlateNumber: string | null;
  vehicleId: string | null;
  routeId: string | null;
  assignedRouteId: string | null;
  routeName: string | null;
  todaId: string | null;
  rawTelemetry: TripTelemetryPoint[];
};

export type TripCompletionPayload = {
  fare: number;
  distanceKm: number;
  durationSeconds: number;
  routePath: TripCoordinate[];
  endLocation: TripCoordinate | null;
  rawTelemetry?: TripTelemetryPoint[];
  startedAt?: string | null;
  endedAt?: string | null;
  rawStartPoint?: TripCoordinate | null;
  rawEndPoint?: TripCoordinate | null;
  matchedStartPoint?: TripCoordinate | null;
  matchedEndPoint?: TripCoordinate | null;
  dashedStartConnector?: TripCoordinate[];
  dashedEndConnector?: TripCoordinate[];
  tripState?: TripTrackingState;
  matchedPointCount?: number;
  offlineSegmentsCount?: number;
  averageSpeedKph?: number | null;
  maxSpeedKph?: number | null;
  idleDurationSeconds?: number;
  gpsQualitySummary?: TripGpsQualitySummary | null;
  routeMatchSummary?: TripRouteMatchSummary | null;
  startDisplayName?: string | null;
  endDisplayName?: string | null;
  startCoordinate?: TripCoordinate | null;
  endCoordinate?: TripCoordinate | null;
};

const toRad = (value: number) => (value * Math.PI) / 180;

const distanceBetweenMeters = (from: TripCoordinate, to: TripCoordinate) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const isValidCoordinate = (value: unknown): value is TripCoordinate =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { latitude?: unknown }).latitude === 'number' &&
  Number.isFinite((value as { latitude: number }).latitude) &&
    typeof (value as { longitude?: unknown }).longitude === 'number' &&
    Number.isFinite((value as { longitude: number }).longitude);

const formatEndpointCoordinateLabel = (point: TripCoordinate, label: 'Pickup' | 'Destination') =>
  `${label} ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;

const normalizeEndpointDisplayName = (
  value: unknown,
  fallbackPoint: TripCoordinate | null,
  label: 'Pickup' | 'Destination',
) => {
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  const unknownLabel = label === 'Pickup' ? 'Unknown pickup point' : 'Unknown destination';
  if (trimmedValue.length > 0 && trimmedValue !== unknownLabel) {
    return trimmedValue;
  }

  return fallbackPoint ? formatEndpointCoordinateLabel(fallbackPoint, label) : null;
};

const roundMetric = (value: number, precision = 2) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

export const normalizeTripCoordinateArray = (value: unknown): TripCoordinate[] =>
  Array.isArray(value) ? value.filter(isValidCoordinate) : [];

const dedupeSequentialTripCoordinates = (points: TripCoordinate[]) =>
  normalizeTripCoordinateArray(points).filter((point, index, source) => {
    if (index === 0) {
      return true;
    }
    const previous = source[index - 1];
    return previous.latitude !== point.latitude || previous.longitude !== point.longitude;
  });

export const normalizeGeoJsonRoutePath = (value: unknown): TripCoordinate[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const coordinates = (value as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return [];
  }
  return dedupeSequentialTripCoordinates(
    coordinates
      .filter(
        (point): point is number[] =>
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === 'number' &&
          Number.isFinite(point[0]) &&
          typeof point[1] === 'number' &&
          Number.isFinite(point[1]),
      )
      .map((point) => ({
        latitude: point[1],
        longitude: point[0],
      })),
  );
};

export const normalizeTripTelemetryArray = (value: unknown): TripTelemetryPoint[] =>
  Array.isArray(value)
    ? value.filter(
        (point): point is TripTelemetryPoint =>
          typeof point === 'object' &&
          point !== null &&
          typeof (point as { latitude?: unknown }).latitude === 'number' &&
          typeof (point as { longitude?: unknown }).longitude === 'number' &&
          typeof (point as { recordedAt?: unknown }).recordedAt === 'string',
      )
    : [];

const buildTripConnector = ({
  from,
  to,
  minDistanceMeters = 3,
  maxDistanceMeters = 250,
}: {
  from: TripCoordinate | null | undefined;
  to: TripCoordinate | null | undefined;
  minDistanceMeters?: number;
  maxDistanceMeters?: number;
}) => {
  if (!from || !to) {
    return [];
  }
  const connectorDistanceMeters = distanceBetweenMeters(from, to);
  if (connectorDistanceMeters < minDistanceMeters || connectorDistanceMeters > maxDistanceMeters) {
    return [];
  }
  return [from, to];
};

export const formatDurationLabel = (durationSeconds: number) => {
  const mins = Math.floor(Math.max(durationSeconds, 0) / 60);
  const secs = Math.max(durationSeconds, 0) % 60;
  return mins > 0 ? `${mins} min` : `${secs} sec`;
};

export const formatTripReceiptDistance = (distanceMeters: number) => {
  const safeDistanceMeters = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0);
  if (safeDistanceMeters < 1000) {
    return `${Math.round(safeDistanceMeters)} m`;
  }
  return `${roundMetric(safeDistanceMeters / 1000, 2).toFixed(2)} km`;
};

export const formatTripReceiptFare = (fare: number) =>
  `\u20B1${roundMetric(fare, 2).toFixed(2)}`;

export const buildRouteTraceGeoJson = (
  points: TripCoordinate[],
): TripRouteGeoJson | null => {
  const normalizedPoints = normalizeTripCoordinateArray(points);
  if (normalizedPoints.length < 2) {
    return null;
  }

  return {
    type: 'LineString',
    coordinates: normalizedPoints.map((point) => [point.longitude, point.latitude]),
  };
};

export const polylineDistanceMeters = (points: TripCoordinate[]) => {
  const normalizedPoints = normalizeTripCoordinateArray(points);
  if (normalizedPoints.length < 2) {
    return 0;
  }

  let totalMeters = 0;
  for (let index = 1; index < normalizedPoints.length; index += 1) {
    totalMeters += distanceBetweenMeters(normalizedPoints[index - 1], normalizedPoints[index]);
  }
  return totalMeters;
};

export const buildGpsQualitySummary = (
  telemetry: TripTelemetryPoint[],
): TripGpsQualitySummary | null => {
  const accuracies = telemetry
    .map((point) =>
      typeof point.accuracy === 'number' && Number.isFinite(point.accuracy) ? point.accuracy : null,
    )
    .filter((value): value is number => value !== null);

  if (accuracies.length === 0) {
    return null;
  }

  const totalAccuracy = accuracies.reduce((sum, value) => sum + value, 0);
  const averageAccuracy = totalAccuracy / accuracies.length;
  const lowConfidencePointCount = accuracies.filter((value) => value > 25).length;
  const highConfidencePointCount = accuracies.length - lowConfidencePointCount;
  const lowConfidenceRatio = accuracies.length > 0 ? lowConfidencePointCount / accuracies.length : 1;
  const confidence =
    lowConfidenceRatio <= 0.2 ? 'high' : lowConfidenceRatio <= 0.45 ? 'medium' : 'low';

  return {
    averageAccuracyMeters: roundMetric(averageAccuracy, 1),
    bestAccuracyMeters: roundMetric(Math.min(...accuracies), 1),
    worstAccuracyMeters: roundMetric(Math.max(...accuracies), 1),
    lowConfidencePointCount,
    highConfidencePointCount,
    confidence,
  };
};

export const countOfflineSegments = (
  captureStatuses: Array<'online' | 'offline'>,
) => {
  let segments = 0;
  let wasOffline = false;

  for (const status of captureStatuses) {
    if (status === 'offline' && !wasOffline) {
      segments += 1;
      wasOffline = true;
      continue;
    }

    if (status === 'online') {
      wasOffline = false;
    }
  }

  return segments;
};

export const deriveIdleDurationSeconds = (telemetry: TripTelemetryPoint[]) => {
  if (telemetry.length < 2) {
    return 0;
  }

  const ordered = [...telemetry].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime(),
  );
  let idleSeconds = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousPoint = { latitude: previous.latitude, longitude: previous.longitude };
    const currentPoint = { latitude: current.latitude, longitude: current.longitude };
    const deltaSeconds = Math.max(
      0,
      (new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 1000,
    );
    const speedKph =
      typeof current.speed === 'number' && Number.isFinite(current.speed) ? current.speed : null;
    const movedMeters = distanceBetweenMeters(previousPoint, currentPoint);

    if ((speedKph !== null && speedKph <= 2.5) || movedMeters <= 4) {
      idleSeconds += deltaSeconds;
    }
  }

  return Math.round(idleSeconds);
};

export const deriveMaxSpeedKph = (telemetry: TripTelemetryPoint[]) => {
  if (telemetry.length === 0) {
    return 0;
  }

  let maxSpeed = 0;
  for (let index = 0; index < telemetry.length; index += 1) {
    const point = telemetry[index];
    if (typeof point.speed === 'number' && Number.isFinite(point.speed) && point.speed >= 0) {
      maxSpeed = Math.max(maxSpeed, point.speed);
      continue;
    }

    if (index === 0) {
      continue;
    }

    const previous = telemetry[index - 1];
    const elapsedHours =
      Math.max(
        (new Date(point.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 3600000,
        0,
      );
    if (elapsedHours <= 0) {
      continue;
    }

    const derivedSpeed = distanceBetweenMeters(previous, point) / 1000 / elapsedHours;
    maxSpeed = Math.max(maxSpeed, derivedSpeed);
  }

  return roundMetric(maxSpeed, 1);
};

export const mergeTripHistoryItem = (
  current: TripHistoryItem | undefined,
  next: TripHistoryItem,
): TripHistoryItem => {
  if (!current) {
    return next;
  }

  const shouldPreferAuthoritativeNextRoute =
    next.syncStatus === 'SYNCED' &&
    typeof next.routeMatchSummary?.provider === 'string' &&
    next.routeMatchSummary.provider !== 'local-directional' &&
    (next.routePath.length > 1 || Boolean(next.routeTraceGeoJson));
  const shouldPreferCurrentRoute =
    !shouldPreferAuthoritativeNextRoute &&
    current.rawTelemetry.length > 1 &&
    current.routePath.length > 1 &&
    next.rawTelemetry.length === 0;
  const mergedRoutePath = shouldPreferCurrentRoute
    ? current.routePath
    : shouldPreferAuthoritativeNextRoute
      ? next.routePath
      : next.routePath.length > 0
      ? next.routePath
      : current.routePath;

  return {
    ...current,
    ...next,
    fareAmount: next.fareAmount > 0 ? next.fareAmount : current.fareAmount,
    fare: next.fareAmount > 0 ? next.fare : current.fare,
    routePath: mergedRoutePath,
    rawStartPoint: next.rawStartPoint ?? current.rawStartPoint,
    startLocationRaw: next.startLocationRaw ?? current.startLocationRaw,
    startLocationMatched: next.startLocationMatched ?? current.startLocationMatched,
    endLocationRaw: next.endLocationRaw ?? current.endLocationRaw,
    endLocationMatched: next.endLocationMatched ?? current.endLocationMatched,
    startDisplayName: next.startDisplayName ?? current.startDisplayName,
    endDisplayName: next.endDisplayName ?? current.endDisplayName,
    startCoordinate: next.startCoordinate ?? current.startCoordinate,
    endCoordinate: next.endCoordinate ?? current.endCoordinate,
    dashedStartConnector:
      shouldPreferAuthoritativeNextRoute
        ? next.dashedStartConnector
        : next.dashedStartConnector.length > 0
          ? next.dashedStartConnector
          : current.dashedStartConnector,
    dashedEndConnector:
      shouldPreferAuthoritativeNextRoute
        ? next.dashedEndConnector
        : next.dashedEndConnector.length > 0
          ? next.dashedEndConnector
          : current.dashedEndConnector,
    startedAt: next.startedAt ?? current.startedAt,
    endedAt: next.endedAt ?? current.endedAt,
    totalDistanceRawMeters:
      next.totalDistanceRawMeters > 0 ? next.totalDistanceRawMeters : current.totalDistanceRawMeters,
    totalDistanceMatchedMeters:
      next.totalDistanceMatchedMeters > 0
        ? next.totalDistanceMatchedMeters
        : current.totalDistanceMatchedMeters,
    averageSpeedKph: next.averageSpeedKph > 0 ? next.averageSpeedKph : current.averageSpeedKph,
    maxSpeedKph: next.maxSpeedKph > 0 ? next.maxSpeedKph : current.maxSpeedKph,
    idleDurationSeconds:
      next.idleDurationSeconds > 0 ? next.idleDurationSeconds : current.idleDurationSeconds,
    offlineSegmentsCount:
      next.offlineSegmentsCount > 0 ? next.offlineSegmentsCount : current.offlineSegmentsCount,
    gpsQualitySummary: next.gpsQualitySummary ?? current.gpsQualitySummary,
    routeMatchSummary: pickPreferredRouteMatchSummary(
      next.routeMatchSummary,
      current.routeMatchSummary,
    ),
    routeTraceGeoJson:
      shouldPreferAuthoritativeNextRoute
        ? next.routeTraceGeoJson ?? current.routeTraceGeoJson
        : shouldPreferCurrentRoute || !next.routeTraceGeoJson
        ? current.routeTraceGeoJson ?? next.routeTraceGeoJson
        : next.routeTraceGeoJson,
    rawGpsPointCount: next.rawGpsPointCount > 0 ? next.rawGpsPointCount : current.rawGpsPointCount,
    matchedPointCount:
      next.matchedPointCount > 0 ? next.matchedPointCount : current.matchedPointCount,
    syncStatus:
      current.syncStatus === 'SYNCED' || next.syncStatus === 'SYNCED'
        ? 'SYNCED'
        : next.syncStatus ?? current.syncStatus,
    tripState:
      current.tripState === 'SYNCED' || next.tripState === 'SYNCED'
        ? 'SYNCED'
        : next.tripState ?? current.tripState,
    driverName: next.driverName ?? current.driverName,
    driverCode: next.driverCode ?? current.driverCode,
    vehiclePlateNumber: next.vehiclePlateNumber ?? current.vehiclePlateNumber,
    vehicleId: next.vehicleId ?? current.vehicleId,
    routeId: next.routeId ?? current.routeId,
    assignedRouteId: next.assignedRouteId ?? current.assignedRouteId,
    routeName: next.routeName ?? current.routeName,
    todaId: next.todaId ?? current.todaId,
    rawTelemetry: next.rawTelemetry.length > 0 ? next.rawTelemetry : current.rawTelemetry,
  };
};

export const normalizeTripHistoryItem = (
  item: Partial<TripHistoryItem> & { routePath?: unknown; rawTelemetry?: unknown },
): TripHistoryItem => {
  const rawTelemetry = normalizeTripTelemetryArray(item.rawTelemetry);
  const routePath = (() => {
    const directRoute = dedupeSequentialTripCoordinates(normalizeTripCoordinateArray(item.routePath));
    if (directRoute.length > 1) {
      return directRoute;
    }
    const geoJsonRoute = normalizeGeoJsonRoutePath(item.routeTraceGeoJson);
    if (geoJsonRoute.length > 1) {
      return geoJsonRoute;
    }
    const telemetryRoute = dedupeSequentialTripCoordinates(
      rawTelemetry.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );
    return telemetryRoute;
  })();
  const distanceKm =
    typeof item.totalDistanceMatchedMeters === 'number' && item.totalDistanceMatchedMeters > 0
      ? item.totalDistanceMatchedMeters / 1000
      : polylineDistanceMeters(routePath) / 1000;
  const durationSeconds = Number(item.durationSeconds ?? 0);
  const parsedFareAmount =
    typeof item.fareAmount === 'number' && Number.isFinite(item.fareAmount)
      ? item.fareAmount
      : Number(String(item.fare ?? '').replace(/[^\d.-]/g, ''));
  const fareAmount = Number.isFinite(parsedFareAmount) ? roundMetric(parsedFareAmount, 2) : 0;
  const normalizedDashedEndConnector = normalizeTripCoordinateArray(item.dashedEndConnector);
  const resolvedMatchedEndPoint = isValidCoordinate(item.endLocationMatched)
    ? item.endLocationMatched
    : routePath.at(-1) ?? null;
  const resolvedRawEndPoint = isValidCoordinate(item.endLocationRaw) ? item.endLocationRaw : null;
  const resolvedStartCoordinate = isValidCoordinate(item.startCoordinate)
    ? item.startCoordinate
    : isValidCoordinate(item.startLocationMatched)
      ? item.startLocationMatched
      : routePath[0] ?? (isValidCoordinate(item.startLocationRaw) ? item.startLocationRaw : null);
  const resolvedEndCoordinate = isValidCoordinate(item.endCoordinate)
    ? item.endCoordinate
    : resolvedMatchedEndPoint ?? routePath.at(-1) ?? resolvedRawEndPoint;
  const resolvedRoadEndPoint = routePath.at(-1) ?? resolvedMatchedEndPoint;
  const shouldBuildDefaultEndConnector =
    normalizedDashedEndConnector.length === 0 &&
    resolvedRoadEndPoint &&
    resolvedMatchedEndPoint &&
    distanceBetweenMeters(resolvedRoadEndPoint, resolvedMatchedEndPoint) >= 3;

  return {
    id: String(item.id ?? ''),
    tripDate: item.tripDate ?? new Date().toISOString().slice(0, 10),
    duration: formatDurationLabel(durationSeconds),
    distance: formatTripReceiptDistance(distanceKm * 1000),
    fare: formatTripReceiptFare(fareAmount),
    fareAmount,
    violations: item.violations ?? '0',
    status: item.status ?? 'COMPLETED',
    compliance: typeof item.compliance === 'number' ? item.compliance : 100,
    routePath,
    rawStartPoint: isValidCoordinate(item.rawStartPoint) ? item.rawStartPoint : null,
    startLocationRaw: isValidCoordinate(item.startLocationRaw)
      ? item.startLocationRaw
      : isValidCoordinate(item.rawStartPoint)
        ? item.rawStartPoint
        : null,
    startLocationMatched: isValidCoordinate(item.startLocationMatched)
      ? item.startLocationMatched
      : routePath[0] ?? null,
    endLocationRaw: resolvedRawEndPoint,
    endLocationMatched: resolvedMatchedEndPoint,
    startDisplayName: normalizeEndpointDisplayName(item.startDisplayName, resolvedStartCoordinate, 'Pickup'),
    endDisplayName: normalizeEndpointDisplayName(item.endDisplayName, resolvedEndCoordinate, 'Destination'),
    startCoordinate: resolvedStartCoordinate,
    endCoordinate: resolvedEndCoordinate,
    dashedStartConnector: normalizeTripCoordinateArray(item.dashedStartConnector),
    dashedEndConnector:
      normalizedDashedEndConnector.length > 0
        ? normalizedDashedEndConnector
        : shouldBuildDefaultEndConnector
          ? buildTripConnector({
              from: resolvedRoadEndPoint,
              to: resolvedMatchedEndPoint,
            })
          : buildTripConnector({
              from: resolvedRoadEndPoint ?? resolvedMatchedEndPoint,
              to: resolvedRawEndPoint,
            }),
    startedAt: typeof item.startedAt === 'string' ? item.startedAt : null,
    endedAt: typeof item.endedAt === 'string' ? item.endedAt : null,
    durationSeconds,
    totalDistanceRawMeters: Number(item.totalDistanceRawMeters ?? 0),
    totalDistanceMatchedMeters:
      typeof item.totalDistanceMatchedMeters === 'number'
        ? item.totalDistanceMatchedMeters
        : polylineDistanceMeters(routePath),
    averageSpeedKph: Number(item.averageSpeedKph ?? 0),
    maxSpeedKph: Number(item.maxSpeedKph ?? deriveMaxSpeedKph(rawTelemetry)),
    idleDurationSeconds: Number(item.idleDurationSeconds ?? deriveIdleDurationSeconds(rawTelemetry)),
    offlineSegmentsCount: Number(item.offlineSegmentsCount ?? 0),
    gpsQualitySummary: item.gpsQualitySummary ?? buildGpsQualitySummary(rawTelemetry),
    routeMatchSummary:
      item.routeMatchSummary && typeof item.routeMatchSummary === 'object'
        ? (item.routeMatchSummary as TripRouteMatchSummary)
        : null,
    routeTraceGeoJson:
      item.routeTraceGeoJson && typeof item.routeTraceGeoJson === 'object'
        ? (item.routeTraceGeoJson as TripRouteGeoJson)
        : buildRouteTraceGeoJson(routePath),
    rawGpsPointCount: Number(item.rawGpsPointCount ?? rawTelemetry.length),
    matchedPointCount: Number(item.matchedPointCount ?? routePath.length),
    syncStatus: item.syncStatus ?? 'SYNC_PENDING',
    tripState: item.tripState ?? (item.syncStatus === 'SYNCED' ? 'SYNCED' : 'COMPLETED'),
    driverName: item.driverName ?? null,
    driverCode: item.driverCode ?? null,
    vehiclePlateNumber: item.vehiclePlateNumber ?? null,
    vehicleId: item.vehicleId ?? null,
    routeId: item.routeId ?? null,
    assignedRouteId: item.assignedRouteId ?? null,
    routeName: item.routeName ?? null,
    todaId: item.todaId ?? null,
    rawTelemetry,
  };
};

export const buildTripHistoryItem = ({
  id,
  tripDate,
  fare,
  durationSeconds,
  matchedRoutePath,
  rawTelemetry = [],
  rawStartPoint = null,
  rawEndPoint = null,
  matchedStartPoint = null,
  matchedEndPoint = null,
  dashedStartConnector = [],
  dashedEndConnector = [],
  status = 'COMPLETED',
  compliance = 100,
  violations = '0',
  syncStatus = 'SYNC_PENDING',
  tripState = 'COMPLETED',
  driverName = null,
  driverCode = null,
  vehiclePlateNumber = null,
  vehicleId = null,
  routeId = null,
  assignedRouteId = null,
  routeName = null,
  todaId = null,
  averageSpeedKph = null,
  maxSpeedKph = null,
  idleDurationSeconds = null,
  offlineSegmentsCount = 0,
  gpsQualitySummary = null,
  routeMatchSummary = null,
  routeTraceGeoJson = null,
  rawGpsPointCount = null,
  matchedPointCount = null,
  startDisplayName = null,
  endDisplayName = null,
  startCoordinate = null,
  endCoordinate = null,
  startedAt = null,
  endedAt = null,
  distanceKm = null,
}: {
  id: string;
  tripDate: string;
  fare: number;
  durationSeconds: number;
  matchedRoutePath: TripCoordinate[];
  rawTelemetry?: TripTelemetryPoint[];
  rawStartPoint?: TripCoordinate | null;
  rawEndPoint?: TripCoordinate | null;
  matchedStartPoint?: TripCoordinate | null;
  matchedEndPoint?: TripCoordinate | null;
  dashedStartConnector?: TripCoordinate[];
  dashedEndConnector?: TripCoordinate[];
  status?: TripHistoryItem['status'];
  compliance?: number;
  violations?: string;
  syncStatus?: TripSyncStatus;
  tripState?: TripTrackingState;
  driverName?: string | null;
  driverCode?: string | null;
  vehiclePlateNumber?: string | null;
  vehicleId?: string | null;
  routeId?: string | null;
  assignedRouteId?: string | null;
  routeName?: string | null;
  todaId?: string | null;
  averageSpeedKph?: number | null;
  maxSpeedKph?: number | null;
  idleDurationSeconds?: number | null;
  offlineSegmentsCount?: number;
  gpsQualitySummary?: TripGpsQualitySummary | null;
  routeMatchSummary?: TripRouteMatchSummary | null;
  routeTraceGeoJson?: TripRouteGeoJson | null;
  rawGpsPointCount?: number | null;
  matchedPointCount?: number | null;
  startDisplayName?: string | null;
  endDisplayName?: string | null;
  startCoordinate?: TripCoordinate | null;
  endCoordinate?: TripCoordinate | null;
  startedAt?: string | null;
  endedAt?: string | null;
  distanceKm?: number | null;
}): TripHistoryItem => {
  const normalizedRoutePath = normalizeTripCoordinateArray(matchedRoutePath);
  const normalizedRawTelemetry = normalizeTripTelemetryArray(rawTelemetry);
  const normalizedDashedEndConnector = normalizeTripCoordinateArray(dashedEndConnector);
  const rawPath = normalizedRawTelemetry.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  const totalDistanceRawMeters = polylineDistanceMeters(rawPath);
  const measuredRouteDistanceMeters = polylineDistanceMeters(normalizedRoutePath);
  const totalDistanceMatchedMeters =
    typeof distanceKm === 'number' && Number.isFinite(distanceKm)
      ? Math.max(0, distanceKm * 1000)
      : measuredRouteDistanceMeters;
  const resolvedAverageSpeedKph =
    averageSpeedKph !== null && typeof averageSpeedKph === 'number'
      ? averageSpeedKph
      : durationSeconds > 0
        ? (totalDistanceMatchedMeters / 1000) / (durationSeconds / 3600)
        : 0;
  const resolvedMaxSpeedKph =
    maxSpeedKph !== null && typeof maxSpeedKph === 'number'
      ? maxSpeedKph
      : deriveMaxSpeedKph(normalizedRawTelemetry);
  const resolvedIdleDurationSeconds =
    idleDurationSeconds !== null && typeof idleDurationSeconds === 'number'
      ? idleDurationSeconds
      : deriveIdleDurationSeconds(normalizedRawTelemetry);
  const resolvedGpsQualitySummary =
    gpsQualitySummary ?? buildGpsQualitySummary(normalizedRawTelemetry);
  const resolvedMatchedStartPoint = matchedStartPoint ?? normalizedRoutePath[0] ?? null;
  const resolvedMatchedEndPoint = matchedEndPoint ?? normalizedRoutePath.at(-1) ?? null;
  const resolvedStartCoordinate =
    startCoordinate ?? resolvedMatchedStartPoint ?? normalizedRoutePath[0] ?? rawStartPoint;
  const resolvedEndCoordinate =
    endCoordinate ?? resolvedMatchedEndPoint ?? normalizedRoutePath.at(-1) ?? rawEndPoint;
  const resolvedRoadEndPoint = normalizedRoutePath.at(-1) ?? resolvedMatchedEndPoint;
  const shouldBuildMatchedEndConnector =
    normalizedDashedEndConnector.length === 0 &&
    resolvedRoadEndPoint &&
    resolvedMatchedEndPoint &&
    distanceBetweenMeters(resolvedRoadEndPoint, resolvedMatchedEndPoint) >= 3;

  return {
    id,
    tripDate,
    duration: formatDurationLabel(durationSeconds),
    distance: formatTripReceiptDistance(totalDistanceMatchedMeters),
    fare: formatTripReceiptFare(fare),
    fareAmount: roundMetric(fare, 2),
    violations,
    status,
    compliance,
    routePath: normalizedRoutePath,
    rawStartPoint,
    startLocationRaw: rawStartPoint,
    startLocationMatched: resolvedMatchedStartPoint,
    endLocationRaw: rawEndPoint,
    endLocationMatched: resolvedMatchedEndPoint,
    startDisplayName: normalizeEndpointDisplayName(
      startDisplayName,
      resolvedStartCoordinate,
      'Pickup',
    ),
    endDisplayName: normalizeEndpointDisplayName(
      endDisplayName,
      resolvedEndCoordinate,
      'Destination',
    ),
    startCoordinate: resolvedStartCoordinate,
    endCoordinate: resolvedEndCoordinate,
    dashedStartConnector:
      normalizeTripCoordinateArray(dashedStartConnector).length > 0
        ? normalizeTripCoordinateArray(dashedStartConnector)
        : buildTripConnector({
            from: rawStartPoint,
            to: resolvedMatchedStartPoint,
            minDistanceMeters: 6,
          }),
    dashedEndConnector:
      normalizedDashedEndConnector.length > 0
        ? normalizedDashedEndConnector
        : shouldBuildMatchedEndConnector
          ? buildTripConnector({
              from: resolvedRoadEndPoint,
              to: resolvedMatchedEndPoint,
            })
        : buildTripConnector({
            from: resolvedRoadEndPoint ?? resolvedMatchedEndPoint,
            to: rawEndPoint,
          }),
    startedAt: startedAt ?? normalizedRawTelemetry[0]?.recordedAt ?? null,
    endedAt: endedAt ?? normalizedRawTelemetry.at(-1)?.recordedAt ?? null,
    durationSeconds,
    totalDistanceRawMeters: roundMetric(totalDistanceRawMeters, 1),
    totalDistanceMatchedMeters: roundMetric(totalDistanceMatchedMeters, 1),
    averageSpeedKph: roundMetric(resolvedAverageSpeedKph, 1),
    maxSpeedKph: roundMetric(resolvedMaxSpeedKph, 1),
    idleDurationSeconds: Math.max(0, Math.round(resolvedIdleDurationSeconds)),
    offlineSegmentsCount: Math.max(0, Math.round(offlineSegmentsCount)),
    gpsQualitySummary: resolvedGpsQualitySummary,
    routeMatchSummary,
    routeTraceGeoJson: routeTraceGeoJson ?? buildRouteTraceGeoJson(normalizedRoutePath),
    rawGpsPointCount:
      typeof rawGpsPointCount === 'number' && Number.isFinite(rawGpsPointCount)
        ? Math.max(0, Math.round(rawGpsPointCount))
        : normalizedRawTelemetry.length,
    matchedPointCount: matchedPointCount ?? normalizedRoutePath.length,
    syncStatus,
    tripState,
    driverName,
    driverCode,
    vehiclePlateNumber,
    vehicleId,
    routeId,
    assignedRouteId,
    routeName,
    todaId,
    rawTelemetry: normalizedRawTelemetry,
  };
};

export const resolveTripHistoryRoutePath = (
  item: Pick<
    TripHistoryItem,
    'routePath' | 'routeTraceGeoJson' | 'rawTelemetry' | 'routeMatchSummary' | 'syncStatus'
  >,
) => {
  const authoritativeGeoJsonRoute = normalizeGeoJsonRoutePath(item.routeTraceGeoJson);
  const shouldPreferAuthoritativeGeoJson =
    item.syncStatus === 'SYNCED' &&
    typeof item.routeMatchSummary?.provider === 'string' &&
    item.routeMatchSummary.provider !== 'local-directional' &&
    authoritativeGeoJsonRoute.length > 1;
  if (shouldPreferAuthoritativeGeoJson) {
    return authoritativeGeoJsonRoute;
  }
  const directRoute = dedupeSequentialTripCoordinates(item.routePath);
  if (directRoute.length > 1) {
    return directRoute;
  }
  if (authoritativeGeoJsonRoute.length > 1) {
    return authoritativeGeoJsonRoute;
  }
  return dedupeSequentialTripCoordinates(
    item.rawTelemetry.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );
};
