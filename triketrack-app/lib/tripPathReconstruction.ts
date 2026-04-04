import {
  dedupeSequentialPoints,
  fetchGoogleSnappedRoadPath,
  fetchPreferredRoadPath,
  polylineDistanceKm,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from './roadPath';

export type RawTripTelemetryPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
};

type RouteMatchingService = {
  name: 'google-roads' | 'preferred-road-match';
  matchPath: (points: LatLngPoint[]) => Promise<LatLngPoint[] | null>;
};

export type TripPathReconstructionResult = {
  acceptedTelemetry: RawTripTelemetryPoint[];
  rawAcceptedPath: LatLngPoint[];
  reconstructedPath: LatLngPoint[];
  matchedProvider: RouteMatchingService['name'] | null;
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
};

const DEFAULT_CONFIG: ReconstructionConfig = {
  maxAccuracyMeters: 28,
  maxJumpKm: 0.3,
  maxSpeedKmh: 110,
  minMovementKm: 0.003,
  stationarySpeedKmh: 2.5,
  chunkSize: 40,
  chunkOverlap: 6,
};

// Providers are intentionally abstracted so we can swap or reorder road-matching
// backends later without rewriting trip-completion logic.
const MATCHING_SERVICES: RouteMatchingService[] = [
  {
    name: 'google-roads',
    matchPath: fetchGoogleSnappedRoadPath,
  },
  {
    name: 'preferred-road-match',
    matchPath: fetchPreferredRoadPath,
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

  return accepted;
};

const matchChunkedPath = async (
  points: LatLngPoint[],
  config: ReconstructionConfig,
): Promise<{ path: LatLngPoint[] | null; provider: RouteMatchingService['name'] | null }> => {
  // Long trips are reconstructed in overlapping windows so providers with point
  // limits can still return one continuous-looking route.
  const chunks = buildChunks(points, config.chunkSize, config.chunkOverlap);

  for (const service of MATCHING_SERVICES) {
    const matchedChunks: LatLngPoint[][] = [];
    let failed = false;

    for (const chunk of chunks) {
      const matched = await service.matchPath(chunk);
      if (!matched || matched.length < 2) {
        failed = true;
        break;
      }
      matchedChunks.push(matched);
    }

    if (!failed) {
      const merged = mergeMatchedChunks(matchedChunks);
      if (merged.length >= 2) {
        return { path: merged, provider: service.name };
      }
    }
  }

  return { path: null, provider: null };
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
      reconstructedPath: rawAcceptedPath,
      matchedProvider: null,
      status: 'insufficient_points',
    };
  }

  const { path: matchedPath, provider } = await matchChunkedPath(rawAcceptedPath, resolvedConfig);
  const reconstructedPath = smoothDisplayedRoutePath(matchedPath ?? rawAcceptedPath);

  return {
    acceptedTelemetry,
    rawAcceptedPath,
    reconstructedPath,
    matchedProvider: provider,
    status: matchedPath ? 'matched' : 'fallback',
  };
}

export const summarizeReconstructedDistanceKm = (path: LatLngPoint[]) => polylineDistanceKm(path);
