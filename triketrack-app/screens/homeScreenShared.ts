import { dedupeSequentialPoints, type LatLngPoint } from '../lib/roadPath';

export const OBRERO_GEOFENCE: Array<{ latitude: number; longitude: number }> = [
  { latitude: 7.0849408, longitude: 125.6121403 },
  { latitude: 7.0861485, longitude: 125.6130254 },
  { latitude: 7.09253, longitude: 125.61713 },
  { latitude: 7.0832297, longitude: 125.6242034 },
  { latitude: 7.0771506, longitude: 125.6170807 },
  { latitude: 7.0776251, longitude: 125.6141467 },
  { latitude: 7.0835656, longitude: 125.6126754 },
];

export const NORMAL_CAMERA = {
  zoom: 14,
  pitch: 0,
  heading: 0,
} as const;

export const MIN_TRACK_MOVE_KM = 0.004;
export const MAX_POINT_GAP_KM = 0.3;
export const MAX_ACCEPTED_ACCURACY_METERS = 35;
export const INITIAL_VISIBLE_ACCURACY_METERS = 65;
export const HIGH_CONFIDENCE_ACCURACY_METERS = 20;
export const COARSE_FIRST_FIX_ACCURACY_METERS = 250;
export const MAX_LOCATION_JUMP_KM = 0.08;
export const MAX_ACCEPTED_SPEED_KMH = 95;
export const MAX_STATIONARY_SPEED_KMH = 3;
export const MIN_SNAPPED_MOVE_KM = 0.004;
export const MOVEMENT_CONFIRMATION_COUNT = 2;
export const MIN_ROAD_MATCH_POINTS = 1;
export const ROAD_MATCH_BATCH_SIZE = 1;
export const FAST_START_REQUIRED_ACCURACY_METERS = 80;
export const INITIAL_LOCATION_TIMEOUT_MS = 4000;
export const WATCH_LOCATION_INTERVAL_MS = 1000;
export const LAST_KNOWN_MAX_AGE_MS = 15000;
export const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 250;
export const TRIP_CAMERA_FOLLOW_INTERVAL_MS = 350;
export const ENABLE_TRIP_SIMULATION = process.env.EXPO_PUBLIC_ENABLE_TRIP_SIMULATION === 'true';

export const SIMULATION_ROUTE_TEMPLATES: LatLngPoint[][] = [
  [
    { latitude: 7.08348, longitude: 125.61247 },
    { latitude: 7.08391, longitude: 125.61295 },
    { latitude: 7.08442, longitude: 125.61353 },
    { latitude: 7.08492, longitude: 125.61404 },
    { latitude: 7.08541, longitude: 125.61431 },
    { latitude: 7.08603, longitude: 125.61444 },
  ],
  [
    { latitude: 7.08355, longitude: 125.61258 },
    { latitude: 7.08396, longitude: 125.61302 },
    { latitude: 7.08436, longitude: 125.61347 },
    { latitude: 7.08482, longitude: 125.61393 },
    { latitude: 7.08526, longitude: 125.61422 },
    { latitude: 7.08574, longitude: 125.61439 },
  ],
  [
    { latitude: 7.08344, longitude: 125.61254 },
    { latitude: 7.08376, longitude: 125.61289 },
    { latitude: 7.08414, longitude: 125.6133 },
    { latitude: 7.08459, longitude: 125.61377 },
    { latitude: 7.08506, longitude: 125.61414 },
    { latitude: 7.08563, longitude: 125.61441 },
  ],
];

export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#64779e' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334e87' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba5' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#023e58' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#3C7680' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#023e58' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'transit', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'transit.line', elementType: 'geometry.fill', stylers: [{ color: '#283d6a' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#3a4762' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
] as const;

export const MAP_TYPE_OPTIONS = ['default', 'satellite', 'dark'] as const;
export type MapTypeOption = (typeof MAP_TYPE_OPTIONS)[number];

export const isPointInsidePolygon = (
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>,
) => {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

export const buildRandomSimulationWaypoints = (currentPoint: LatLngPoint | null) => {
  const randomTemplate =
    SIMULATION_ROUTE_TEMPLATES[Math.floor(Math.random() * SIMULATION_ROUTE_TEMPLATES.length)] ??
    SIMULATION_ROUTE_TEMPLATES[0] ??
    [];
  const shouldReverse = Math.random() >= 0.5;
  const selectedTemplate = shouldReverse ? [...randomTemplate].reverse() : [...randomTemplate];

  if (!currentPoint || !isPointInsidePolygon(currentPoint, [...OBRERO_GEOFENCE])) {
    return selectedTemplate;
  }

  return dedupeSequentialPoints([currentPoint, ...selectedTemplate]);
};

export const isValidCoordinate = (
  point: { latitude: number; longitude: number } | null | undefined,
): point is { latitude: number; longitude: number } =>
  Boolean(
    point &&
      typeof point.latitude === 'number' &&
      Number.isFinite(point.latitude) &&
      typeof point.longitude === 'number' &&
      Number.isFinite(point.longitude),
  );

export const formatPeso = (amount: number) =>
  `\u20B1${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const mergeRouteSegment = (current: LatLngPoint[], segment: LatLngPoint[]) => {
  if (segment.length === 0) {
    return current;
  }
  if (current.length === 0) {
    return segment;
  }

  const last = current[current.length - 1];
  const first = segment[0];
  const samePoint =
    Math.abs(last.latitude - first.latitude) < 0.00001 &&
    Math.abs(last.longitude - first.longitude) < 0.00001;

  return samePoint ? [...current, ...segment.slice(1)] : [...current, ...segment];
};

export const averagePoints = (points: LatLngPoint[]) => {
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
};
