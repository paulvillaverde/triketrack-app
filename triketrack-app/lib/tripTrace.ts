import {
  buildDirectionalRoadSnappedPath,
  dedupeSequentialPoints,
  fetchOsrmMatchedRoadPathDetailed,
  polylineDistanceKm,
  type RoadPathMatchMetadata,
  smoothDisplayedRoutePath,
  type LatLngPoint,
} from './roadPath';

export type TripTracePoint = LatLngPoint;

export type TripTraceRawPoint = TripTracePoint & {
  recordedAt: string;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
};

export type TripMatchedPointSource =
  | 'service'
  | 'local-fallback'
  | 'local-heuristic'
  | 'reconstructed';

export type TripRouteRenderState = 'PRE_ROAD' | 'ON_ROAD';

export type TripMatchedTracePoint = TripTracePoint & {
  recordedAt: string;
  source: TripMatchedPointSource;
};

export type TripRenderedTrace = {
  rawStartPoint: LatLngPoint | null;
  dashedConnector: LatLngPoint[];
  solidOnRoadPath: LatLngPoint[];
  firstSnappedPoint: LatLngPoint | null;
  routeState: TripRouteRenderState;
};

export type LiveMatchedRouteSegmentResult = {
  path: LatLngPoint[] | null;
  source: TripMatchedPointSource;
  metadata: RoadPathMatchMetadata | null;
};

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

const headingBetweenDeg = (from: LatLngPoint, to: LatLngPoint) => {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
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

const interpolatePoint = (from: LatLngPoint, to: LatLngPoint, ratio: number): LatLngPoint => ({
  latitude: from.latitude + (to.latitude - from.latitude) * ratio,
  longitude: from.longitude + (to.longitude - from.longitude) * ratio,
});

const METERS_PER_LAT_DEGREE = 111320;

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

export type TripRoadProjection = {
  point: LatLngPoint;
  distanceKm: number;
  alongPathKm: number;
  segmentIndex: number;
  segmentHeadingDeg: number;
  segmentRatio: number;
};

const projectPointOnPolyline = (
  point: LatLngPoint,
  polyline: LatLngPoint[],
): TripRoadProjection | null => {
  if (polyline.length === 0) {
    return null;
  }

  if (polyline.length === 1) {
    return {
      point: polyline[0],
      distanceKm: distanceBetweenKm(point, polyline[0]),
      alongPathKm: 0,
      segmentIndex: 0,
      segmentHeadingDeg: 0,
      segmentRatio: 0,
    };
  }

  let best: TripRoadProjection | null = null;
  let traveledKm = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    const segmentLengthKm = distanceBetweenKm(start, end);
    const projected = nearestPointOnSegment(point, start, end);
    const segmentPoint = projected.point;
    const segmentDistanceKm = distanceBetweenKm(point, segmentPoint);
    const alongSegmentKm = segmentLengthKm * projected.ratio;

    if (!best || segmentDistanceKm < best.distanceKm) {
      best = {
        point: segmentPoint,
        distanceKm: segmentDistanceKm,
        alongPathKm: traveledKm + alongSegmentKm,
        segmentIndex: index - 1,
        segmentHeadingDeg: segmentLengthKm > 0 ? headingBetweenDeg(start, end) : 0,
        segmentRatio: projected.ratio,
      };
    }

    traveledKm += segmentLengthKm;
  }

  return best;
};

export const projectPointToRoadPath = (
  point: LatLngPoint,
  polyline: LatLngPoint[],
) => projectPointOnPolyline(point, polyline);

export const buildRoadCenterlinePath = ({
  roadPath,
  startProjection,
  endProjection,
  maxBacktrackKm = 0.015,
}: {
  roadPath: LatLngPoint[];
  startProjection: TripRoadProjection;
  endProjection: TripRoadProjection;
  maxBacktrackKm?: number;
}) => {
  const cleanRoadPath = dedupeSequentialPoints(roadPath);
  if (cleanRoadPath.length < 2) {
    return dedupeSequentialPoints([startProjection.point, endProjection.point]);
  }

  const backtrackKm = startProjection.alongPathKm - endProjection.alongPathKm;
  if (backtrackKm > maxBacktrackKm) {
    return [];
  }

  if (
    startProjection.segmentIndex === endProjection.segmentIndex &&
    Math.abs(startProjection.segmentRatio - endProjection.segmentRatio) < 0.0001
  ) {
    return [endProjection.point];
  }

  const centerlinePath: LatLngPoint[] = [startProjection.point];

  if (endProjection.alongPathKm + 0.00001 < startProjection.alongPathKm) {
    centerlinePath.push(endProjection.point);
    return dedupeSequentialPoints(centerlinePath);
  }

  for (
    let index = startProjection.segmentIndex + 1;
    index <= Math.min(endProjection.segmentIndex, cleanRoadPath.length - 1);
    index += 1
  ) {
    centerlinePath.push(cleanRoadPath[index]);
  }

  centerlinePath.push(endProjection.point);
  return dedupeSequentialPoints(centerlinePath);
};

export const buildTripStartConnector = ({
  rawStartPoint,
  firstSnappedPoint,
  roadPath = [],
  connectorMinDistanceKm = 0.006,
  connectorMaxDistanceKm = 0.25,
}: {
  rawStartPoint: LatLngPoint | null;
  firstSnappedPoint: LatLngPoint | null;
  roadPath?: LatLngPoint[];
  connectorMinDistanceKm?: number;
  connectorMaxDistanceKm?: number;
}) => {
  if (!rawStartPoint || !firstSnappedPoint) {
    return [];
  }

  const normalizedRoadPath = dedupeSequentialPoints(
    roadPath.length > 1 ? roadPath : [firstSnappedPoint],
  );
  const projectedStart =
    normalizedRoadPath.length > 0
      ? projectPointToRoadPath(rawStartPoint, normalizedRoadPath)
      : null;
  const connectorTarget = projectedStart?.point ?? firstSnappedPoint;
  const offRoadDistanceKm = projectedStart?.distanceKm ?? distanceBetweenKm(rawStartPoint, connectorTarget);
  const connectorDistanceKm = distanceBetweenKm(rawStartPoint, connectorTarget);
  if (
    offRoadDistanceKm < connectorMinDistanceKm ||
    connectorDistanceKm < connectorMinDistanceKm ||
    connectorDistanceKm > connectorMaxDistanceKm
  ) {
    return [];
  }

  const roadsideDisplayPoint =
    projectedStart && normalizedRoadPath.length >= 2
      ? buildRoadsideConnectorPoint({
          roadProjection: projectedStart,
          referencePoint: rawStartPoint,
          preferredDistanceKm: offRoadDistanceKm,
        })
      : rawStartPoint;

  return [roadsideDisplayPoint, connectorTarget];
};

export const buildTripEndConnector = ({
  rawEndPoint,
  lastSnappedPoint,
  roadPath = [],
  connectorMinDistanceKm = 0.006,
  connectorMaxDistanceKm = 0.25,
}: {
  rawEndPoint: LatLngPoint | null;
  lastSnappedPoint: LatLngPoint | null;
  roadPath?: LatLngPoint[];
  connectorMinDistanceKm?: number;
  connectorMaxDistanceKm?: number;
}) => {
  if (!rawEndPoint || !lastSnappedPoint) {
    return [];
  }

  const normalizedRoadPath = dedupeSequentialPoints(
    roadPath.length > 1 ? roadPath : [lastSnappedPoint],
  );
  const projectedEnd =
    normalizedRoadPath.length > 0
      ? projectPointToRoadPath(rawEndPoint, normalizedRoadPath)
      : null;
  const connectorTarget = projectedEnd?.point ?? lastSnappedPoint;
  const offRoadDistanceKm = projectedEnd?.distanceKm ?? distanceBetweenKm(rawEndPoint, connectorTarget);
  const connectorDistanceKm = distanceBetweenKm(rawEndPoint, connectorTarget);
  if (
    offRoadDistanceKm < connectorMinDistanceKm ||
    connectorDistanceKm < connectorMinDistanceKm ||
    connectorDistanceKm > connectorMaxDistanceKm
  ) {
    return [];
  }

  const roadsideDisplayPoint =
    projectedEnd && normalizedRoadPath.length >= 2
      ? buildRoadsideConnectorPoint({
          roadProjection: projectedEnd,
          referencePoint: rawEndPoint,
          preferredDistanceKm: offRoadDistanceKm,
        })
      : rawEndPoint;

  return [connectorTarget, roadsideDisplayPoint];
};

export const buildRenderedTripTrace = ({
  rawStartPoint,
  matchedPoints,
  routeState,
  firstSnappedPoint,
  dashedConnector,
  connectorMinDistanceKm = 0.006,
  connectorMaxDistanceKm = 0.25,
}: {
  rawStartPoint: LatLngPoint | null;
  matchedPoints: LatLngPoint[];
  routeState?: TripRouteRenderState;
  firstSnappedPoint?: LatLngPoint | null;
  dashedConnector?: LatLngPoint[];
  connectorMinDistanceKm?: number;
  connectorMaxDistanceKm?: number;
}): TripRenderedTrace => {
  const solidOnRoadPath = dedupeSequentialPoints(matchedPoints);
  const resolvedFirstSnappedPoint = firstSnappedPoint ?? solidOnRoadPath[0] ?? null;
  const connectorSourceRawStartPoint =
    dashedConnector && dashedConnector.length === 2 ? dashedConnector[0] ?? rawStartPoint : rawStartPoint;
  const connectorSourceMatchedPoint =
    dashedConnector && dashedConnector.length === 2
      ? dashedConnector[1] ?? resolvedFirstSnappedPoint
      : resolvedFirstSnappedPoint;
  const resolvedDashedConnector = buildTripStartConnector({
    rawStartPoint: connectorSourceRawStartPoint,
    firstSnappedPoint: connectorSourceMatchedPoint,
    roadPath: solidOnRoadPath,
    connectorMinDistanceKm,
    connectorMaxDistanceKm,
  });
  const resolvedRouteState =
    routeState ?? (resolvedFirstSnappedPoint || solidOnRoadPath.length > 0 ? 'ON_ROAD' : 'PRE_ROAD');

  return {
    rawStartPoint,
    dashedConnector: resolvedDashedConnector,
    solidOnRoadPath,
    firstSnappedPoint: resolvedFirstSnappedPoint,
    routeState: resolvedRouteState,
  };
};

const offsetPointByMeters = (
  origin: LatLngPoint,
  eastMeters: number,
  northMeters: number,
): LatLngPoint => {
  const metersPerLonDegree = Math.max(
    METERS_PER_LAT_DEGREE * Math.cos((origin.latitude * Math.PI) / 180),
    1e-6,
  );

  return {
    latitude: origin.latitude + northMeters / METERS_PER_LAT_DEGREE,
    longitude: origin.longitude + eastMeters / metersPerLonDegree,
  };
};

const buildRoadsideConnectorPoint = ({
  roadProjection,
  referencePoint,
  preferredDistanceKm,
  minDisplayDistanceKm = 0.008,
  maxDisplayDistanceKm = 0.018,
  defaultSideMultiplier = 1,
}: {
  roadProjection: TripRoadProjection;
  referencePoint: LatLngPoint;
  preferredDistanceKm: number;
  minDisplayDistanceKm?: number;
  maxDisplayDistanceKm?: number;
  defaultSideMultiplier?: 1 | -1;
}) => {
  const projectionPoint = roadProjection.point;
  const metersPerLonDegree =
    METERS_PER_LAT_DEGREE * Math.cos((projectionPoint.latitude * Math.PI) / 180);
  const referenceEastMeters =
    (referencePoint.longitude - projectionPoint.longitude) * metersPerLonDegree;
  const referenceNorthMeters =
    (referencePoint.latitude - projectionPoint.latitude) * METERS_PER_LAT_DEGREE;
  const segmentHeadingRad = toRad(roadProjection.segmentHeadingDeg);
  const leftNormalEast = -Math.cos(segmentHeadingRad);
  const leftNormalNorth = Math.sin(segmentHeadingRad);
  const sideAlignment =
    referenceEastMeters * leftNormalEast + referenceNorthMeters * leftNormalNorth;
  const sideMultiplier =
    Math.abs(sideAlignment) >= 0.5 ? (sideAlignment >= 0 ? 1 : -1) : defaultSideMultiplier;
  const displayDistanceMeters = Math.max(
    minDisplayDistanceKm * 1000,
    Math.min(maxDisplayDistanceKm * 1000, preferredDistanceKm * 1000),
  );

  return offsetPointByMeters(
    projectionPoint,
    leftNormalEast * displayDistanceMeters * sideMultiplier,
    leftNormalNorth * displayDistanceMeters * sideMultiplier,
  );
};

export const buildRoadsideDisplayAnchor = ({
  roadPath,
  anchorPoint,
  referencePoint = null,
  defaultDistanceKm = 0.012,
  minDisplayDistanceKm = 0.008,
  maxDisplayDistanceKm = 0.018,
  defaultSide = 'left',
  anchorRole = 'auto',
}: {
  roadPath: LatLngPoint[];
  anchorPoint: LatLngPoint | null;
  referencePoint?: LatLngPoint | null;
  defaultDistanceKm?: number;
  minDisplayDistanceKm?: number;
  maxDisplayDistanceKm?: number;
  defaultSide?: 'left' | 'right';
  anchorRole?: 'auto' | 'start' | 'end';
}) => {
  if (!anchorPoint) {
    return null;
  }

  const normalizedRoadPath = dedupeSequentialPoints(
    roadPath.length > 1 ? roadPath : [anchorPoint],
  );
  const roadProjection =
    normalizedRoadPath.length > 0 ? projectPointToRoadPath(anchorPoint, normalizedRoadPath) : null;
  if (!roadProjection) {
    return null;
  }

  const resolvedReferencePoint =
    referencePoint && distanceBetweenKm(referencePoint, roadProjection.point) >= 0.0005
      ? referencePoint
      : roadProjection.point;

  const preferredDistanceKm = referencePoint
    ? Math.max(defaultDistanceKm, distanceBetweenKm(referencePoint, roadProjection.point))
    : defaultDistanceKm;
  let displaySegmentHeadingDeg = roadProjection.segmentHeadingDeg;
  if (anchorRole === 'start' && normalizedRoadPath.length >= 2) {
    displaySegmentHeadingDeg = headingBetweenDeg(
      normalizedRoadPath[0],
      normalizedRoadPath[Math.min(2, normalizedRoadPath.length - 1)],
    );
  } else if (anchorRole === 'end' && normalizedRoadPath.length >= 2) {
    displaySegmentHeadingDeg = headingBetweenDeg(
      normalizedRoadPath[Math.max(normalizedRoadPath.length - 3, 0)],
      normalizedRoadPath[normalizedRoadPath.length - 1],
    );
  }

  return buildRoadsideConnectorPoint({
    roadProjection: {
      ...roadProjection,
      segmentHeadingDeg: displaySegmentHeadingDeg,
    },
    referencePoint: resolvedReferencePoint,
    preferredDistanceKm,
    minDisplayDistanceKm,
    maxDisplayDistanceKm,
    defaultSideMultiplier: defaultSide === 'left' ? 1 : -1,
  });
};

export const buildMatchedTracePointsFromSegment = ({
  path,
  rawSamples,
  source,
}: {
  path: LatLngPoint[];
  rawSamples: TripTraceRawPoint[];
  source: TripMatchedPointSource;
}): TripMatchedTracePoint[] => {
  const cleanPath = dedupeSequentialPoints(path);
  const cleanSamples = [...rawSamples].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime(),
  );
  if (cleanPath.length === 0 || cleanSamples.length === 0) {
    return [];
  }

  if (cleanPath.length === 1 || cleanSamples.length === 1) {
    return cleanPath.map((point) => ({
      ...point,
      recordedAt: cleanSamples[cleanSamples.length - 1]?.recordedAt ?? new Date().toISOString(),
      source,
    }));
  }

  const startedAtMs = new Date(cleanSamples[0].recordedAt).getTime();
  const endedAtMs = new Date(cleanSamples[cleanSamples.length - 1].recordedAt).getTime();
  const durationMs = Math.max(endedAtMs - startedAtMs, 1);
  const totalDistanceKm = Math.max(polylineDistanceKm(cleanPath), 0.000001);
  let traveledKm = 0;

  return cleanPath.map((point, index) => {
    if (index > 0) {
      traveledKm += distanceBetweenKm(cleanPath[index - 1], point);
    }
    const ratio = Math.max(0, Math.min(1, traveledKm / totalDistanceKm));
    return {
      ...point,
      recordedAt: new Date(startedAtMs + durationMs * ratio).toISOString(),
      source,
    };
  });
};

export const buildLocalFallbackMatchedSegment = ({
  rawPoints,
  previousMatchedPath,
  seedPath = [],
  maxProjectionDistanceKm = 0.02,
  maxBacktrackKm = 0.01,
  maxHeadingDeltaDeg = 58,
}: {
  rawPoints: LatLngPoint[];
  previousMatchedPath: LatLngPoint[];
  seedPath?: LatLngPoint[];
  maxProjectionDistanceKm?: number;
  maxBacktrackKm?: number;
  maxHeadingDeltaDeg?: number;
}): LatLngPoint[] | null => {
  const cleanRawPoints = dedupeSequentialPoints(rawPoints);
  const cleanMatchedPath = dedupeSequentialPoints(previousMatchedPath);
  const cleanSeedPath = dedupeSequentialPoints(seedPath);
  const projectionPath =
    cleanSeedPath.length >= 2
      ? cleanSeedPath
      : cleanMatchedPath.length >= 3
        ? cleanMatchedPath.slice(Math.max(cleanMatchedPath.length - 80, 0))
        : [];
  if (cleanRawPoints.length < 1 || projectionPath.length < 2) {
    return null;
  }
  const projectedPoints: LatLngPoint[] = [];
  let previousProjection: TripRoadProjection | null = null;

  for (let index = 0; index < cleanRawPoints.length; index += 1) {
    const rawPoint = cleanRawPoints[index];
    const projection = projectPointOnPolyline(rawPoint, projectionPath);
    if (!projection || projection.distanceKm > maxProjectionDistanceKm) {
      return null;
    }

    if (previousProjection) {
      const backtrackKm = previousProjection.alongPathKm - projection.alongPathKm;
      if (backtrackKm > maxBacktrackKm) {
        return null;
      }

      const rawMotionHeading =
        index > 0 ? headingBetweenDeg(cleanRawPoints[index - 1], rawPoint) : null;
      if (rawMotionHeading !== null) {
        const headingDelta = Math.abs(
          shortestAngleDelta(projection.segmentHeadingDeg, rawMotionHeading),
        );
        if (headingDelta > maxHeadingDeltaDeg) {
          return null;
        }
      }
    }

    previousProjection = projection;
    projectedPoints.push(projection.point);
  }

  const cleanProjectedPoints = dedupeSequentialPoints(projectedPoints);
  if (cleanProjectedPoints.length === 0) {
    return null;
  }

  const pathStart =
    cleanMatchedPath[cleanMatchedPath.length - 1] ?? projectionPath[0] ?? null;
  const firstProjectedPoint = cleanProjectedPoints[0];
  if (pathStart && firstProjectedPoint) {
    const gapKm = distanceBetweenKm(pathStart, firstProjectedPoint);
    if (gapKm > 0.0002 && gapKm <= 0.02) {
      return dedupeSequentialPoints([
        pathStart,
        interpolatePoint(pathStart, firstProjectedPoint, 0.45),
        firstProjectedPoint,
        ...cleanProjectedPoints.slice(1),
      ]);
    }
  }

  return cleanProjectedPoints;
};

export const buildHeuristicMatchedSegment = ({
  rawPoints,
  previousMatchedPath,
  minBootstrapDistanceKm = 0.003,
  maxReconnectGapKm = 0.08,
}: {
  rawPoints: LatLngPoint[];
  previousMatchedPath: LatLngPoint[];
  minBootstrapDistanceKm?: number;
  maxReconnectGapKm?: number;
}) => {
  const cleanRawPoints = dedupeSequentialPoints(rawPoints);
  const cleanMatchedPath = dedupeSequentialPoints(previousMatchedPath);
  if (cleanRawPoints.length === 0) {
    return null;
  }

  // Last-resort local fallback:
  // when we have no stored road geometry and no online matcher, keep the trace alive
  // with a continuity-preserving smoothed path until true road-centered geometry is available.
  const seededPath =
    cleanMatchedPath.length > 0
      ? [cleanMatchedPath[cleanMatchedPath.length - 1], ...cleanRawPoints]
      : cleanRawPoints;
  const smoothedPath = dedupeSequentialPoints(
    buildDirectionalRoadSnappedPath(seededPath),
  );
  if (smoothedPath.length === 0) {
    return null;
  }

  if (
    cleanMatchedPath.length === 0 &&
    polylineDistanceKm(cleanRawPoints) < minBootstrapDistanceKm &&
    smoothedPath.length < 2
  ) {
    return null;
  }

  const lastMatchedPoint = cleanMatchedPath[cleanMatchedPath.length - 1] ?? null;
  const firstVisiblePoint = smoothedPath[0] ?? null;
  if (
    lastMatchedPoint &&
    firstVisiblePoint &&
    distanceBetweenKm(lastMatchedPoint, firstVisiblePoint) > maxReconnectGapKm
  ) {
    return null;
  }

  return smoothedPath;
};

export const buildLiveMatchedRouteSegmentDetailed = async ({
  rawSamples,
  previousMatchedPath,
  seedPath = [],
  allowRemoteMatch = true,
}: {
  rawSamples: TripTraceRawPoint[];
  previousMatchedPath: LatLngPoint[];
  seedPath?: LatLngPoint[];
  allowRemoteMatch?: boolean;
}): Promise<LiveMatchedRouteSegmentResult> => {
  const cleanRawSamples = [...rawSamples].filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );
  const rawPoints = dedupeSequentialPoints(
    cleanRawSamples.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
  );
  const cleanPreviousMatchedPath = dedupeSequentialPoints(previousMatchedPath);
  const cleanSeedPath = dedupeSequentialPoints(seedPath);

  if (rawPoints.length === 0) {
    return {
      path: null,
      source: 'local-fallback',
      metadata: null,
    };
  }

  const candidatePath = dedupeSequentialPoints([
    ...(cleanPreviousMatchedPath.length > 0
      ? [cleanPreviousMatchedPath[cleanPreviousMatchedPath.length - 1]]
      : []),
    ...rawPoints,
  ]);

  if (allowRemoteMatch && candidatePath.length >= 2) {
    const remoteMatchResult = await fetchOsrmMatchedRoadPathDetailed(cleanRawSamples);
    const remotePath = dedupeSequentialPoints(remoteMatchResult.path ?? []);
    if (remotePath.length >= 2 && remoteMatchResult.metadata?.provider === 'osrm-match') {
      return {
        path: remotePath,
        source: 'service',
        metadata: remoteMatchResult.metadata,
      };
    }
  }

  const localFallbackPath =
    cleanSeedPath.length >= 2
      ? buildLocalFallbackMatchedSegment({
          rawPoints,
          previousMatchedPath: cleanPreviousMatchedPath,
          seedPath: cleanSeedPath,
        })
      : null;
  if (localFallbackPath && localFallbackPath.length >= 2) {
    return {
      path: localFallbackPath,
      source: 'local-fallback',
      metadata: null,
    };
  }

  const heuristicPath = buildHeuristicMatchedSegment({
    rawPoints,
    previousMatchedPath: cleanPreviousMatchedPath,
  });
  if (heuristicPath && heuristicPath.length > 0) {
    return {
      path: heuristicPath,
      source: 'local-heuristic',
      metadata: null,
    };
  }

  const locallySnappedPath = dedupeSequentialPoints(
    buildDirectionalRoadSnappedPath(candidatePath.length >= 2 ? candidatePath : rawPoints),
  );
  if (locallySnappedPath.length >= 2) {
    return {
      path: smoothDisplayedRoutePath(locallySnappedPath),
      source: 'local-heuristic',
      metadata: null,
    };
  }

  return {
    path: null,
    source: 'local-fallback',
    metadata: null,
  };
};
