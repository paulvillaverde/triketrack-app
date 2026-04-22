export type LatLngPoint = {
  latitude: number;
  longitude: number;
};

export type RoadPathTelemetryPointInput = LatLngPoint & {
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recordedAt?: string | null;
  timestampMs?: number | null;
};

export type RoadPathMatchProvider =
  | 'local-directional'
  | 'osrm-match'
  | 'osrm-route'
  | 'ors-directions';

export type RoadPathMatchMetadata = {
  provider: RoadPathMatchProvider;
  confidence: number | null;
  roadNames: string[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  inputPointCount: number;
  matchedPointCount: number;
};

export type RoadPathMatchResult = {
  path: LatLngPoint[] | null;
  metadata: RoadPathMatchMetadata | null;
};

const OSRM_API_BASE_URL =
  process.env.EXPO_PUBLIC_OSRM_API_BASE_URL?.trim() ?? 'https://router.project-osrm.org';
const OPENROUTESERVICE_API_BASE_URL =
  process.env.EXPO_PUBLIC_ORS_API_BASE_URL?.trim() ?? 'https://api.openrouteservice.org';
const OPENROUTESERVICE_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() ?? '';
const REMOTE_ROAD_SNAPPING_ENABLED =
  (process.env.EXPO_PUBLIC_ENABLE_REMOTE_ROAD_SNAPPING?.trim().toLowerCase() ?? '') === 'true';
const OSRM_PROFILE = process.env.EXPO_PUBLIC_OSRM_PROFILE?.trim() ?? 'driving';
const OPENROUTESERVICE_PROFILE = 'driving-car';
const OPENROUTESERVICE_DIRECTIONS_MAX_POINTS = 50;
const TRACE_MATCH_MAX_POINT_OFFSET_KM = 0.055;
const TRACE_MATCH_AVG_POINT_OFFSET_KM = 0.028;
const TRACE_MATCH_MIN_DISTANCE_RATIO = 0.72;

export const dedupeSequentialPoints = <T extends LatLngPoint>(points: T[]) => {
  if (points.length <= 1) {
    return points;
  }

  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previous = points[index - 1];
    return (
      Math.abs(previous.latitude - point.latitude) >= 0.000001 ||
      Math.abs(previous.longitude - point.longitude) >= 0.000001
    );
  });
};

export const polylineDistanceKm = (points: LatLngPoint[]) => {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const earthRadiusKm = 6371;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(to.latitude - from.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += earthRadiusKm * c;
  }

  return total;
};

const headingBetweenDeg = (from: LatLngPoint, to: LatLngPoint) => {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};

const shortestAngleDelta = (fromDeg: number, toDeg: number) => {
  let delta = toDeg - fromDeg;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
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
    const lonScale = 111.32 * Math.cos((point.latitude * Math.PI) / 180);
    const dLatKm = (y - y1) * 111.32;
    const dLonKm = (x - x1) * lonScale;
    return Math.sqrt(dLatKm * dLatKm + dLonKm * dLonKm);
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projection = {
    latitude: y1 + t * dy,
    longitude: x1 + t * dx,
  };

  const lonScale = 111.32 * Math.cos((point.latitude * Math.PI) / 180);
  const dLatKm = (point.latitude - projection.latitude) * 111.32;
  const dLonKm = (point.longitude - projection.longitude) * lonScale;
  return Math.sqrt(dLatKm * dLatKm + dLonKm * dLonKm);
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

const interpolatePoint = (from: LatLngPoint, to: LatLngPoint, ratio: number): LatLngPoint => ({
  latitude: from.latitude + (to.latitude - from.latitude) * ratio,
  longitude: from.longitude + (to.longitude - from.longitude) * ratio,
});

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
    return {
      point: start,
      ratio: 0,
    };
  }

  const projectionRatio = Math.max(
    0,
    Math.min(1, ((pointX - startX) * deltaX + (pointY - startY) * deltaY) / denominator),
  );

  return {
    point: {
      latitude: start.latitude + (end.latitude - start.latitude) * projectionRatio,
      longitude: start.longitude + (end.longitude - start.longitude) * projectionRatio,
    },
    ratio: projectionRatio,
  };
};

const projectPointOnPolyline = (point: LatLngPoint, polyline: LatLngPoint[]) => {
  if (polyline.length === 0) {
    return null;
  }

  if (polyline.length === 1) {
    return {
      point: polyline[0],
      distanceKm: polylineDistanceKm([point, polyline[0]]),
    };
  }

  let best:
    | {
        point: LatLngPoint;
        distanceKm: number;
      }
    | null = null;

  for (let index = 1; index < polyline.length; index += 1) {
    const projected = nearestPointOnSegment(point, polyline[index - 1], polyline[index]);
    const distanceKm = polylineDistanceKm([point, projected.point]);
    if (!best || distanceKm < best.distanceKm) {
      best = {
        point: projected.point,
        distanceKm,
      };
    }
  }

  return best;
};

const projectPointOnPolylineWithProgress = (point: LatLngPoint, polyline: LatLngPoint[]) => {
  if (polyline.length < 2) {
    return null;
  }

  let best:
    | {
        distanceKm: number;
        alongPathKm: number;
      }
    | null = null;
  let traveledKm = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    const segmentStart = polyline[index - 1];
    const segmentEnd = polyline[index];
    const segmentLengthKm = polylineDistanceKm([segmentStart, segmentEnd]);
    const projected = nearestPointOnSegment(point, segmentStart, segmentEnd);
    const distanceKm = polylineDistanceKm([point, projected.point]);
    const alongPathKm = traveledKm + segmentLengthKm * projected.ratio;

    if (!best || distanceKm < best.distanceKm) {
      best = {
        distanceKm,
        alongPathKm,
      };
    }

    traveledKm += segmentLengthKm;
  }

  return best;
};

const matchedPathFollowsTrace = ({
  trace,
  matchedPath,
}: {
  trace: LatLngPoint[];
  matchedPath: LatLngPoint[];
}) => {
  const cleanTrace = dedupeSequentialPoints(trace);
  const cleanMatchedPath = dedupeSequentialPoints(matchedPath);
  if (cleanTrace.length < 2 || cleanMatchedPath.length < 2) {
    return false;
  }

  const traceDistanceKm = polylineDistanceKm(cleanTrace);
  const matchedDistanceKm = polylineDistanceKm(cleanMatchedPath);
  if (
    traceDistanceKm >= 0.08 &&
    matchedDistanceKm < traceDistanceKm * TRACE_MATCH_MIN_DISTANCE_RATIO
  ) {
    return false;
  }

  let totalOffsetKm = 0;
  let maxOffsetKm = 0;
  let previousProgressKm = -Infinity;
  let backtrackCount = 0;

  for (const point of cleanTrace) {
    const projection = projectPointOnPolylineWithProgress(point, cleanMatchedPath);
    if (!projection) {
      return false;
    }

    totalOffsetKm += projection.distanceKm;
    maxOffsetKm = Math.max(maxOffsetKm, projection.distanceKm);
    if (projection.alongPathKm + 0.018 < previousProgressKm) {
      backtrackCount += 1;
    }
    previousProgressKm = Math.max(previousProgressKm, projection.alongPathKm);
  }

  const averageOffsetKm = totalOffsetKm / cleanTrace.length;
  return (
    maxOffsetKm <= TRACE_MATCH_MAX_POINT_OFFSET_KM &&
    averageOffsetKm <= TRACE_MATCH_AVG_POINT_OFFSET_KM &&
    backtrackCount <= Math.max(1, Math.floor(cleanTrace.length * 0.12))
  );
};

const quadraticBezierPoint = (
  start: LatLngPoint,
  control: LatLngPoint,
  end: LatLngPoint,
  t: number,
): LatLngPoint => {
  const oneMinusT = 1 - t;
  return {
    latitude:
      oneMinusT * oneMinusT * start.latitude +
      2 * oneMinusT * t * control.latitude +
      t * t * end.latitude,
    longitude:
      oneMinusT * oneMinusT * start.longitude +
      2 * oneMinusT * t * control.longitude +
      t * t * end.longitude,
  };
};

const chunkDirectionsPoints = (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length <= OPENROUTESERVICE_DIRECTIONS_MAX_POINTS) {
    return [cleanPoints];
  }

  const chunks: LatLngPoint[][] = [];
  const step = OPENROUTESERVICE_DIRECTIONS_MAX_POINTS - 1;
  for (let index = 0; index < cleanPoints.length; index += step) {
    const chunk = cleanPoints.slice(index, index + OPENROUTESERVICE_DIRECTIONS_MAX_POINTS);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
  }

  return chunks;
};

const mapCoordinatePairsToPoints = (coordinates?: number[][] | null) =>
  dedupeSequentialPoints(
    (coordinates ?? [])
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

type OsrmStep = {
  name?: string;
};

type OsrmLeg = {
  distance?: number;
  duration?: number;
  steps?: OsrmStep[];
  summary?: string;
};

type OsrmRoute = {
  confidence?: number;
  distance?: number;
  duration?: number;
  geometry?: {
    coordinates?: number[][];
  };
  legs?: OsrmLeg[];
};

const extractOsrmRoadNames = (route?: OsrmRoute | null) =>
  dedupeRoadNames(
    (route?.legs ?? []).flatMap((leg) => [
      leg.summary ?? '',
      ...(leg.steps ?? []).map((step) => step.name ?? ''),
    ]),
  );

const dedupeRoadNames = (names: Array<string | null | undefined>) =>
  names
    .map((name) => name?.trim() ?? '')
    .filter((name) => name.length > 0)
    .filter((name, index, source) => source.indexOf(name) === index);

const buildRoadPathMatchMetadata = ({
  provider,
  inputPointCount,
  path,
  confidence = null,
  roadNames = [],
  distanceMeters = null,
  durationSeconds = null,
}: {
  provider: RoadPathMatchProvider;
  inputPointCount: number;
  path: LatLngPoint[] | null;
  confidence?: number | null;
  roadNames?: string[];
  distanceMeters?: number | null;
  durationSeconds?: number | null;
}): RoadPathMatchMetadata | null => {
  const cleanPath = path ? dedupeSequentialPoints(path) : null;
  if (!cleanPath || cleanPath.length < 2) {
    return null;
  }

  return {
    provider,
    confidence:
      typeof confidence === 'number' && Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : null,
    roadNames: dedupeRoadNames(roadNames),
    distanceMeters:
      typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
        ? Math.max(0, distanceMeters)
        : null,
    durationSeconds:
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
        ? Math.max(0, durationSeconds)
        : null,
    inputPointCount,
    matchedPointCount: cleanPath.length,
  };
};

const simplifyDouglasPeuckerPath = (points: LatLngPoint[], toleranceKm: number): LatLngPoint[] => {
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

export const smoothDisplayedRoutePath = (points: LatLngPoint[]) => {
  const deduped = dedupeSequentialPoints(points);
  if (deduped.length < 3) {
    return deduped;
  }

  const smoothed: LatLngPoint[] = [deduped[0]];

  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = smoothed[smoothed.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const directGapKm = polylineDistanceKm([previous, next]);
    const viaCurrentKm = polylineDistanceKm([previous, current, next]);
    const currentOffsetKm = distancePointToSegmentKm(current, previous, next);
    const angleDeg = turnAngleDeg(previous, current, next);

    const tinyDetour =
      viaCurrentKm - directGapKm <= 0.006 &&
      currentOffsetKm <= 0.008 &&
      angleDeg <= 22;
    const noisySpike =
      currentOffsetKm <= 0.01 &&
      (angleDeg >= 150 || viaCurrentKm - directGapKm <= 0.01);

    if (tinyDetour || noisySpike) {
      continue;
    }

    smoothed.push(current);
  }

  smoothed.push(deduped[deduped.length - 1]);

  if (smoothed.length < 3) {
    return dedupeSequentialPoints(smoothed);
  }

  const curved: LatLngPoint[] = [smoothed[0]];

  for (let index = 1; index < smoothed.length - 1; index += 1) {
    const previous = smoothed[index - 1];
    const current = smoothed[index];
    const next = smoothed[index + 1];
    const prevDistanceKm = polylineDistanceKm([previous, current]);
    const nextDistanceKm = polylineDistanceKm([current, next]);
    const angleDeg = turnAngleDeg(previous, current, next);

    const shouldRoundCorner =
      angleDeg >= 28 &&
      angleDeg <= 155 &&
      prevDistanceKm >= 0.008 &&
      nextDistanceKm >= 0.008;

    if (!shouldRoundCorner) {
      curved.push(current);
      continue;
    }

    const cornerInsetKm = Math.min(0.01, prevDistanceKm * 0.35, nextDistanceKm * 0.35);
    const startCurvePoint = interpolatePoint(previous, current, 1 - cornerInsetKm / prevDistanceKm);
    const endCurvePoint = interpolatePoint(current, next, cornerInsetKm / nextDistanceKm);

    curved.push(startCurvePoint);
    curved.push(quadraticBezierPoint(startCurvePoint, current, endCurvePoint, 0.35));
    curved.push(quadraticBezierPoint(startCurvePoint, current, endCurvePoint, 0.7));
    curved.push(endCurvePoint);
  }

  curved.push(smoothed[smoothed.length - 1]);
  return dedupeSequentialPoints(curved);
};

const normalizeAlignedRoadPath = (
  nextPath: LatLngPoint[],
  fallbackPath: LatLngPoint[] = [],
  {
    preserveDetailedGeometry = false,
  }: {
    preserveDetailedGeometry?: boolean;
  } = {},
) => {
  if (preserveDetailedGeometry) {
    const normalizedNext = dedupeSequentialPoints(nextPath);
    if (normalizedNext.length > 1) {
      return normalizedNext;
    }

    return dedupeSequentialPoints(fallbackPath);
  }

  const normalizedNext = smoothDisplayedRoutePath(dedupeSequentialPoints(nextPath));
  if (normalizedNext.length > 1) {
    return normalizedNext;
  }

  return smoothDisplayedRoutePath(dedupeSequentialPoints(fallbackPath));
};

export const buildDirectionalRoadSnappedPath = (
  points: LatLngPoint[],
  {
    maxProjectionDistanceKm,
    simplifyToleranceKm,
  }: {
    maxProjectionDistanceKm?: number;
    simplifyToleranceKm?: number;
  } = {},
) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return cleanPoints;
  }

  const softenedPath = smoothDisplayedRoutePath(cleanPoints);
  const totalDistanceKm = polylineDistanceKm(softenedPath);
  const resolvedSimplificationToleranceKm =
    typeof simplifyToleranceKm === 'number'
      ? simplifyToleranceKm
      : totalDistanceKm <= 0.08
        ? 0.0016
        : totalDistanceKm <= 0.2
          ? 0.0024
          : totalDistanceKm <= 0.6
            ? 0.0036
            : 0.0048;
  const simplifiedAnchors = simplifyDouglasPeuckerPath(
    softenedPath,
    resolvedSimplificationToleranceKm,
  );
  const anchorPath = dedupeSequentialPoints(
    simplifiedAnchors.length >= 2 ? simplifiedAnchors : softenedPath,
  );
  const resolvedMaxProjectionDistanceKm =
    typeof maxProjectionDistanceKm === 'number'
      ? maxProjectionDistanceKm
      : Math.max(0.006, Math.min(0.02, totalDistanceKm * 0.22));

  const magnetizedPath = cleanPoints.map((point, index) => {
    if (index === 0 || index === cleanPoints.length - 1) {
      return point;
    }

    const projection = projectPointOnPolyline(point, anchorPath);
    if (!projection || projection.distanceKm > resolvedMaxProjectionDistanceKm) {
      return point;
    }

    const previous = cleanPoints[index - 1];
    const next = cleanPoints[index + 1];
    let pullRatio =
      projection.distanceKm >= resolvedMaxProjectionDistanceKm * 0.66
        ? 0.82
        : projection.distanceKm >= resolvedMaxProjectionDistanceKm * 0.33
          ? 0.64
          : 0.44;

    if (previous && next) {
      const directionalChangeDeg = Math.abs(
        shortestAngleDelta(
          headingBetweenDeg(previous, point),
          headingBetweenDeg(point, next),
        ),
      );
      if (directionalChangeDeg >= 90) {
        pullRatio = Math.max(pullRatio, 0.84);
      } else if (directionalChangeDeg >= 40) {
        pullRatio = Math.max(pullRatio, 0.68);
      }
    }

    return interpolatePoint(point, projection.point, pullRatio);
  });

  const repairedTurns: LatLngPoint[] = [magnetizedPath[0]];

  for (let index = 1; index < magnetizedPath.length - 1; index += 1) {
    const previous = repairedTurns[repairedTurns.length - 1];
    const current = magnetizedPath[index];
    const next = magnetizedPath[index + 1];
    const headingDeltaDeg = Math.abs(
      shortestAngleDelta(headingBetweenDeg(previous, current), headingBetweenDeg(current, next)),
    );
    const offsetKm = distancePointToSegmentKm(current, previous, next);
    const bridgeDistanceKm = polylineDistanceKm([previous, next]);
    const viaDistanceKm = polylineDistanceKm([previous, current, next]);
    const shouldCollapseZigZag =
      headingDeltaDeg >= 32 &&
      headingDeltaDeg <= 160 &&
      offsetKm <= 0.014 &&
      viaDistanceKm - bridgeDistanceKm <= 0.02;

    if (shouldCollapseZigZag) {
      repairedTurns.push(interpolatePoint(previous, next, 0.5));
      continue;
    }

    repairedTurns.push(current);
  }

  repairedTurns.push(magnetizedPath[magnetizedPath.length - 1]);
  const locallySnappedPath = normalizeAlignedRoadPath(repairedTurns, anchorPath);
  return locallySnappedPath.length >= 2
    ? locallySnappedPath
    : normalizeAlignedRoadPath(anchorPath, cleanPoints);
};

export const fetchOpenRouteServiceRoadPathDetailed = async (
  points: LatLngPoint[],
): Promise<RoadPathMatchResult> => {
  if (!REMOTE_ROAD_SNAPPING_ENABLED || !OPENROUTESERVICE_API_KEY) {
    return { path: null, metadata: null };
  }

  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return { path: null, metadata: null };
  }

  const chunks = chunkDirectionsPoints(cleanPoints);
  const mergedRoute: LatLngPoint[] = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;

  for (const chunk of chunks) {
    try {
      const response = await fetch(
        `${OPENROUTESERVICE_API_BASE_URL}/v2/directions/${OPENROUTESERVICE_PROFILE}/geojson`,
        {
          method: 'POST',
          headers: {
            Authorization: OPENROUTESERVICE_API_KEY,
            Accept: 'application/geo+json, application/json',
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            coordinates: chunk.map((point) => [point.longitude, point.latitude]),
            instructions: true,
            geometry_simplify: false,
          }),
        },
      );

      if (!response.ok) {
        return { path: null, metadata: null };
      }

      const json = (await response.json()) as {
        features?: Array<{
          geometry?: {
            coordinates?: number[][];
          };
          properties?: {
            summary?: {
              distance?: number;
              duration?: number;
            };
          };
        }>;
      };
      const feature = json.features?.[0];
      const chunkRoute = mapCoordinatePairsToPoints(feature?.geometry?.coordinates ?? null);
      if (chunkRoute.length < 2) {
        return { path: null, metadata: null };
      }

      totalDistanceMeters += feature?.properties?.summary?.distance ?? 0;
      totalDurationSeconds += feature?.properties?.summary?.duration ?? 0;
      mergedRoute.push(...chunkRoute);
    } catch {
      return { path: null, metadata: null };
    }
  }

  const cleanMergedRoute = dedupeSequentialPoints(mergedRoute);
  return {
    path: cleanMergedRoute.length >= 2 ? cleanMergedRoute : null,
    metadata: buildRoadPathMatchMetadata({
      provider: 'ors-directions',
      inputPointCount: cleanPoints.length,
      path: cleanMergedRoute,
      confidence: cleanMergedRoute.length >= 2 ? 0.68 : null,
      distanceMeters: totalDistanceMeters > 0 ? totalDistanceMeters : null,
      durationSeconds: totalDurationSeconds > 0 ? totalDurationSeconds : null,
    }),
  };
};

export const fetchOpenRouteServiceRoadPath = async (points: LatLngPoint[]) =>
  (await fetchOpenRouteServiceRoadPathDetailed(points)).path;

const buildOsrmCoordinateString = (points: LatLngPoint[]) =>
  points
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');

const buildOsrmTimestamps = (points: RoadPathTelemetryPointInput[]) => {
  const timestamps = points
    .map((point) => {
      if (typeof point.timestampMs === 'number' && Number.isFinite(point.timestampMs)) {
        return Math.round(point.timestampMs / 1000);
      }

      if (typeof point.recordedAt === 'string' && point.recordedAt.trim().length > 0) {
        const timestampMs = new Date(point.recordedAt).getTime();
        if (Number.isFinite(timestampMs)) {
          return Math.round(timestampMs / 1000);
        }
      }

      return null;
    });

  if (!timestamps.every((timestamp): timestamp is number => typeof timestamp === 'number')) {
    return null;
  }

  const strictlyIncreasing = timestamps.every(
    (timestamp, index) => index === 0 || timestamp > timestamps[index - 1],
  );
  return strictlyIncreasing ? timestamps.join(';') : null;
};

const buildOsrmRadiuses = (points: RoadPathTelemetryPointInput[]) =>
  points
    .map((point) =>
      Math.max(
        10,
        Math.min(
          100,
          Math.round(
            typeof point.accuracy === 'number' && Number.isFinite(point.accuracy)
              ? point.accuracy
              : 20,
          ),
        ),
      ),
    )
    .join(';');

export const fetchOsrmMatchedRoadPathDetailed = async (
  points: RoadPathTelemetryPointInput[],
): Promise<RoadPathMatchResult> => {
  if (!REMOTE_ROAD_SNAPPING_ENABLED || !OSRM_API_BASE_URL) {
    return { path: null, metadata: null };
  }

  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return { path: null, metadata: null };
  }

  try {
    const timestamps = buildOsrmTimestamps(cleanPoints);
    const queryParams = [
      'geometries=geojson',
      'overview=full',
      'steps=true',
      `radiuses=${encodeURIComponent(buildOsrmRadiuses(cleanPoints))}`,
    ];
    if (timestamps) {
      queryParams.push(`timestamps=${encodeURIComponent(timestamps)}`);
    }

    const response = await fetch(
      `${OSRM_API_BASE_URL}/match/v1/${encodeURIComponent(OSRM_PROFILE)}/${buildOsrmCoordinateString(
        cleanPoints,
      )}?${queryParams.join('&')}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      return { path: null, metadata: null };
    }

    const json = (await response.json()) as {
      code?: string;
      matchings?: OsrmRoute[];
    };
    if (json.code && json.code !== 'Ok') {
      return { path: null, metadata: null };
    }

    const matchedRoute = json.matchings?.[0] ?? null;
    const path = mapCoordinatePairsToPoints(matchedRoute?.geometry?.coordinates ?? null);
    if (path.length < 2) {
      return { path: null, metadata: null };
    }
    if (!matchedPathFollowsTrace({ trace: cleanPoints, matchedPath: path })) {
      return { path: null, metadata: null };
    }

    return {
      path,
      metadata: buildRoadPathMatchMetadata({
        provider: 'osrm-match',
        inputPointCount: cleanPoints.length,
        path,
        confidence:
          typeof matchedRoute?.confidence === 'number' && Number.isFinite(matchedRoute.confidence)
            ? matchedRoute.confidence
            : cleanPoints.length >= 2
              ? Math.min(1, path.length / Math.max(cleanPoints.length, 1))
              : null,
        roadNames: extractOsrmRoadNames(matchedRoute),
        distanceMeters: matchedRoute?.distance ?? null,
        durationSeconds: matchedRoute?.duration ?? null,
      }),
    };
  } catch {
    return { path: null, metadata: null };
  }
};

export const fetchOsrmRoutedRoadPathDetailed = async (
  points: LatLngPoint[],
): Promise<RoadPathMatchResult> => {
  if (!REMOTE_ROAD_SNAPPING_ENABLED || !OSRM_API_BASE_URL) {
    return { path: null, metadata: null };
  }

  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return { path: null, metadata: null };
  }

  try {
    const queryParams = [
      'geometries=geojson',
      'overview=full',
      'steps=true',
    ];
    const response = await fetch(
      `${OSRM_API_BASE_URL}/route/v1/${encodeURIComponent(OSRM_PROFILE)}/${buildOsrmCoordinateString(
        cleanPoints,
      )}?${queryParams.join('&')}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      return { path: null, metadata: null };
    }

    const json = (await response.json()) as {
      code?: string;
      routes?: OsrmRoute[];
    };
    if (json.code && json.code !== 'Ok') {
      return { path: null, metadata: null };
    }

    const route = json.routes?.[0] ?? null;
    const path = mapCoordinatePairsToPoints(route?.geometry?.coordinates ?? null);
    if (path.length < 2) {
      return { path: null, metadata: null };
    }

    return {
      path,
      metadata: buildRoadPathMatchMetadata({
        provider: 'osrm-route',
        inputPointCount: cleanPoints.length,
        path,
        confidence: cleanPoints.length >= 2 ? 0.72 : null,
        roadNames: extractOsrmRoadNames(route),
        distanceMeters: route?.distance ?? null,
        durationSeconds: route?.duration ?? null,
      }),
    };
  } catch {
    return { path: null, metadata: null };
  }
};

export const fetchRoutedRoadPathDetailed = fetchOsrmRoutedRoadPathDetailed;

export const fetchRoutedRoadPath = async (points: LatLngPoint[]) =>
  (await fetchRoutedRoadPathDetailed(points)).path;

export const fetchPreferredRoadPathDetailed = async (
  points: LatLngPoint[],
): Promise<RoadPathMatchResult> => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return { path: null, metadata: null };
  }

  if (!REMOTE_ROAD_SNAPPING_ENABLED) {
    const localDirectionalPath = buildDirectionalRoadSnappedPath(cleanPoints);
    return {
      path: localDirectionalPath.length >= 2 ? localDirectionalPath : null,
      metadata: buildRoadPathMatchMetadata({
        provider: 'local-directional',
        inputPointCount: cleanPoints.length,
        path: localDirectionalPath,
      }),
    };
  }

  const osrmMatchResult = await fetchOsrmMatchedRoadPathDetailed(cleanPoints);
  if (
    osrmMatchResult.path &&
    osrmMatchResult.path.length >= 2 &&
    matchedPathFollowsTrace({ trace: cleanPoints, matchedPath: osrmMatchResult.path })
  ) {
    return osrmMatchResult;
  }

  const localDirectionalPath = buildDirectionalRoadSnappedPath(cleanPoints);
  return {
    path: localDirectionalPath,
    metadata: buildRoadPathMatchMetadata({
      provider: 'local-directional',
      inputPointCount: cleanPoints.length,
      path: localDirectionalPath,
    }),
  };
};

export const fetchPreferredRoadPath = async (points: LatLngPoint[]) =>
  (await fetchPreferredRoadPathDetailed(points)).path;

export const snapActualPathToRoadDetailed = async (
  points: LatLngPoint[],
): Promise<RoadPathMatchResult> => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return { path: cleanPoints, metadata: null };
  }

  const localDirectionalPath = buildDirectionalRoadSnappedPath(cleanPoints);
  const preferredResult = await fetchPreferredRoadPathDetailed(cleanPoints);
  const snappedPath = preferredResult.path ?? localDirectionalPath;
  const preserveDetailedGeometry =
    typeof preferredResult.metadata?.provider === 'string' &&
    preferredResult.metadata.provider !== 'local-directional';

  return {
    path: preserveDetailedGeometry
      ? dedupeSequentialPoints(snappedPath)
      : smoothDisplayedRoutePath(snappedPath),
    metadata: preferredResult.metadata,
  };
};

export const snapActualPathToRoad = async (points: LatLngPoint[]) =>
  (await snapActualPathToRoadDetailed(points)).path ?? dedupeSequentialPoints(points);

export const buildRoadAlignedTripPathDetailed = async ({
  candidatePath,
  fallbackPath = [],
  forceRoutePointCount = 3,
  forceRouteDistanceKm = 0.06,
  preserveDetailedGeometry = false,
  trustCandidateGeometry = false,
}: {
  candidatePath: LatLngPoint[];
  fallbackPath?: LatLngPoint[];
  forceRoutePointCount?: number;
  forceRouteDistanceKm?: number;
  preserveDetailedGeometry?: boolean;
  trustCandidateGeometry?: boolean;
}) => {
  const normalizedCandidate = normalizeAlignedRoadPath(candidatePath, fallbackPath, {
    preserveDetailedGeometry,
  });
  if (normalizedCandidate.length < 2) {
    return { path: normalizedCandidate, metadata: null };
  }

  if (trustCandidateGeometry) {
    return {
      path: normalizedCandidate,
      metadata: null,
    };
  }

  const candidateDistanceKm = polylineDistanceKm(normalizedCandidate);
  const shouldForceRoute =
    normalizedCandidate.length <= forceRoutePointCount ||
    candidateDistanceKm <= forceRouteDistanceKm;

  if (shouldForceRoute) {
    const preferredForcedResult = await fetchPreferredRoadPathDetailed(normalizedCandidate);
    const normalizedPreferredForcedPath = normalizeAlignedRoadPath(
      preferredForcedResult.path ?? [],
      normalizedCandidate,
      {
        preserveDetailedGeometry:
          preserveDetailedGeometry ||
          (typeof preferredForcedResult.metadata?.provider === 'string' &&
            preferredForcedResult.metadata.provider !== 'local-directional'),
      },
    );
    if (normalizedPreferredForcedPath.length > 1) {
      const refinedPreferredForcedResult = await snapActualPathToRoadDetailed(
        normalizedPreferredForcedPath,
      );
      const refinedPreferredForcedPath = refinedPreferredForcedResult.path ?? normalizedPreferredForcedPath;
      const refinedPreferredForcedFollowsTrace = matchedPathFollowsTrace({
        trace: normalizedCandidate,
        matchedPath: refinedPreferredForcedPath,
      });
      if (!refinedPreferredForcedFollowsTrace) {
        return {
          path: normalizeAlignedRoadPath(normalizedCandidate, fallbackPath, {
            preserveDetailedGeometry: true,
          }),
          metadata: null,
        };
      }
      return {
        path: normalizeAlignedRoadPath(
          refinedPreferredForcedPath,
          normalizedPreferredForcedPath,
          {
            preserveDetailedGeometry:
              preserveDetailedGeometry ||
              (typeof refinedPreferredForcedResult.metadata?.provider === 'string' &&
                refinedPreferredForcedResult.metadata.provider !== 'local-directional') ||
              (typeof preferredForcedResult.metadata?.provider === 'string' &&
                preferredForcedResult.metadata.provider !== 'local-directional'),
          },
        ),
        metadata: refinedPreferredForcedResult.metadata ?? preferredForcedResult.metadata,
      };
    }
  }

  const snappedResult = await snapActualPathToRoadDetailed(normalizedCandidate);
  const snappedPath = snappedResult.path ?? normalizedCandidate;
  const snappedFollowsTrace =
    snappedPath.length >= 2 &&
    matchedPathFollowsTrace({
      trace: normalizedCandidate,
      matchedPath: snappedPath,
    });
  const normalizedSnappedPath = normalizeAlignedRoadPath(snappedPath, normalizedCandidate, {
    preserveDetailedGeometry:
      snappedFollowsTrace &&
      (preserveDetailedGeometry ||
        (typeof snappedResult.metadata?.provider === 'string' &&
          snappedResult.metadata.provider !== 'local-directional')),
  });
  if (normalizedSnappedPath.length > 1 && snappedFollowsTrace) {
    return {
      path: normalizedSnappedPath,
      metadata: snappedResult.metadata,
    };
  }

  const preferredFallbackResult = await fetchPreferredRoadPathDetailed(normalizedCandidate);
  const preferredFallbackFollowsTrace =
    preferredFallbackResult.path &&
    matchedPathFollowsTrace({
      trace: normalizedCandidate,
      matchedPath: preferredFallbackResult.path,
    });
  return {
    path: preferredFallbackFollowsTrace
      ? normalizeAlignedRoadPath(preferredFallbackResult.path ?? [], normalizedCandidate, {
          preserveDetailedGeometry:
            preserveDetailedGeometry ||
            (typeof preferredFallbackResult.metadata?.provider === 'string' &&
              preferredFallbackResult.metadata.provider !== 'local-directional'),
        })
      : normalizeAlignedRoadPath(normalizedCandidate, fallbackPath, {
          preserveDetailedGeometry: true,
        }),
    metadata: preferredFallbackFollowsTrace ? preferredFallbackResult.metadata : null,
  };
};

export const buildRoadAlignedTripPath = async ({
  candidatePath,
  fallbackPath = [],
  forceRoutePointCount = 3,
  forceRouteDistanceKm = 0.06,
  preserveDetailedGeometry = false,
  trustCandidateGeometry = false,
}: {
  candidatePath: LatLngPoint[];
  fallbackPath?: LatLngPoint[];
  forceRoutePointCount?: number;
  forceRouteDistanceKm?: number;
  preserveDetailedGeometry?: boolean;
  trustCandidateGeometry?: boolean;
}) =>
  (
    await buildRoadAlignedTripPathDetailed({
      candidatePath,
      fallbackPath,
      forceRoutePointCount,
      forceRouteDistanceKm,
      preserveDetailedGeometry,
      trustCandidateGeometry,
    })
  ).path ??
  normalizeAlignedRoadPath(candidatePath, fallbackPath, {
    preserveDetailedGeometry,
  });
