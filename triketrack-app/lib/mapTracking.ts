export type LatLngPoint = { latitude: number; longitude: number };

export const OBRERO_GEOFENCE: LatLngPoint[] = [
  { latitude: 7.0832297, longitude: 125.624803 },
  { latitude: 7.076611, longitude: 125.617071 },
  { latitude: 7.078821, longitude: 125.6140047 },
  { latitude: 7.0817, longitude: 125.612905 },
  { latitude: 7.0835656, longitude: 125.612594 },
  { latitude: 7.0849408, longitude: 125.611754 },
  { latitude: 7.0868171, longitude: 125.613004 },
  { latitude: 7.09187, longitude: 125.6177977 },
];

export const dedupeSequentialPoints = (points: LatLngPoint[]) =>
  points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return (
      Math.abs(previous.latitude - point.latitude) >= 0.000001 ||
      Math.abs(previous.longitude - point.longitude) >= 0.000001
    );
  });

const toRad = (value: number) => (value * Math.PI) / 180;

export const distanceBetweenKm = (from: LatLngPoint, to: LatLngPoint) => {
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

export const distanceBetweenMeters = (from: LatLngPoint, to: LatLngPoint) =>
  distanceBetweenKm(from, to) * 1000;

export const isPointInsidePolygon = (point: LatLngPoint, polygon: LatLngPoint[]) => {
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

export const headingBetweenDeg = (from: LatLngPoint, to: LatLngPoint) => {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};

export const shortestAngleDelta = (fromDeg: number, toDeg: number) => {
  let delta = toDeg - fromDeg;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

export const interpolatePoint = (from: LatLngPoint, to: LatLngPoint, progress: number) => ({
  latitude: from.latitude + (to.latitude - from.latitude) * progress,
  longitude: from.longitude + (to.longitude - from.longitude) * progress,
});

export const polylineDistanceKm = (points: LatLngPoint[]) => {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceBetweenKm(points[index - 1], points[index]);
  }

  return total;
};

export const getMotionDurationMs = ({
  from,
  to,
  speedMetersPerSecond,
  minDurationMs = 280,
  maxDurationMs = 900,
}: {
  from: LatLngPoint | null;
  to: LatLngPoint;
  speedMetersPerSecond?: number | null;
  minDurationMs?: number;
  maxDurationMs?: number;
}) => {
  if (!from) {
    return minDurationMs;
  }

  const distanceMeters = distanceBetweenMeters(from, to);
  const effectiveSpeed = Math.max(speedMetersPerSecond ?? 6, 3);
  const durationMs = (distanceMeters / effectiveSpeed) * 1000;
  return Math.max(minDurationMs, Math.min(durationMs, maxDurationMs));
};
