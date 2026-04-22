import {
  buildDirectionalRoadSnappedPath,
  fetchOsrmMatchedRoadPathDetailed,
  dedupeSequentialPoints,
  type RoadPathMatchMetadata,
  type RoadPathMatchProvider,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from './roadPath';
import { buildRoadCenterlinePath, projectPointToRoadPath } from './tripTrace';

export type RawTripTelemetryPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
  provider?: string | null;
};

type RouteMatchingService = {
  name:
    | 'local-directional'
    | 'osrm-match';
  matchPath: (points: LatLngPoint[]) => Promise<{
    path: LatLngPoint[] | null;
    metadata: RoadPathMatchMetadata | null;
  }>;
};

export type TripPathReconstructionResult = {
  acceptedTelemetry: RawTripTelemetryPoint[];
  rawAcceptedPath: LatLngPoint[];
  smoothedAcceptedPath: LatLngPoint[];
  preprocessedPath: LatLngPoint[];
  reconstructedPath: LatLngPoint[];
  matchedProvider: RoadPathMatchProvider | null;
  routeMatchMetadata: RoadPathMatchMetadata | null;
  rejectedOutlierCount: number;
  status: 'matched' | 'fallback' | 'insufficient_points';
};

type ReconstructionConfig = {
  maxAccuracyMeters: number;
  maxJumpKm: number;
  maxSpeedKmh: number;
  minMovementKm: number;
  stationarySpeedKmh: number;
  chunkSize: number;
  chunkOverlap: number;
  kalmanBaseMeasurementNoiseMeters: number;
  kalmanProcessNoiseMeters: number;
  simplificationToleranceKm: number;
  maxSpikeTurnAngleDeg: number;
  maxSpikeOffsetKm: number;
  maxSpikeSegmentKm: number;
};

const DEFAULT_CONFIG: ReconstructionConfig = {
  maxAccuracyMeters: 30,
  maxJumpKm: 0.3,
  maxSpeedKmh: 110,
  minMovementKm: 0.003,
  stationarySpeedKmh: 2.5,
  chunkSize: 40,
  chunkOverlap: 6,
  kalmanBaseMeasurementNoiseMeters: 6,
  kalmanProcessNoiseMeters: 2.2,
  simplificationToleranceKm: 0.003,
  maxSpikeTurnAngleDeg: 145,
  maxSpikeOffsetKm: 0.008,
  maxSpikeSegmentKm: 0.08,
};

// Providers are intentionally abstracted so we can swap or reorder road-matching
// backends later without rewriting trip-completion logic.
const REMOTE_MATCHING_SERVICES: RouteMatchingService[] = [
  {
    name: 'osrm-match',
    matchPath: fetchOsrmMatchedRoadPathDetailed,
  },
];

const LOCAL_DIRECTIONAL_MATCHING_SERVICE: RouteMatchingService = {
  name: 'local-directional',
  matchPath: async (points) => {
    const localPath = buildDirectionalRoadSnappedPath(points);
    return {
      path: localPath.length >= 2 ? localPath : null,
      metadata:
        localPath.length >= 2
          ? {
              provider: 'local-directional',
              confidence: null,
              roadNames: [],
              distanceMeters: null,
              durationSeconds: null,
              inputPointCount: points.length,
              matchedPointCount: localPath.length,
            }
          : null,
    };
  },
};

const MATCHING_SERVICES: RouteMatchingService[] = [
  ...REMOTE_MATCHING_SERVICES,
  {
    ...LOCAL_DIRECTIONAL_MATCHING_SERVICE,
  },
];

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

const distancePointToSegmentKm = (point: LatLngPoint, start: LatLngPoint, end: LatLngPoint) => {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = start.longitude;
  const y1 = start.latitude;
  const x2 = end.longitude;
  const y2 = end.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    return distanceBetweenKm(point, start);
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return distanceBetweenKm(point, {
    latitude: y1 + t * dy,
    longitude: x1 + t * dx,
  });
};

const turnAngleDeg = (prev: LatLngPoint, current: LatLngPoint, next: LatLngPoint) => {
  const vectorA = {
    x: current.longitude - prev.longitude,
    y: current.latitude - prev.latitude,
  };
  const vectorB = {
    x: next.longitude - current.longitude,
    y: next.latitude - current.latitude,
  };

  const magA = Math.sqrt(vectorA.x * vectorA.x + vectorA.y * vectorA.y);
  const magB = Math.sqrt(vectorB.x * vectorB.x + vectorB.y * vectorB.y);
  if (magA < 1e-12 || magB < 1e-12) {
    return 0;
  }

  const cosine = Math.max(
    -1,
    Math.min(1, (vectorA.x * vectorB.x + vectorA.y * vectorB.y) / (magA * magB)),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
};

const toLocalMeters = (point: LatLngPoint, origin: LatLngPoint) => {
  const lonScale = 111320 * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * lonScale,
    y: (point.latitude - origin.latitude) * 111320,
  };
};

const fromLocalMeters = (origin: LatLngPoint, xMeters: number, yMeters: number): LatLngPoint => {
  const lonScale = 111320 * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    latitude: origin.latitude + yMeters / 111320,
    longitude: origin.longitude + xMeters / Math.max(lonScale, 0.000001),
  };
};

const pruneNearbyTelemetryPoints = (
  points: RawTripTelemetryPoint[],
  minDistanceKm: number,
) => {
  if (points.length <= 1) {
    return points;
  }

  const deduped: RawTripTelemetryPoint[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const nextPoint = points[index];
    const previousKeptPoint = deduped[deduped.length - 1];
    const movedKm = distanceBetweenKm(previousKeptPoint, nextPoint);
    const isLastPoint = index === points.length - 1;

    if (movedKm < minDistanceKm) {
      if (isLastPoint) {
        deduped[deduped.length - 1] = nextPoint;
      }
      continue;
    }

    deduped.push(nextPoint);
  }

  return deduped;
};

const applyKalmanSmoothingToTelemetry = (
  telemetry: RawTripTelemetryPoint[],
  config: ReconstructionConfig,
) => {
  if (telemetry.length < 2) {
    return telemetry;
  }

  const origin = {
    latitude: telemetry[0].latitude,
    longitude: telemetry[0].longitude,
  };
  const firstMeasurement = toLocalMeters(origin, origin);
  let filteredX = firstMeasurement.x;
  let filteredY = firstMeasurement.y;
  let uncertaintyX = Math.max(
    config.kalmanBaseMeasurementNoiseMeters,
    telemetry[0].accuracy ?? config.kalmanBaseMeasurementNoiseMeters,
  ) ** 2;
  let uncertaintyY = uncertaintyX;
  let previousTimestampMs = new Date(telemetry[0].recordedAt).getTime();

  return telemetry.map((point, index) => {
    if (index === 0) {
      return point;
    }

    const measurement = toLocalMeters(point, origin);
    const currentTimestampMs = new Date(point.recordedAt).getTime();
    const deltaSeconds = Math.max((currentTimestampMs - previousTimestampMs) / 1000, 0.001);
    previousTimestampMs = currentTimestampMs;
    const previousRawPoint = telemetry[index - 1];
    const observedMovementMeters =
      distanceBetweenKm(previousRawPoint, point) * 1000;
    const fallbackSpeedMetersPerSecond = observedMovementMeters / deltaSeconds;
    const speedMetersPerSecond =
      typeof point.speed === 'number' && Number.isFinite(point.speed)
        ? point.speed / 3.6
        : fallbackSpeedMetersPerSecond;
    const measurementNoiseMeters = Math.max(
      config.kalmanBaseMeasurementNoiseMeters,
      point.accuracy ?? config.kalmanBaseMeasurementNoiseMeters,
    );
    const processNoiseMeters = Math.max(
      config.kalmanProcessNoiseMeters,
      speedMetersPerSecond * deltaSeconds * 0.55,
      observedMovementMeters * 0.22,
    );
    const measurementVariance = measurementNoiseMeters * measurementNoiseMeters;
    const processVariance = processNoiseMeters * processNoiseMeters;

    uncertaintyX += processVariance;
    const gainX = uncertaintyX / (uncertaintyX + measurementVariance);
    filteredX += gainX * (measurement.x - filteredX);
    uncertaintyX = Math.max((1 - gainX) * uncertaintyX, 1);

    uncertaintyY += processVariance;
    const gainY = uncertaintyY / (uncertaintyY + measurementVariance);
    filteredY += gainY * (measurement.y - filteredY);
    uncertaintyY = Math.max((1 - gainY) * uncertaintyY, 1);

    const smoothedPoint = fromLocalMeters(origin, filteredX, filteredY);
    return {
      ...point,
      latitude: smoothedPoint.latitude,
      longitude: smoothedPoint.longitude,
    };
  });
};

const pruneDirectionalOutliers = (
  telemetry: RawTripTelemetryPoint[],
  config: ReconstructionConfig,
) => {
  if (telemetry.length < 3) {
    return {
      telemetry,
      rejectedCount: 0,
    };
  }

  const kept: RawTripTelemetryPoint[] = [telemetry[0]];
  let rejectedCount = 0;

  for (let index = 1; index < telemetry.length - 1; index += 1) {
    const previous = kept[kept.length - 1];
    const current = telemetry[index];
    const next = telemetry[index + 1];
    const previousPoint = {
      latitude: previous.latitude,
      longitude: previous.longitude,
    };
    const currentPoint = {
      latitude: current.latitude,
      longitude: current.longitude,
    };
    const nextPoint = {
      latitude: next.latitude,
      longitude: next.longitude,
    };
    const previousSegmentKm = distanceBetweenKm(previousPoint, currentPoint);
    const nextSegmentKm = distanceBetweenKm(currentPoint, nextPoint);
    const bridgedSegmentKm = distanceBetweenKm(previousPoint, nextPoint);
    const offsetKm = distancePointToSegmentKm(currentPoint, previousPoint, nextPoint);
    const angleDeg = turnAngleDeg(previousPoint, currentPoint, nextPoint);
    const isShortSpike =
      previousSegmentKm <= config.maxSpikeSegmentKm &&
      nextSegmentKm <= config.maxSpikeSegmentKm;
    const isNeedleTurn =
      angleDeg >= config.maxSpikeTurnAngleDeg &&
      offsetKm >= config.maxSpikeOffsetKm * 0.55;
    const isLargeSideStep =
      offsetKm >= config.maxSpikeOffsetKm &&
      bridgedSegmentKm <= (previousSegmentKm + nextSegmentKm) * 0.6;

    if (isShortSpike && (isNeedleTurn || isLargeSideStep)) {
      rejectedCount += 1;
      continue;
    }

    kept.push(current);
  }

  kept.push(telemetry[telemetry.length - 1]);
  return {
    telemetry: pruneNearbyTelemetryPoints(
      kept,
      Math.max(config.minMovementKm * 0.8, 0.0025),
    ),
    rejectedCount,
  };
};

const resolveSimplificationToleranceKm = (
  points: LatLngPoint[],
  config: ReconstructionConfig,
) => {
  const pathDistanceKm = polylineDistanceKm(points);
  if (pathDistanceKm <= 0.08) {
    return Math.min(config.simplificationToleranceKm, 0.0012);
  }
  if (pathDistanceKm <= 0.2) {
    return Math.min(config.simplificationToleranceKm, 0.0018);
  }
  if (pathDistanceKm <= 0.6) {
    return Math.min(config.simplificationToleranceKm, 0.0026);
  }
  return config.simplificationToleranceKm;
};

const simplifyDouglasPeuckerPath = (
  points: LatLngPoint[],
  toleranceKm: number,
): LatLngPoint[] => {
  if (points.length <= 2 || toleranceKm <= 0) {
    return points;
  }

  const keep = new Set<number>([0, points.length - 1]);

  const visitSegment = (startIndex: number, endIndex: number) => {
    let maxDistanceKm = 0;
    let maxDistanceIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distanceKm = distancePointToSegmentKm(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distanceKm > maxDistanceKm) {
        maxDistanceKm = distanceKm;
        maxDistanceIndex = index;
      }
    }

    if (maxDistanceIndex === -1 || maxDistanceKm < toleranceKm) {
      return;
    }

    keep.add(maxDistanceIndex);
    visitSegment(startIndex, maxDistanceIndex);
    visitSegment(maxDistanceIndex, endIndex);
  };

  visitSegment(0, points.length - 1);
  return points.filter((_, index) => keep.has(index));
};

const buildChunks = (points: LatLngPoint[], chunkSize: number, overlap: number) => {
  if (points.length <= chunkSize) {
    return [points];
  }

  const chunks: LatLngPoint[][] = [];
  const step = Math.max(2, chunkSize - overlap);
  for (let index = 0; index < points.length; index += step) {
    const chunk = points.slice(index, index + chunkSize);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
    if (index + chunkSize >= points.length) {
      break;
    }
  }
  return chunks;
};

const mergeMatchedChunks = (chunks: LatLngPoint[][]) =>
  dedupeSequentialPoints(chunks.flatMap((chunk) => chunk));

const matchChunkedTelemetryPath = async (
  telemetry: RawTripTelemetryPoint[],
  config: ReconstructionConfig,
): Promise<{
  path: LatLngPoint[] | null;
  provider: RoadPathMatchProvider | null;
  metadata: RoadPathMatchMetadata | null;
}> => {
  if (telemetry.length < 2) {
    return { path: null, provider: null, metadata: null };
  }

  const chunks: RawTripTelemetryPoint[][] = [];
  const step = Math.max(2, config.chunkSize - config.chunkOverlap);
  for (let index = 0; index < telemetry.length; index += step) {
    const chunk = telemetry.slice(index, index + config.chunkSize);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
    if (index + config.chunkSize >= telemetry.length) {
      break;
    }
  }

  const matchedChunks: LatLngPoint[][] = [];
  const matchedChunkMetadata: Array<RoadPathMatchMetadata | null> = [];

  for (const chunk of chunks) {
    if (chunk.length < 2) {
      return { path: null, provider: null, metadata: null };
    }

    const matched = await fetchOsrmMatchedRoadPathDetailed(
      chunk.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy ?? null,
        heading: point.heading ?? null,
        speed: point.speed ?? null,
        recordedAt: point.recordedAt,
      })),
    );
    if (!matched.path || matched.path.length < 2) {
      return { path: null, provider: null, metadata: null };
    }

    matchedChunks.push(matched.path);
    matchedChunkMetadata.push(matched.metadata);
  }

  const merged = mergeMatchedChunks(matchedChunks);
  if (merged.length < 2) {
    return { path: null, provider: null, metadata: null };
  }

  return {
    path: merged,
    provider: 'osrm-match',
    metadata: mergeRoadPathMatchMetadata(matchedChunkMetadata, merged, telemetry.length),
  };
};

const selectEndpointTelemetryPoint = (
  telemetry: RawTripTelemetryPoint[],
  {
    fromStart,
    maxAccuracyMeters,
  }: {
    fromStart: boolean;
    maxAccuracyMeters: number;
  },
) => {
  const ordered = fromStart ? telemetry : [...telemetry].reverse();
  return (
    ordered.find((point) => {
      const accuracyMeters =
        typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)
          ? point.accuracy
          : null;
      return accuracyMeters === null || accuracyMeters <= maxAccuracyMeters;
    }) ?? null
  );
};

const trimMatchedPathToTelemetryEndpoints = (
  matchedPath: LatLngPoint[],
  telemetry: RawTripTelemetryPoint[],
  acceptedTelemetry: RawTripTelemetryPoint[],
) => {
  const cleanMatchedPath = dedupeSequentialPoints(matchedPath);
  if (cleanMatchedPath.length < 2 || telemetry.length < 2) {
    return cleanMatchedPath;
  }

  const startTelemetryPoint =
    selectEndpointTelemetryPoint(telemetry, {
      fromStart: true,
      maxAccuracyMeters: 45,
    }) ?? acceptedTelemetry[0] ?? telemetry[0];
  const endTelemetryPoint =
    selectEndpointTelemetryPoint(telemetry, {
      fromStart: false,
      maxAccuracyMeters: 45,
    }) ??
    acceptedTelemetry[acceptedTelemetry.length - 1] ??
    telemetry[telemetry.length - 1];

  if (!startTelemetryPoint || !endTelemetryPoint) {
    return cleanMatchedPath;
  }

  const acceptedStartPoint = {
    latitude: startTelemetryPoint.latitude,
    longitude: startTelemetryPoint.longitude,
  };
  const acceptedEndPoint = {
    latitude: endTelemetryPoint.latitude,
    longitude: endTelemetryPoint.longitude,
  };
  const defaultStartProjection = projectPointToRoadPath(cleanMatchedPath[0], cleanMatchedPath);
  const defaultEndProjection = projectPointToRoadPath(
    cleanMatchedPath[cleanMatchedPath.length - 1],
    cleanMatchedPath,
  );
  const candidateStartProjection = projectPointToRoadPath(acceptedStartPoint, cleanMatchedPath);
  const candidateEndProjection = projectPointToRoadPath(acceptedEndPoint, cleanMatchedPath);
  const startProjection =
    candidateStartProjection && candidateStartProjection.distanceKm <= 0.03
      ? candidateStartProjection
      : defaultStartProjection;
  const endProjection =
    candidateEndProjection && candidateEndProjection.distanceKm <= 0.03
      ? candidateEndProjection
      : defaultEndProjection;

  if (!startProjection || !endProjection) {
    return cleanMatchedPath;
  }

  const trimmedPath = buildRoadCenterlinePath({
    roadPath: cleanMatchedPath,
    startProjection,
    endProjection,
    maxBacktrackKm: 1,
  });

  return trimmedPath.length > 1 ? dedupeSequentialPoints(trimmedPath) : cleanMatchedPath;
};

const mergeRoadPathMatchMetadata = (
  metadatas: Array<RoadPathMatchMetadata | null>,
  mergedPath: LatLngPoint[],
  inputPointCount: number,
): RoadPathMatchMetadata | null => {
  const available = metadatas.filter(
    (metadata): metadata is RoadPathMatchMetadata => Boolean(metadata),
  );
  if (available.length === 0 || mergedPath.length < 2) {
    return null;
  }

  const bestConfidence = available.reduce((best, metadata) => {
    if (typeof metadata.confidence === 'number' && Number.isFinite(metadata.confidence)) {
      return Math.max(best, metadata.confidence);
    }
    return best;
  }, 0);

  return {
    provider: available[0].provider,
    confidence: bestConfidence > 0 ? bestConfidence : null,
    roadNames: available
      .flatMap((metadata) => metadata.roadNames)
      .filter((name, index, source) => source.indexOf(name) === index),
    distanceMeters: available.reduce((sum, metadata) => sum + (metadata.distanceMeters ?? 0), 0) || null,
    durationSeconds:
      available.reduce((sum, metadata) => sum + (metadata.durationSeconds ?? 0), 0) || null,
    inputPointCount,
    matchedPointCount: mergedPath.length,
  };
};

const sortTelemetry = (points: RawTripTelemetryPoint[]) =>
  [...points].sort((left, right) => {
    const leftTime = new Date(left.recordedAt).getTime();
    const rightTime = new Date(right.recordedAt).getTime();
    return leftTime - rightTime;
  });

const isFinitePoint = (point: RawTripTelemetryPoint) =>
  Number.isFinite(point.latitude) && Number.isFinite(point.longitude);

export const filterAcceptedTripTelemetry = (
  telemetry: RawTripTelemetryPoint[],
  config: Partial<ReconstructionConfig> = {},
) => {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const ordered = sortTelemetry(telemetry).filter(isFinitePoint);
  const accepted: RawTripTelemetryPoint[] = [];

  for (const point of ordered) {
    if (
      typeof point.accuracy === 'number' &&
      Number.isFinite(point.accuracy) &&
      point.accuracy > resolvedConfig.maxAccuracyMeters
    ) {
      // Skip weak fixes so reconstruction starts from plausible movement only.
      continue;
    }

    const lastAccepted = accepted[accepted.length - 1];
    if (!lastAccepted) {
      accepted.push(point);
      continue;
    }

    const previousPoint = {
      latitude: lastAccepted.latitude,
      longitude: lastAccepted.longitude,
    };
    const nextPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
    };
    const movedKm = distanceBetweenKm(previousPoint, nextPoint);
    const elapsedSeconds = Math.max(
      (new Date(point.recordedAt).getTime() - new Date(lastAccepted.recordedAt).getTime()) / 1000,
      0.001,
    );
    const derivedSpeedKmh = movedKm / (elapsedSeconds / 3600);
    const effectiveSpeedKmh =
      typeof point.speed === 'number' && Number.isFinite(point.speed) ? point.speed : derivedSpeedKmh;

    if (movedKm > resolvedConfig.maxJumpKm || effectiveSpeedKmh > resolvedConfig.maxSpeedKmh) {
      // Reject spikes that would create impossible shortcuts in the final route.
      continue;
    }

    if (
      movedKm < resolvedConfig.minMovementKm &&
      effectiveSpeedKmh <= resolvedConfig.stationarySpeedKmh
    ) {
      // Ignore stationary jitter and near-duplicate points that add visual noise.
      continue;
    }

    accepted.push(point);
  }

  return pruneNearbyTelemetryPoints(accepted, resolvedConfig.minMovementKm);
};

const appendUniqueCandidatePath = (
  candidates: LatLngPoint[][],
  seenKeys: Set<string>,
  points: LatLngPoint[],
) => {
  const normalized = dedupeSequentialPoints(points);
  if (normalized.length < 2) {
    return;
  }

  const key = normalized
    .map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
    .join('|');
  if (seenKeys.has(key)) {
    return;
  }

  seenKeys.add(key);
  candidates.push(normalized);
};

const buildRemoteRetryCandidatePaths = ({
  telemetry,
  rawAcceptedPath,
  smoothedAcceptedPath,
  resolvedConfig,
}: {
  telemetry: RawTripTelemetryPoint[];
  rawAcceptedPath: LatLngPoint[];
  smoothedAcceptedPath: LatLngPoint[];
  resolvedConfig: ReconstructionConfig;
}) => {
  const candidates: LatLngPoint[][] = [];
  const seenKeys = new Set<string>();

  appendUniqueCandidatePath(candidates, seenKeys, smoothedAcceptedPath);
  appendUniqueCandidatePath(candidates, seenKeys, rawAcceptedPath);

  const relaxedAcceptedTelemetry = filterAcceptedTripTelemetry(telemetry, {
    ...resolvedConfig,
    maxAccuracyMeters: Math.max(resolvedConfig.maxAccuracyMeters + 12, 42),
    minMovementKm: Math.max(Math.min(resolvedConfig.minMovementKm * 0.55, 0.0022), 0.0012),
    stationarySpeedKmh: Math.max(resolvedConfig.stationarySpeedKmh, 4),
  });
  const relaxedAcceptedPath = dedupeSequentialPoints(
    relaxedAcceptedTelemetry.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );

  appendUniqueCandidatePath(candidates, seenKeys, relaxedAcceptedPath);

  return candidates;
};

const matchChunkedPath = async (
  points: LatLngPoint[],
  config: ReconstructionConfig,
  services: RouteMatchingService[] = MATCHING_SERVICES,
): Promise<{
  path: LatLngPoint[] | null;
  provider: RoadPathMatchProvider | null;
  metadata: RoadPathMatchMetadata | null;
}> => {
  // Long trips are reconstructed in overlapping windows so providers with point
  // limits can still return one continuous-looking route.
  const chunks = buildChunks(points, config.chunkSize, config.chunkOverlap);

  for (const service of services) {
    const matchedChunks: LatLngPoint[][] = [];
    const matchedChunkMetadata: Array<RoadPathMatchMetadata | null> = [];
    let failed = false;

    for (const chunk of chunks) {
      const matched = await service.matchPath(chunk);
      if (!matched.path || matched.path.length < 2) {
        failed = true;
        break;
      }
      matchedChunks.push(matched.path);
      matchedChunkMetadata.push(matched.metadata);
    }

    if (!failed) {
      const merged = mergeMatchedChunks(matchedChunks);
      if (merged.length >= 2) {
        const metadata = mergeRoadPathMatchMetadata(matchedChunkMetadata, merged, points.length);
        return {
          path: merged,
          provider: metadata?.provider ?? service.name,
          metadata,
        };
      }
    }
  }

  return { path: null, provider: null, metadata: null };
};

export async function reconstructCompletedTripPath(
  telemetry: RawTripTelemetryPoint[],
  config: Partial<ReconstructionConfig> = {},
): Promise<TripPathReconstructionResult> {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const acceptedTelemetry = filterAcceptedTripTelemetry(telemetry, resolvedConfig);
  const rawAcceptedPath = dedupeSequentialPoints(
    acceptedTelemetry.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );

  if (rawAcceptedPath.length < 2) {
    return {
      acceptedTelemetry,
      rawAcceptedPath,
      smoothedAcceptedPath: rawAcceptedPath,
      preprocessedPath: rawAcceptedPath,
      reconstructedPath: rawAcceptedPath,
      matchedProvider: null,
      routeMatchMetadata: null,
      rejectedOutlierCount: 0,
      status: 'insufficient_points',
    };
  }

  const kalmanSmoothedTelemetry = applyKalmanSmoothingToTelemetry(
    acceptedTelemetry,
    resolvedConfig,
  );
  const { telemetry: deSpikedTelemetry, rejectedCount } = pruneDirectionalOutliers(
    kalmanSmoothedTelemetry,
    resolvedConfig,
  );
  const smoothedAcceptedPath = dedupeSequentialPoints(
    deSpikedTelemetry.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );
  const simplifiedPath = simplifyDouglasPeuckerPath(
    smoothedAcceptedPath,
    resolveSimplificationToleranceKm(smoothedAcceptedPath, resolvedConfig),
  );
  const preprocessedPath = dedupeSequentialPoints(
    simplifiedPath.length > 1
      ? simplifiedPath
      : smoothedAcceptedPath.length > 1
        ? smoothedAcceptedPath
        : rawAcceptedPath,
  );

  let matchedInputPath = preprocessedPath;
  let matchedPath: LatLngPoint[] | null = null;
  let provider: RoadPathMatchProvider | null = null;
  let metadata: RoadPathMatchMetadata | null = null;

  const telemetryMatchedResult = await matchChunkedTelemetryPath(
    deSpikedTelemetry.length >= 2 ? deSpikedTelemetry : acceptedTelemetry,
    resolvedConfig,
  );
  if (telemetryMatchedResult.path && telemetryMatchedResult.provider) {
    matchedPath = telemetryMatchedResult.path;
    provider = telemetryMatchedResult.provider;
    metadata = telemetryMatchedResult.metadata;
    matchedInputPath = dedupeSequentialPoints(
      (deSpikedTelemetry.length >= 2 ? deSpikedTelemetry : acceptedTelemetry).map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    );
  } else {
    const chunkMatchedResult = await matchChunkedPath(preprocessedPath, resolvedConfig);
    matchedPath = chunkMatchedResult.path;
    provider = chunkMatchedResult.provider;
    metadata = chunkMatchedResult.metadata;
  }

  if ((!matchedPath || provider === 'local-directional') && preprocessedPath.length > 1) {
    const remoteRetryCandidates = buildRemoteRetryCandidatePaths({
      telemetry,
      rawAcceptedPath,
      smoothedAcceptedPath,
      resolvedConfig,
    });

    for (const candidate of remoteRetryCandidates) {
      const remoteRetry = await matchChunkedPath(
        candidate,
        resolvedConfig,
        REMOTE_MATCHING_SERVICES,
      );
      if (remoteRetry.path && remoteRetry.provider && remoteRetry.provider !== 'local-directional') {
        matchedPath = remoteRetry.path;
        provider = remoteRetry.provider;
        metadata = remoteRetry.metadata;
        matchedInputPath = candidate;
        break;
      }
    }
  }

  if (matchedPath && provider && provider !== 'local-directional') {
    matchedPath = trimMatchedPathToTelemetryEndpoints(matchedPath, telemetry, acceptedTelemetry);
  }

  const hasAuthoritativeMatchedGeometry = Boolean(
    matchedPath && provider && provider !== 'local-directional',
  );
  const reconstructedPath = hasAuthoritativeMatchedGeometry
    ? dedupeSequentialPoints(matchedPath ?? [])
    : smoothDisplayedRoutePath(
        preprocessedPath.length > 1 ? preprocessedPath : rawAcceptedPath,
      );

  return {
    acceptedTelemetry,
    rawAcceptedPath,
    smoothedAcceptedPath,
    preprocessedPath,
    reconstructedPath,
    matchedProvider: provider,
    routeMatchMetadata:
      metadata && reconstructedPath.length >= 2
        ? {
            ...metadata,
            inputPointCount: matchedInputPath.length,
            matchedPointCount: reconstructedPath.length,
          }
        : provider && reconstructedPath.length >= 2
          ? {
              provider,
              confidence: null,
              roadNames: [],
              distanceMeters: null,
              durationSeconds: null,
              inputPointCount: matchedInputPath.length,
              matchedPointCount: reconstructedPath.length,
            }
          : null,
    rejectedOutlierCount: rejectedCount,
    status: hasAuthoritativeMatchedGeometry ? 'matched' : 'fallback',
  };
}

export const summarizeReconstructedDistanceKm = (path: LatLngPoint[]) => polylineDistanceKm(path);
