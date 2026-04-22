import type { LatLngPoint } from '../lib/roadPath';
import * as Location from 'expo-location';

export const OBRERO_GEOFENCE: Array<{ latitude: number; longitude: number }> = [
  { latitude: 7.0832297, longitude: 125.624803 },
  { latitude: 7.076611, longitude: 125.617071 },
  { latitude: 7.078821, longitude: 125.6140047 },
  { latitude: 7.0817, longitude: 125.612905 },
  { latitude: 7.0835656, longitude: 125.612594 },
  { latitude: 7.0849408, longitude: 125.611754 },
  { latitude: 7.0868171, longitude: 125.613004 },
  { latitude: 7.09187, longitude: 125.6177977 },
];

export const NORMAL_CAMERA = {
  zoom: 14,
  pitch: 0,
  heading: 0,
} as const;

export const GPS_POINT_FILTER_DISTANCE_METERS = 3;
export const GPS_POINT_FILTER_DISTANCE_KM = GPS_POINT_FILTER_DISTANCE_METERS / 1000;
export const MIN_TRACK_MOVE_KM = GPS_POINT_FILTER_DISTANCE_KM;
export const MAX_POINT_GAP_KM = 0.3;
export const MAX_ACCEPTED_ACCURACY_METERS = 26;
export const INITIAL_VISIBLE_ACCURACY_METERS = 24;
export const HIGH_CONFIDENCE_ACCURACY_METERS = 8;
export const COARSE_FIRST_FIX_ACCURACY_METERS = 250;
export const WEAK_GPS_RECOVERY_ACCURACY_METERS = 38;
export const MAX_LOCATION_JUMP_KM = 0.04;
export const MAX_ACCEPTED_SPEED_KMH = 95;
export const MAX_STATIONARY_SPEED_KMH = 2.5;
export const MIN_SNAPPED_MOVE_KM = GPS_POINT_FILTER_DISTANCE_KM;
export const MOVEMENT_CONFIRMATION_COUNT = 2;
export const MIN_ROAD_MATCH_POINTS = 2;
export const ROAD_MATCH_BATCH_SIZE = 4;
export const ROAD_MATCH_OVERLAP_POINTS = 2;
export const FAST_START_REQUIRED_ACCURACY_METERS = 22;
export const FINALIZE_REQUIRED_ACCURACY_METERS = 18;
export const FINALIZE_LOCK_TIMEOUT_MS = 5000;
export const FINALIZE_MIN_VALID_POINTS = 4;
export const INITIAL_LOCATION_TIMEOUT_MS = 4000;
export const WATCH_LOCATION_INTERVAL_MS = 1000;
export const GPS_DISTANCE_INTERVAL_METERS = 1;
export const GPS_STALE_SAMPLE_THRESHOLD_MS = 2400;
export const TRIP_CAMERA_FOLLOW_INTERVAL_MS = 280;
export const IDLE_WATCH_LOCATION_INTERVAL_MS = 3500;
export const IDLE_GPS_DISTANCE_INTERVAL_METERS = 8;
export const IDLE_GPS_STALE_SAMPLE_THRESHOLD_MS = 12000;
export const ACTIVE_CAMERA_ACCURACY_METERS = 14;
export const IDLE_CAMERA_ACCURACY_METERS = 14;
export const ACTIVE_LOCATION_ACCURACY = Location.Accuracy.BestForNavigation;
export const IDLE_LOCATION_ACCURACY = Location.Accuracy.High;

type LiveMotionThresholdMode = 'display' | 'trace';

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeSpeedKmh = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const normalizeAccuracyMeters = (value?: number | null, fallback = 10) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export const getAdaptiveGpsMotionThresholdKm = ({
  accuracyMeters,
  speedKmh,
  hasDirectionalSignal,
  mode,
}: {
  accuracyMeters?: number | null;
  speedKmh?: number | null;
  hasDirectionalSignal?: boolean;
  mode: LiveMotionThresholdMode;
}) => {
  const minMeters = mode === 'display' ? 4 : 5;
  const maxMeters = mode === 'display' ? 10.5 : 14.5;
  const baseAccuracyMeters = normalizeAccuracyMeters(
    accuracyMeters,
    mode === 'display' ? HIGH_CONFIDENCE_ACCURACY_METERS : MAX_ACCEPTED_ACCURACY_METERS * 0.45,
  );
  let thresholdMeters = clampNumber(
    baseAccuracyMeters * (mode === 'display' ? 0.38 : 0.52),
    minMeters,
    maxMeters,
  );
  const normalizedSpeedKmh = normalizeSpeedKmh(speedKmh);

  if (normalizedSpeedKmh === null || normalizedSpeedKmh < 3) {
    thresholdMeters += mode === 'display' ? 1.4 : 2.2;
  } else if (normalizedSpeedKmh < 7) {
    thresholdMeters += mode === 'display' ? 0.7 : 1.1;
  } else if (normalizedSpeedKmh >= 18) {
    thresholdMeters -= 1.2;
  }

  if (!hasDirectionalSignal) {
    thresholdMeters += mode === 'display' ? 0.9 : 1.6;
  }

  return clampNumber(thresholdMeters, minMeters, maxMeters) / 1000;
};

export const shouldRejectGpsBacktrack = ({
  movementKm,
  headingDeltaDeg,
  accuracyMeters,
  speedKmh,
  mode,
}: {
  movementKm: number;
  headingDeltaDeg?: number | null;
  accuracyMeters?: number | null;
  speedKmh?: number | null;
  mode: LiveMotionThresholdMode;
}) => {
  if (
    typeof headingDeltaDeg !== 'number' ||
    !Number.isFinite(headingDeltaDeg) ||
    Math.abs(headingDeltaDeg) < 105
  ) {
    return false;
  }

  const normalizedSpeedKmh = normalizeSpeedKmh(speedKmh);
  if (normalizedSpeedKmh !== null && normalizedSpeedKmh >= 11) {
    return false;
  }

  const thresholdKm = getAdaptiveGpsMotionThresholdKm({
    accuracyMeters,
    speedKmh,
    hasDirectionalSignal: true,
    mode,
  });

  return movementKm <= thresholdKm * (mode === 'display' ? 1.8 : 2.1);
};

export const shouldRequireGpsMotionConfirmation = ({
  movementKm,
  thresholdKm,
  speedKmh,
  hasDirectionalSignal,
}: {
  movementKm: number;
  thresholdKm: number;
  speedKmh?: number | null;
  hasDirectionalSignal?: boolean;
}) => {
  const normalizedSpeedKmh = normalizeSpeedKmh(speedKmh);
  if (normalizedSpeedKmh !== null && normalizedSpeedKmh >= 10) {
    return false;
  }

  if (movementKm >= thresholdKm * 1.85) {
    return false;
  }

  return !hasDirectionalSignal || movementKm < thresholdKm * 1.45;
};

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

export const MAXIM_UI_BG_DARK = '#1D222B';
export const MAXIM_UI_SURFACE_DARK = '#2A303B';
export const MAXIM_UI_SURFACE_ALT_DARK = '#232933';
export const MAXIM_UI_SURFACE_ELEVATED_DARK = '#39414D';
export const MAXIM_UI_BORDER_DARK = '#434D5C';
export const MAXIM_UI_BORDER_SOFT_DARK = '#353E4C';
export const MAXIM_UI_TEXT_DARK = '#F4F7FB';
export const MAXIM_UI_MUTED_DARK = '#C7D2DE';
export const MAXIM_UI_SUBTLE_DARK = '#A8B6C7';
export const MAXIM_UI_CHROME_DARK = 'rgba(111, 129, 152, 0.9)';
export const MAXIM_UI_GREEN_SOFT_DARK = 'rgba(87, 199, 168, 0.18)';
export const MAXIM_UI_GREEN_BORDER_DARK = 'rgba(87, 199, 168, 0.3)';

export const LOW_BATTERY_MAP_ACCENT = '#F4D24E';
export const LOW_BATTERY_MAP_ACCENT_SOFT = 'rgba(244,210,78,0.16)';
export const LOW_BATTERY_MAP_ACCENT_CASING = 'rgba(20,26,35,0.72)';

// Maxim-like matched route styling: brighter blue core with a soft pale casing.
export const MAXIM_ROUTE_CORE_LIGHT = '#2F8CFF';
export const MAXIM_ROUTE_CASING_LIGHT = 'rgba(255,255,255,0.96)';
export const MAXIM_ROUTE_CORE_DARK = '#F4D24E';
export const MAXIM_ROUTE_CASING_DARK = 'rgba(255,245,176,0.28)';
export const MAXIM_ROUTE_WIDTH_CASING_NAV = 8;
export const MAXIM_ROUTE_WIDTH_CORE_NAV = 5;
export const MAXIM_ROUTE_WIDTH_CASING_DETAIL = 7;
export const MAXIM_ROUTE_WIDTH_CORE_DETAIL = 4;

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

const distanceBetweenRoutePointsKm = (from: LatLngPoint, to: LatLngPoint) => {
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
  return earthRadiusKm * c;
};

const dedupeRoutePoints = (points: LatLngPoint[]) =>
  points.filter((point, index, source) => {
    if (index === 0) {
      return true;
    }

    const previous = source[index - 1];
    return (
      Math.abs(previous.latitude - point.latitude) >= 0.000001 ||
      Math.abs(previous.longitude - point.longitude) >= 0.000001
    );
  });

export const mergeRouteSegment = (current: LatLngPoint[], segment: LatLngPoint[]) => {
  const cleanCurrent = dedupeRoutePoints(current);
  const cleanSegment = dedupeRoutePoints(segment);

  if (cleanSegment.length === 0) {
    return cleanCurrent;
  }
  if (cleanCurrent.length === 0) {
    return cleanSegment;
  }

  const last = cleanCurrent[cleanCurrent.length - 1];
  const first = cleanSegment[0];
  if (distanceBetweenRoutePointsKm(last, first) <= 0.003) {
    return dedupeRoutePoints([...cleanCurrent, ...cleanSegment.slice(1)]);
  }

  const currentSearchStart = Math.max(cleanCurrent.length - 16, 0);
  const segmentSearchEnd = Math.min(cleanSegment.length, 16);
  let bestOverlap:
    | {
        currentIndex: number;
        segmentIndex: number;
        distanceKm: number;
      }
    | null = null;

  for (let currentIndex = currentSearchStart; currentIndex < cleanCurrent.length; currentIndex += 1) {
    for (let segmentIndex = 0; segmentIndex < segmentSearchEnd; segmentIndex += 1) {
      const distanceKm = distanceBetweenRoutePointsKm(
        cleanCurrent[currentIndex],
        cleanSegment[segmentIndex],
      );
      if (distanceKm > 0.018) {
        continue;
      }

      if (!bestOverlap || distanceKm < bestOverlap.distanceKm) {
        bestOverlap = {
          currentIndex,
          segmentIndex,
          distanceKm,
        };
      }
    }
  }

  if (bestOverlap) {
    return dedupeRoutePoints([
      ...cleanCurrent.slice(0, bestOverlap.currentIndex + 1),
      ...cleanSegment.slice(bestOverlap.segmentIndex + 1),
    ]);
  }

  return dedupeRoutePoints([...cleanCurrent, ...cleanSegment]);
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
