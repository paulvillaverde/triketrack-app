import { dedupeSequentialPoints, type LatLngPoint } from './roadPath';

const BUILDING_POLYGON_API_BASE_URL =
  process.env.EXPO_PUBLIC_BUILDING_POLYGON_API_BASE_URL?.trim() ??
  'https://overpass-api.de/api/interpreter';
const BUILDING_SEARCH_RADIUS_METERS = 70;
const BUILDING_QUERY_TIMEOUT_SECONDS = 8;
const BUILDING_FETCH_TIMEOUT_MS = 4500;
const MIN_CONNECTOR_DISTANCE_METERS = 4;
const MAX_CONNECTOR_DISTANCE_METERS = 65;
const MAX_RAW_REFERENCE_DISTANCE_METERS = 45;
const SIDE_EPSILON_METERS = 1.5;
const METERS_PER_LAT_DEGREE = 111320;

type BuildingPolygonRecord = {
  id: string;
  name: string | null;
  points: LatLngPoint[];
};

export type TripEndpointSelectionSide = 'left' | 'right' | 'undetermined';

export type TripEndpointSelectionSummary = {
  provider: 'building-boundary' | 'road-end-fallback';
  source: 'overpass' | 'none';
  desiredSide: TripEndpointSelectionSide;
  selectedSide: TripEndpointSelectionSide;
  roadEndpoint: LatLngPoint | null;
  boundaryPoint: LatLngPoint | null;
  connectorDistanceMeters: number | null;
  rawReferenceDistanceMeters: number | null;
  buildingId: string | null;
  buildingName: string | null;
  searchRadiusMeters: number;
};

export type TripEndpointSelectionResult = {
  roadEndpoint: LatLngPoint | null;
  finalEndpoint: LatLngPoint | null;
  dashedConnector: LatLngPoint[];
  summary: TripEndpointSelectionSummary;
};

const appendQueryData = (baseUrl: string, query: string) => {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}data=${encodeURIComponent(query)}`;
};

const distanceMetersBetween = (from: LatLngPoint, to: LatLngPoint) => {
  const lonScale = METERS_PER_LAT_DEGREE * Math.cos((from.latitude * Math.PI) / 180);
  return Math.hypot(
    (to.latitude - from.latitude) * METERS_PER_LAT_DEGREE,
    (to.longitude - from.longitude) * Math.max(lonScale, 0.000001),
  );
};

const toLocalMeters = (point: LatLngPoint, origin: LatLngPoint) => {
  const metersPerLonDegree =
    METERS_PER_LAT_DEGREE * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * Math.max(metersPerLonDegree, 0.000001),
    y: (point.latitude - origin.latitude) * METERS_PER_LAT_DEGREE,
  };
};

const pointsMatch = (left: LatLngPoint, right: LatLngPoint) =>
  Math.abs(left.latitude - right.latitude) < 0.000001 &&
  Math.abs(left.longitude - right.longitude) < 0.000001;

const ensureClosedPolygon = (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 3) {
    return [];
  }
  const firstPoint = cleanPoints[0];
  const lastPoint = cleanPoints[cleanPoints.length - 1];
  if (pointsMatch(firstPoint, lastPoint)) {
    return cleanPoints;
  }
  return [...cleanPoints, firstPoint];
};

const projectPointToSegment = (
  point: LatLngPoint,
  segmentStart: LatLngPoint,
  segmentEnd: LatLngPoint,
) => {
  const origin = segmentStart;
  const pointMeters = toLocalMeters(point, origin);
  const startMeters = { x: 0, y: 0 };
  const endMeters = toLocalMeters(segmentEnd, origin);
  const deltaX = endMeters.x - startMeters.x;
  const deltaY = endMeters.y - startMeters.y;
  const denominator = deltaX * deltaX + deltaY * deltaY;

  if (denominator <= 1e-9) {
    return {
      point: segmentStart,
      distanceMeters: distanceMetersBetween(point, segmentStart),
      ratio: 0,
    };
  }

  const projectionRatio = Math.max(
    0,
    Math.min(
      1,
      ((pointMeters.x - startMeters.x) * deltaX + (pointMeters.y - startMeters.y) * deltaY) /
        denominator,
    ),
  );
  const projectedX = startMeters.x + deltaX * projectionRatio;
  const projectedY = startMeters.y + deltaY * projectionRatio;
  const metersPerLonDegree =
    METERS_PER_LAT_DEGREE * Math.cos((origin.latitude * Math.PI) / 180);

  const projectedPoint = {
    latitude: origin.latitude + projectedY / METERS_PER_LAT_DEGREE,
    longitude: origin.longitude + projectedX / Math.max(metersPerLonDegree, 0.000001),
  };

  return {
    point: projectedPoint,
    distanceMeters: distanceMetersBetween(point, projectedPoint),
    ratio: projectionRatio,
  };
};

const projectPointToPolygonBoundary = (point: LatLngPoint, polygon: LatLngPoint[]) => {
  if (polygon.length < 2) {
    return null;
  }

  let bestProjection:
    | {
        point: LatLngPoint;
        distanceMeters: number;
      }
    | null = null;

  for (let index = 1; index < polygon.length; index += 1) {
    const projection = projectPointToSegment(point, polygon[index - 1], polygon[index]);
    if (!bestProjection || projection.distanceMeters < bestProjection.distanceMeters) {
      bestProjection = projection;
    }
  }

  return bestProjection;
};

const getTripRoadTail = (roadPath: LatLngPoint[]) => {
  const cleanRoadPath = dedupeSequentialPoints(roadPath);
  if (cleanRoadPath.length < 2) {
    return null;
  }
  const roadEndpoint = cleanRoadPath[cleanRoadPath.length - 1];
  const previousRoadPoint = cleanRoadPath[cleanRoadPath.length - 2];
  return {
    roadEndpoint,
    previousRoadPoint,
  };
};

const resolveRoadSide = ({
  roadEndpoint,
  previousRoadPoint,
  referencePoint,
}: {
  roadEndpoint: LatLngPoint;
  previousRoadPoint: LatLngPoint;
  referencePoint: LatLngPoint;
}): TripEndpointSelectionSide => {
  const origin = roadEndpoint;
  const roadVector = toLocalMeters(roadEndpoint, previousRoadPoint);
  const referenceVector = toLocalMeters(referencePoint, origin);
  const roadVectorLength = Math.hypot(roadVector.x, roadVector.y);
  if (roadVectorLength <= 0.000001) {
    return 'undetermined';
  }
  const signedOffsetMeters =
    (roadVector.x * referenceVector.y - roadVector.y * referenceVector.x) / roadVectorLength;

  if (Math.abs(signedOffsetMeters) <= SIDE_EPSILON_METERS) {
    return 'undetermined';
  }

  return signedOffsetMeters > 0 ? 'left' : 'right';
};

const buildFallbackResult = (
  roadEndpoint: LatLngPoint | null,
  desiredSide: TripEndpointSelectionSide,
): TripEndpointSelectionResult => ({
  roadEndpoint,
  finalEndpoint: roadEndpoint,
  dashedConnector: [],
  summary: {
    provider: 'road-end-fallback',
    source: 'none',
    desiredSide,
    selectedSide: 'undetermined',
    roadEndpoint,
    boundaryPoint: null,
    connectorDistanceMeters: null,
    rawReferenceDistanceMeters: null,
    buildingId: null,
    buildingName: null,
    searchRadiusMeters: BUILDING_SEARCH_RADIUS_METERS,
  },
});

const fetchJsonWithTimeout = async (url: string) => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('building-endpoint-timeout')), BUILDING_FETCH_TIMEOUT_MS);
  });
  return Promise.race([fetch(url), timeoutPromise]);
};

const fetchNearbyBuildingPolygons = async (
  anchorPoint: LatLngPoint,
): Promise<BuildingPolygonRecord[]> => {
  if (!BUILDING_POLYGON_API_BASE_URL) {
    return [];
  }

  const query = `
[out:json][timeout:${BUILDING_QUERY_TIMEOUT_SECONDS}];
(
  way["building"](around:${BUILDING_SEARCH_RADIUS_METERS},${anchorPoint.latitude},${anchorPoint.longitude});
);
out geom;
`;

  try {
    const response = await fetchJsonWithTimeout(
      appendQueryData(BUILDING_POLYGON_API_BASE_URL, query),
    );
    if (!response.ok) {
      return [];
    }

    const json = (await response.json()) as {
      elements?: Array<{
        id?: number;
        type?: string;
        tags?: Record<string, string>;
        geometry?: Array<{ lat?: number; lon?: number }>;
      }>;
    };

    return (json.elements ?? [])
      .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
      .map((element) => {
        const points = ensureClosedPolygon(
          (element.geometry ?? [])
            .filter(
              (point): point is { lat: number; lon: number } =>
                typeof point.lat === 'number' &&
                Number.isFinite(point.lat) &&
                typeof point.lon === 'number' &&
                Number.isFinite(point.lon),
            )
            .map((point) => ({
              latitude: point.lat,
              longitude: point.lon,
            })),
        );

        return {
          id: typeof element.id === 'number' ? `way:${element.id}` : 'way:unknown',
          name: element.tags?.name?.trim() || null,
          points,
        };
      })
      .filter((element) => element.points.length >= 4);
  } catch {
    return [];
  }
};

export const selectTripEndpointFromBuildings = async ({
  roadPath,
  rawEndPoint = null,
}: {
  roadPath: LatLngPoint[];
  rawEndPoint?: LatLngPoint | null;
}): Promise<TripEndpointSelectionResult> => {
  const roadTail = getTripRoadTail(roadPath);
  if (!roadTail) {
    const fallbackEndpoint = dedupeSequentialPoints(roadPath).at(-1) ?? null;
    return buildFallbackResult(fallbackEndpoint, 'undetermined');
  }

  const { roadEndpoint, previousRoadPoint } = roadTail;
  if (!rawEndPoint) {
    return buildFallbackResult(roadEndpoint, 'undetermined');
  }
  const desiredSide = rawEndPoint
    ? resolveRoadSide({
        roadEndpoint,
        previousRoadPoint,
        referencePoint: rawEndPoint,
      })
    : 'undetermined';
  const boundaryAnchor = rawEndPoint;
  const buildingPolygons = await fetchNearbyBuildingPolygons(boundaryAnchor);

  let bestCandidate:
    | {
        point: LatLngPoint;
        buildingId: string;
        buildingName: string | null;
        selectedSide: TripEndpointSelectionSide;
        connectorDistanceMeters: number;
        rawReferenceDistanceMeters: number;
        score: number;
      }
    | null = null;

  for (const polygon of buildingPolygons) {
    const boundaryProjection = projectPointToPolygonBoundary(boundaryAnchor, polygon.points);
    if (!boundaryProjection) {
      continue;
    }

    const connectorDistanceMeters = distanceMetersBetween(roadEndpoint, boundaryProjection.point);
    if (
      connectorDistanceMeters < MIN_CONNECTOR_DISTANCE_METERS ||
      connectorDistanceMeters > MAX_CONNECTOR_DISTANCE_METERS
    ) {
      continue;
    }

    const rawReferenceDistanceMeters = rawEndPoint
      ? distanceMetersBetween(rawEndPoint, boundaryProjection.point)
      : connectorDistanceMeters;
    if (
      rawEndPoint &&
      rawReferenceDistanceMeters > MAX_RAW_REFERENCE_DISTANCE_METERS
    ) {
      continue;
    }

    const selectedSide = resolveRoadSide({
      roadEndpoint,
      previousRoadPoint,
      referencePoint: boundaryProjection.point,
    });

    if (
      desiredSide !== 'undetermined' &&
      selectedSide !== 'undetermined' &&
      selectedSide !== desiredSide
    ) {
      continue;
    }

    const score = rawEndPoint
      ? rawReferenceDistanceMeters * 0.7 + connectorDistanceMeters * 0.3
      : connectorDistanceMeters;
    if (!bestCandidate || score < bestCandidate.score) {
      bestCandidate = {
        point: boundaryProjection.point,
        buildingId: polygon.id,
        buildingName: polygon.name,
        selectedSide,
        connectorDistanceMeters,
        rawReferenceDistanceMeters,
        score,
      };
    }
  }

  if (!bestCandidate) {
    return buildFallbackResult(roadEndpoint, desiredSide);
  }

  return {
    roadEndpoint,
    finalEndpoint: bestCandidate.point,
    dashedConnector: [roadEndpoint, bestCandidate.point],
    summary: {
      provider: 'building-boundary',
      source: 'overpass',
      desiredSide,
      selectedSide: bestCandidate.selectedSide,
      roadEndpoint,
      boundaryPoint: bestCandidate.point,
      connectorDistanceMeters: bestCandidate.connectorDistanceMeters,
      rawReferenceDistanceMeters: bestCandidate.rawReferenceDistanceMeters,
      buildingId: bestCandidate.buildingId,
      buildingName: bestCandidate.buildingName,
      searchRadiusMeters: BUILDING_SEARCH_RADIUS_METERS,
    },
  };
};

export const selectTripStartEndpointFromBuildings = async ({
  roadPath,
  rawStartPoint = null,
}: {
  roadPath: LatLngPoint[];
  rawStartPoint?: LatLngPoint | null;
}) => {
  const reversedRoadPath = [...dedupeSequentialPoints(roadPath)].reverse();
  return selectTripEndpointFromBuildings({
    roadPath: reversedRoadPath,
    rawEndPoint: rawStartPoint,
  });
};
