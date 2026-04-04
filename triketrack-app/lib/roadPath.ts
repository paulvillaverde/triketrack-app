export type LatLngPoint = {
  latitude: number;
  longitude: number;
};

const ROAD_MATCH_API_BASE_URL =
  process.env.EXPO_PUBLIC_ROAD_MATCH_API_BASE_URL ?? 'https://router.project-osrm.org';
const OPENROUTESERVICE_API_BASE_URL =
  process.env.EXPO_PUBLIC_ORS_API_BASE_URL?.trim() ?? 'https://api.openrouteservice.org';
const OPENROUTESERVICE_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim() ?? '';
const OPENROUTESERVICE_PROFILE = 'driving-car';
const OPENROUTESERVICE_DIRECTIONS_MAX_POINTS = 50;
const GOOGLE_ROADS_API_BASE_URL = 'https://roads.googleapis.com/v1';
const GOOGLE_ROADS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_ROADS_API_KEY?.trim() ?? '';
const GOOGLE_ROADS_MAX_POINTS_PER_REQUEST = 100;

export const dedupeSequentialPoints = (points: LatLngPoint[]) => {
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

export const fetchNearestRoadPoint = async (point: LatLngPoint) => {
  const url =
    `${ROAD_MATCH_API_BASE_URL}/nearest/v1/driving/${point.longitude},${point.latitude}` +
    '?number=1';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      waypoints?: Array<{ location?: [number, number] }>;
    };
    const location = json.waypoints?.[0]?.location;
    if (!location || location.length < 2) {
      return null;
    }

    return {
      latitude: location[1],
      longitude: location[0],
    };
  } catch {
    return null;
  }
};

export const fetchRoutedRoadPath = async (points: LatLngPoint[]) => {
  const snappedWaypoints = await Promise.all(
    dedupeSequentialPoints(points).map(async (point) => (await fetchNearestRoadPoint(point)) ?? point),
  );
  const cleanPoints = dedupeSequentialPoints(snappedWaypoints);
  if (cleanPoints.length < 2) {
    return null;
  }

  const coordinates = cleanPoints.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url =
    `${ROAD_MATCH_API_BASE_URL}/route/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&steps=false&continue_straight=true';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    const routedCoordinates = json.routes?.[0]?.geometry?.coordinates;
    if (!routedCoordinates || routedCoordinates.length < 2) {
      return null;
    }

    return dedupeSequentialPoints(
      routedCoordinates
        .filter((point) => Array.isArray(point) && point.length >= 2)
        .map((point) => ({
          latitude: point[1],
          longitude: point[0],
        })),
    );
  } catch {
    return null;
  }
};

export const fetchOpenRouteServiceRoadPath = async (points: LatLngPoint[]) => {
  if (!OPENROUTESERVICE_API_KEY) {
    return null;
  }

  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return null;
  }

  const chunks = chunkDirectionsPoints(cleanPoints);
  const mergedRoute: LatLngPoint[] = [];

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
            instructions: false,
            geometry_simplify: false,
          }),
        },
      );

      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as {
        features?: Array<{
          geometry?: {
            coordinates?: number[][];
          };
        }>;
      };
      const chunkRoute = mapCoordinatePairsToPoints(json.features?.[0]?.geometry?.coordinates ?? null);
      if (chunkRoute.length < 2) {
        return null;
      }

      mergedRoute.push(...chunkRoute);
    } catch {
      return null;
    }
  }

  const cleanMergedRoute = dedupeSequentialPoints(mergedRoute);
  return cleanMergedRoute.length >= 2 ? cleanMergedRoute : null;
};

export const fetchMatchedRoadPath = async (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return null;
  }

  const coordinates = cleanPoints.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url =
    `${ROAD_MATCH_API_BASE_URL}/match/v1/driving/${coordinates}` +
    '?overview=full&geometries=geojson&gaps=ignore&tidy=true';

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      matchings?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    const matchedCoordinates = json.matchings?.flatMap((matching) => matching.geometry?.coordinates ?? []);
    if (!matchedCoordinates || matchedCoordinates.length < 2) {
      return null;
    }

    return dedupeSequentialPoints(
      matchedCoordinates
        .filter((point) => Array.isArray(point) && point.length >= 2)
        .map((point) => ({
          latitude: point[1],
          longitude: point[0],
        })),
    );
  } catch {
    return null;
  }
};

export const fetchPreferredRoadPath = async (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return null;
  }

  return (
    (await fetchOpenRouteServiceRoadPath(cleanPoints)) ??
    (await fetchMatchedRoadPath(cleanPoints)) ??
    (await fetchRoutedRoadPath(cleanPoints))
  );
};

const buildRoadsApiChunks = (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length <= GOOGLE_ROADS_MAX_POINTS_PER_REQUEST) {
    return [cleanPoints];
  }

  const chunks: LatLngPoint[][] = [];
  const step = GOOGLE_ROADS_MAX_POINTS_PER_REQUEST - 1;
  for (let index = 0; index < cleanPoints.length; index += step) {
    const chunk = cleanPoints.slice(index, index + GOOGLE_ROADS_MAX_POINTS_PER_REQUEST);
    if (chunk.length >= 2) {
      chunks.push(chunk);
    }
  }

  return chunks;
};

export const fetchGoogleSnappedRoadPath = async (points: LatLngPoint[]) => {
  if (!GOOGLE_ROADS_API_KEY) {
    return null;
  }

  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return null;
  }

  const chunks = buildRoadsApiChunks(cleanPoints);
  const snappedPoints: LatLngPoint[] = [];

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      path: chunk.map((point) => `${point.latitude},${point.longitude}`).join('|'),
      interpolate: 'true',
      key: GOOGLE_ROADS_API_KEY,
    });

    try {
      const response = await fetch(`${GOOGLE_ROADS_API_BASE_URL}/snapToRoads?${params.toString()}`);
      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as {
        snappedPoints?: Array<{
          location?: {
            latitude?: number;
            longitude?: number;
          };
        }>;
      };

      const chunkResult =
        json.snappedPoints
          ?.map((point) => point.location)
          .filter(
            (
              location,
            ): location is {
              latitude: number;
              longitude: number;
            } =>
              Boolean(
                location &&
                  typeof location.latitude === 'number' &&
                  Number.isFinite(location.latitude) &&
                  typeof location.longitude === 'number' &&
                  Number.isFinite(location.longitude),
              ),
          )
          .map((location) => ({
            latitude: location.latitude,
            longitude: location.longitude,
          })) ?? [];

      if (chunkResult.length < 2) {
        return null;
      }

      snappedPoints.push(...chunkResult);
    } catch {
      return null;
    }
  }

  const cleanSnappedPoints = dedupeSequentialPoints(snappedPoints);
  return cleanSnappedPoints.length >= 2 ? cleanSnappedPoints : null;
};

export const snapActualPathToRoad = async (points: LatLngPoint[]) => {
  const cleanPoints = dedupeSequentialPoints(points);
  if (cleanPoints.length < 2) {
    return cleanPoints;
  }

  const snappedPath =
    (await fetchGoogleSnappedRoadPath(cleanPoints)) ??
    (await fetchPreferredRoadPath(cleanPoints)) ??
    cleanPoints;

  return smoothDisplayedRoutePath(snappedPath);
};
