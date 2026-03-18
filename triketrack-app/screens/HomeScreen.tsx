import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import MapView, {
  AnimatedRegion,
  MarkerAnimated,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTab, HomeNavigationCard } from '../components/navigation/HomeNavigationCard';
import { OutsideGeofenceModal } from '../components/modals';
import { Avatar } from '../components/ui';

type HomeScreenProps = {
  onLogout?: () => void;
  onNavigate?: (tab: BottomTab) => void;
  isTripScreen: boolean;
  isDriverOnline: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onBackToHome: () => void;
  locationEnabled: boolean;
  onTripComplete: (payload: {
    fare: number;
    distanceKm: number;
    durationSeconds: number;
    routePath: Array<{ latitude: number; longitude: number }>;
    endLocation: { latitude: number; longitude: number } | null;
  }) => void;
  onTripStart?: (payload: { startLocation: { latitude: number; longitude: number } | null }) => void;
  onGeofenceExit?: (payload: { location: { latitude: number; longitude: number } | null }) => void;
  totalEarnings: number;
  totalTrips: number;
  totalDistanceKm: number;
  totalMinutes: number;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  mapTypeOption: MapTypeOption;
  onChangeMapTypeOption: (value: MapTypeOption) => void;
  styles: Record<string, any>;
};

const OBRERO_GEOFENCE = [
  { latitude: 7.0849408, longitude: 125.6121403 }, // 1) McDonald's Davao Bajada (Lacson St)
  { latitude: 7.0861485, longitude: 125.6130254 }, // 2) San Roque Central Elementary School
  { latitude: 7.09253, longitude: 125.61713 }, // 3) Queensland Hotel Davao (Dacudao area)
  { latitude: 7.0832297, longitude: 125.6242034 }, // 4) AUB Agdao
  { latitude: 7.0771506, longitude: 125.6170807 }, // 5) Sta. Ana Shrine Parish Church
  { latitude: 7.0776251, longitude: 125.6141467 }, // 6) Gaisano Mall of Davao
  { latitude: 7.0835656, longitude: 125.6126754 }, // 7) Bajada Suites
];

const NORMAL_CAMERA = {
  zoom: 14,
  pitch: 0,
  heading: 0,
} as const;
const MIN_TRACK_MOVE_KM = 0.01;
const MAX_ACCEPTED_ACCURACY_METERS = 20;
const MAX_ACCEPTED_SPEED_KMH = 95;
const MAX_STATIONARY_SPEED_KMH = 3;
const MIN_SNAPPED_MOVE_KM = 0.008;
const ROAD_MATCH_BATCH_SIZE = 8;
const GOOGLE_MAPS_ROADS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ROADS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
type LatLngPoint = { latitude: number; longitude: number };

const isPointInsidePolygon = (
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

const formatPeso = (amount: number) =>
  `\u20B1${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const mergeRouteSegment = (current: LatLngPoint[], segment: LatLngPoint[]) => {
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

const polylineDistanceKm = (points: LatLngPoint[]) => {
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

const fetchMatchedRoadPath = async (points: LatLngPoint[]) => {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return [points[0]];
  }

  if (GOOGLE_MAPS_ROADS_API_KEY) {
    const path = points.map((point) => `${point.latitude},${point.longitude}`).join('|');
    const url =
      `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=${encodeURIComponent(path)}` +
      `&key=${GOOGLE_MAPS_ROADS_API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as {
        snappedPoints?: Array<{ location?: { latitude?: number; longitude?: number } }>;
      };
      const snappedPoints = json.snappedPoints
        ?.map((point) => {
          const latitude = point.location?.latitude;
          const longitude = point.location?.longitude;
          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return null;
          }
          return { latitude, longitude };
        })
        .filter((point): point is LatLngPoint => point !== null);

      return snappedPoints && snappedPoints.length > 0 ? snappedPoints : null;
    } catch {
      return null;
    }
  }

  const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url =
    `https://router.project-osrm.org/match/v1/driving/${coordinates}` +
    `?overview=full&geometries=geojson&gaps=ignore&tidy=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      matchings?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    const matchedCoordinates = json.matchings?.flatMap((matching) => matching.geometry?.coordinates ?? []);
    if (!matchedCoordinates || matchedCoordinates.length === 0) {
      return null;
    }

    return matchedCoordinates
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => ({
        latitude: point[1],
        longitude: point[0],
      }));
  } catch {
    return null;
  }
};

const fetchNearestRoadPoint = async (point: LatLngPoint) => {
  if (GOOGLE_MAPS_ROADS_API_KEY) {
    const url =
      `https://roads.googleapis.com/v1/nearestRoads?points=${point.latitude},${point.longitude}` +
      `&key=${GOOGLE_MAPS_ROADS_API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const json = (await response.json()) as {
        snappedPoints?: Array<{ location?: { latitude?: number; longitude?: number } }>;
      };
      const location = json.snappedPoints?.[0]?.location;
      if (typeof location?.latitude !== 'number' || typeof location?.longitude !== 'number') {
        return null;
      }

      return {
        latitude: location.latitude,
        longitude: location.longitude,
      };
    } catch {
      return null;
    }
  }

  const url =
    `https://router.project-osrm.org/nearest/v1/driving/` +
    `${point.longitude},${point.latitude}?number=1`;

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

const DARK_MAP_STYLE = [
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

export function HomeScreen({
  onLogout,
  onNavigate,
  isTripScreen,
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  onBackToHome,
  locationEnabled,
  onTripComplete,
  onTripStart,
  onGeofenceExit,
  totalEarnings,
  totalTrips,
  totalDistanceKm,
  totalMinutes,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  mapTypeOption,
  onChangeMapTypeOption,
  styles,
}: HomeScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const [hasCentered, setHasCentered] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [farePickerOpen, setFarePickerOpen] = useState(false);
  const [showOutsideGeofenceModal, setShowOutsideGeofenceModal] = useState(false);
  const [selectedFare, setSelectedFare] = useState(10);
  const [isTripStarted, setIsTripStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [lastTrackPoint, setLastTrackPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isInsideGeofence, setIsInsideGeofence] = useState(true);
  const [headingDeg, setHeadingDeg] = useState(0);
  const isTripStartedRef = useRef(isTripStarted);
  const hasCenteredRef = useRef(hasCentered);
  const lastTrackPointRef = useRef(lastTrackPoint);
  const lastRawTrackPointRef = useRef<LatLngPoint | null>(null);
  const pendingRawPointsRef = useRef<LatLngPoint[]>([]);
  const routePointsRef = useRef<Array<LatLngPoint>>([]);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const roadSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const markerSnapQueueRef = useRef<Promise<void>>(Promise.resolve());
  const snappedCoordsRef = useRef<LatLngPoint | null>(null);
  const markerInitializedRef = useRef(false);
  const hasShownExitAlert = useRef(false);
  const headingAnim = useRef(new Animated.Value(0)).current;
  const headingAnimValue = useRef(0);
  const liveHeadingRef = useRef<number | null>(null);
  const lastTrackTimestampMsRef = useRef<number | null>(null);
  const fareOptions = [10, 20, 30, 40, 50, 60, 70];
  const animatedMarkerCoordinate = useRef(
    new AnimatedRegion({
      latitude: OBRERO_GEOFENCE[0].latitude,
      longitude: OBRERO_GEOFENCE[0].longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  const isDarkMap = mapTypeOption === 'dark';
  const activeMapType: 'standard' | 'satellite' = mapTypeOption === 'satellite' ? 'satellite' : 'standard';

  const mapTypeLabel = (value: MapTypeOption) => {
    if (value === 'satellite') return 'Satellite';
    if (value === 'dark') return 'Dark';
    return 'Default';
  };

  const nextMapTypeOption = (value: MapTypeOption) => {
    const idx = MAP_TYPE_OPTIONS.indexOf(value);
    const nextIdx = idx >= 0 ? (idx + 1) % MAP_TYPE_OPTIONS.length : 0;
    return MAP_TYPE_OPTIONS[nextIdx] ?? 'default';
  };
  const geofenceStrokeColor = isDarkMap ? '#A3E635' : '#5A67D8';
  const geofenceFillColor = isDarkMap ? 'rgba(163,230,53,0.10)' : 'rgba(90,103,216,0.04)';

  useEffect(() => {
    isTripStartedRef.current = isTripStarted;
  }, [isTripStarted]);

  useEffect(() => {
    hasCenteredRef.current = hasCentered;
  }, [hasCentered]);

  useEffect(() => {
    lastTrackPointRef.current = lastTrackPoint;
  }, [lastTrackPoint]);

  useEffect(() => {
    routePointsRef.current = routePoints;
  }, [routePoints]);

  useEffect(() => {
    snappedCoordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    if (!coords) {
      markerInitializedRef.current = false;
      return;
    }

    const nextCoordinate = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };

    if (!markerInitializedRef.current) {
      markerInitializedRef.current = true;
      animatedMarkerCoordinate.setValue({
        ...nextCoordinate,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      return;
    }

    if (Platform.OS === 'android' && markerRef.current?.animateMarkerToCoordinate) {
      markerRef.current.animateMarkerToCoordinate(nextCoordinate, 650);
      return;
    }

    animatedMarkerCoordinate
      .timing({
        ...nextCoordinate,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: 650,
        useNativeDriver: false,
      } as any)
      .start();
  }, [animatedMarkerCoordinate, coords]);

  useEffect(() => {
    if (!isDriverOnline || !locationEnabled) {
      setCoords(null);
    }
  }, [isDriverOnline, locationEnabled]);

  const fallbackCenter = {
    latitude: 7.0849408,
    longitude: 125.6121403,
  };

  useEffect(() => {
    if (!isTripStarted) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isTripStarted]);

  useEffect(() => {
    if (!isTripScreen) {
      setIsTripStarted(false);
      setElapsedSeconds(0);
      setDistanceKm(0);
      setSpeedKmh(0);
      setLastTrackPoint(null);
      setRoutePoints([]);
      lastTrackPointRef.current = null;
      lastRawTrackPointRef.current = null;
      pendingRawPointsRef.current = [];
      routePointsRef.current = [];
      roadSnapQueueRef.current = Promise.resolve();
      markerSnapQueueRef.current = Promise.resolve();
      setHeadingDeg(0);
      headingAnimValue.current = 0;
      headingAnim.setValue(0);
      setFarePickerOpen(false);
      lastTrackTimestampMsRef.current = null;
      setHasCentered(false);
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(OBRERO_GEOFENCE, {
          edgePadding: { top: 70, right: 50, bottom: 170, left: 50 },
          animated: true,
        });
      }
    }
  }, [isTripScreen]);

  useEffect(() => {
    if (!isTripScreen || !mapRef.current || isTripStarted) {
      return;
    }
    // Default Route screen view: show full geofence without requiring manual zoom out.
    mapRef.current.fitToCoordinates(OBRERO_GEOFENCE, {
      edgePadding: { top: 110, right: 52, bottom: 260, left: 52 },
      animated: true,
    });
    setHasCentered(true);
  }, [isTripScreen, isTripStarted]);

  useEffect(() => {
    const nextHeading = ((headingDeg % 360) + 360) % 360;
    const current = headingAnimValue.current;
    let delta = nextHeading - current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const target = current + delta;
    headingAnimValue.current = target;
    Animated.timing(headingAnim, {
      toValue: target,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headingDeg, headingAnim]);

  const toRad = (value: number) => (value * Math.PI) / 180;
  const distanceBetweenKm = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
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
  const headingBetweenDeg = (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    const lat1 = toRad(from.latitude);
    const lat2 = toRad(to.latitude);
    const dLon = toRad(to.longitude - from.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };
  const shortestAngleDiff = (fromDeg: number, toDeg: number) => {
    let diff = (((toDeg - fromDeg) % 360) + 360) % 360;
    if (diff > 180) diff -= 360;
    return Math.abs(diff);
  };

  const appendRouteSegment = (segment: LatLngPoint[]) => {
    setRoutePoints((prev) => {
      const merged = mergeRouteSegment(prev, segment);
      routePointsRef.current = merged;
      return merged;
    });
  };

  const updateSnappedMarker = (rawPoint: LatLngPoint) => {
    markerSnapQueueRef.current = markerSnapQueueRef.current
      .then(async () => {
        const snappedPoint = (await fetchNearestRoadPoint(rawPoint)) ?? rawPoint;
        setCoords((prev) => {
          if (
            prev &&
            distanceBetweenKm(prev, snappedPoint) < 0.002 &&
            !isTripStartedRef.current
          ) {
            return prev;
          }
          snappedCoordsRef.current = snappedPoint;
          return snappedPoint;
        });
      })
      .catch(() => {
        setCoords(rawPoint);
        snappedCoordsRef.current = rawPoint;
      });
  };

  const flushBufferedRoadPoints = (force = false) => {
    if (pendingRawPointsRef.current.length === 0) {
      return;
    }

    if (!force && pendingRawPointsRef.current.length < 1) {
      return;
    }

    const anchorPoint = lastTrackPointRef.current ?? snappedCoordsRef.current;
    const batchPoints = pendingRawPointsRef.current.splice(
      0,
      Math.min(pendingRawPointsRef.current.length, ROAD_MATCH_BATCH_SIZE),
    );

    roadSnapQueueRef.current = roadSnapQueueRef.current
      .then(async () => {
        const inputPoints = anchorPoint ? [anchorPoint, ...batchPoints] : batchPoints;
        const matchedPath = await fetchMatchedRoadPath(inputPoints);
        const fallbackPoint = batchPoints[batchPoints.length - 1] ?? anchorPoint;
        const segment =
          matchedPath && matchedPath.length > 0
            ? matchedPath
            : fallbackPoint
              ? [fallbackPoint]
              : [];

        if (segment.length === 0) {
          return;
        }

        const latestPoint = segment[segment.length - 1];
        const previousPoint = anchorPoint ?? segment[0];
        const segmentDistanceKm = polylineDistanceKm(segment);

        appendRouteSegment(segment);
        lastTrackPointRef.current = latestPoint;
        setLastTrackPoint(latestPoint);
        snappedCoordsRef.current = latestPoint;
        setCoords(latestPoint);

        if (segmentDistanceKm >= MIN_SNAPPED_MOVE_KM) {
          const movementHeading = headingBetweenDeg(previousPoint, latestPoint);
          const lastLiveHeading = liveHeadingRef.current;
          const shouldUpdateHeading =
            lastLiveHeading === null || shortestAngleDiff(lastLiveHeading, movementHeading) >= 4;
          if (shouldUpdateHeading) {
            liveHeadingRef.current = movementHeading;
            setHeadingDeg(movementHeading);
          }

          setDistanceKm((prev) => prev + segmentDistanceKm);
          if (mapRef.current) {
            mapRef.current.animateCamera(
              {
                center: latestPoint,
                zoom: 18,
                heading: 0,
                pitch: 0,
              },
              { duration: 650 },
            );
          }
        }

        if (pendingRawPointsRef.current.length > 0) {
          flushBufferedRoadPoints(true);
        }
      })
      .catch(() => {
        const fallbackPoint = batchPoints[batchPoints.length - 1];
        if (!fallbackPoint) {
          return;
        }

        appendRouteSegment([fallbackPoint]);
        lastTrackPointRef.current = fallbackPoint;
        setLastTrackPoint(fallbackPoint);
        snappedCoordsRef.current = fallbackPoint;
        setCoords(fallbackPoint);
      });
  };

  const applyLocationUpdate = (coordinate: {
    latitude: number;
    longitude: number;
    heading?: number | null;
    accuracy?: number | null;
    speed?: number | null;
  }) => {
    if (!isDriverOnline || !locationEnabled) {
      return;
    }

    const next = { latitude: coordinate.latitude, longitude: coordinate.longitude };
    if (!isTripStartedRef.current) {
      updateSnappedMarker(next);
    }

    const insideBoundary = isPointInsidePolygon(next, OBRERO_GEOFENCE);
    setIsInsideGeofence(insideBoundary);
    const gpsAccuracyMeters =
      typeof coordinate.accuracy === 'number' ? coordinate.accuracy : null;
    const speedFromGpsKmh =
      typeof coordinate.speed === 'number' && coordinate.speed >= 0
        ? coordinate.speed * 3.6
        : null;

    if (isTripStartedRef.current) {
      const prevRawPoint = lastRawTrackPointRef.current;
      if (!prevRawPoint) {
        lastRawTrackPointRef.current = next;
        pendingRawPointsRef.current = [next];
        lastTrackTimestampMsRef.current = Date.now();
        flushBufferedRoadPoints(true);
      } else {
        if (
          gpsAccuracyMeters !== null &&
          gpsAccuracyMeters > MAX_ACCEPTED_ACCURACY_METERS
        ) {
          return;
        }

        const nowMs = Date.now();
        const lastMs = lastTrackTimestampMsRef.current ?? nowMs;
        const deltaSec = Math.max((nowMs - lastMs) / 1000, 0.001);
        const movedKm = distanceBetweenKm(prevRawPoint, next);
        const computedSpeedKmh = movedKm / (deltaSec / 3600);
        const effectiveSpeedKmh =
          speedFromGpsKmh !== null && Number.isFinite(speedFromGpsKmh)
            ? speedFromGpsKmh
            : computedSpeedKmh;

        if (effectiveSpeedKmh > MAX_ACCEPTED_SPEED_KMH) {
          return;
        }

        if (
          movedKm < MIN_TRACK_MOVE_KM ||
          effectiveSpeedKmh <= MAX_STATIONARY_SPEED_KMH
        ) {
          setSpeedKmh(0);
          return;
        }

        setSpeedKmh(effectiveSpeedKmh);
        lastRawTrackPointRef.current = next;
        lastTrackTimestampMsRef.current = nowMs;
        pendingRawPointsRef.current.push(next);
        flushBufferedRoadPoints();
      }
    }

    if (isTripStartedRef.current && !insideBoundary && !hasShownExitAlert.current) {
      hasShownExitAlert.current = true;
      Alert.alert('Geofence Alert', 'You are outside the Obrero geofence boundary.');
      onGeofenceExit?.({
        location: { latitude: next.latitude, longitude: next.longitude },
      });
    }
    if (insideBoundary) {
      hasShownExitAlert.current = false;
    }

    if (isTripScreen && isTripStartedRef.current && !hasCenteredRef.current && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: next.latitude,
          longitude: next.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        500,
      );
      hasCenteredRef.current = true;
      setHasCentered(true);
    }
  };

  useEffect(() => {
    if (!isTripScreen || !isDriverOnline || !locationEnabled) {
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (loc) => {
            if (cancelled) return;
            applyLocationUpdate({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              heading: loc.coords.heading,
              accuracy: loc.coords.accuracy,
              speed: loc.coords.speed,
            });
          },
        );

        if (cancelled) {
          sub.remove();
          return;
        }

        locationWatchRef.current?.remove();
        locationWatchRef.current = sub;
      } catch {
        // Permission/availability is handled in the parent flow.
      }
    })();

    return () => {
      cancelled = true;
      locationWatchRef.current?.remove();
      locationWatchRef.current = null;
    };
  }, [isTripScreen, isDriverOnline, locationEnabled]);

  const minutesText = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const kmText = distanceKm.toFixed(2);

  const handleTripButtonPress = () => {
    if (!isTripStarted) {
      setIsTripStarted(true);
      onTripStart?.({
        startLocation: coords ? { latitude: coords.latitude, longitude: coords.longitude } : null,
      });
      setElapsedSeconds(0);
      setDistanceKm(0);
      setSpeedKmh(0);
      // Use the first actual GPS fix as baseline to avoid a big initial jump.
      setLastTrackPoint(coords);
      lastTrackPointRef.current = coords;
      lastRawTrackPointRef.current = null;
      pendingRawPointsRef.current = [];
      setRoutePoints(coords ? [coords] : []);
      routePointsRef.current = coords ? [coords] : [];
      snappedCoordsRef.current = coords;
      roadSnapQueueRef.current = Promise.resolve();
      markerSnapQueueRef.current = Promise.resolve();
      lastTrackTimestampMsRef.current = Date.now();
      if (coords && mapRef.current) {
        mapRef.current.animateCamera(
          {
            center: coords,
            zoom: 18,
            heading: 0,
            pitch: 0,
          },
          { duration: 850 },
        );
      }
      return;
    }

    const completedRoutePath =
      routePointsRef.current.length > 0
        ? routePointsRef.current
        : coords
          ? [{ latitude: coords.latitude, longitude: coords.longitude }]
          : [];
    const endLocation =
      completedRoutePath.length > 0 ? completedRoutePath[completedRoutePath.length - 1] : null;

    setIsTripStarted(false);
    setLastTrackPoint(null);
    lastTrackPointRef.current = null;
    lastRawTrackPointRef.current = null;
    pendingRawPointsRef.current = [];
    setRoutePoints([]);
    routePointsRef.current = [];
    snappedCoordsRef.current = coords;
    roadSnapQueueRef.current = Promise.resolve();
    markerSnapQueueRef.current = Promise.resolve();
    setElapsedSeconds(0);
    setDistanceKm(0);
    setSpeedKmh(0);
    setHeadingDeg(0);
    headingAnimValue.current = 0;
    headingAnim.setValue(0);
    lastTrackTimestampMsRef.current = null;
    if (mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: coords ?? fallbackCenter,
          zoom: NORMAL_CAMERA.zoom,
          pitch: NORMAL_CAMERA.pitch,
          heading: NORMAL_CAMERA.heading,
        },
        { duration: 700 },
      );
    }
    onTripComplete({
      fare: selectedFare,
      distanceKm,
      durationSeconds: elapsedSeconds,
      routePath: completedRoutePath,
      endLocation,
    });
  };

  const distanceSummaryKm = totalDistanceKm.toFixed(2);
  const handleAdjustZoom = async (delta: number) => {
    if (!mapRef.current) {
      return;
    }
    try {
      const camera = await mapRef.current.getCamera();
      const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : NORMAL_CAMERA.zoom;
      const nextZoom = Math.max(10, Math.min(20, currentZoom + delta));
      mapRef.current.animateCamera({ ...camera, zoom: nextZoom }, { duration: 220 });
    } catch {
      // Ignore camera read errors.
    }
  };
  const handleTrackLocation = () => {
    if (!mapRef.current || !coords) {
      return;
    }
    mapRef.current.animateCamera(
      {
        center: coords,
        zoom: isTripStarted ? 18 : 15,
        heading: 0,
        pitch: 0,
      },
      { duration: 450 },
    );
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.homeContentArea}>
        <MapView
          ref={(ref) => {
            mapRef.current = ref;
          }}
          style={localStyles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          mapType={activeMapType}
          customMapStyle={isDarkMap ? (DARK_MAP_STYLE as any) : []}
          initialRegion={{
            latitude: fallbackCenter.latitude,
            longitude: fallbackCenter.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          showsUserLocation={false}
          followsUserLocation={false}
          showsMyLocationButton={false}
        >
          <Polygon
            coordinates={OBRERO_GEOFENCE}
            strokeColor={geofenceStrokeColor}
            fillColor={geofenceFillColor}
            strokeWidth={2}
          />
          {isTripScreen && routePoints.length > 1 ? (
            <Polyline
              coordinates={routePoints}
              strokeColor="#2D7DF6"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {coords ? (
            <MarkerAnimated
              ref={markerRef}
              coordinate={animatedMarkerCoordinate as any}
              title="Your Location"
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
            >
              <View style={localStyles.navMarkerWrap}>
                <View style={localStyles.navAvatarRingOuter}>
                  <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.navMarkerAvatar} />
                </View>
              </View>
            </MarkerAnimated>
          ) : null}
        </MapView>

        <Pressable
          style={[
            localStyles.mapTypeToggle,
            isTripScreen && localStyles.mapTypeToggleTrip,
            !isTripScreen && !isDriverOnline && localStyles.mapTypeToggleOffline,
          ]}
          onPress={() => onChangeMapTypeOption(nextMapTypeOption(mapTypeOption))}
        >
          <Feather
            name={mapTypeOption === 'dark' ? 'moon' : mapTypeOption === 'satellite' ? 'globe' : 'map'}
            size={16}
            color="#0F172A"
          />
          <Text style={localStyles.mapTypeToggleText}>
            {mapTypeLabel(mapTypeOption)}
          </Text>
        </Pressable>

        {isTripScreen && locationEnabled && isDriverOnline ? (
          <View style={localStyles.mapControls}>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(1)}>
              <Feather name="plus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={() => handleAdjustZoom(-1)}>
              <Feather name="minus" size={18} color="#0F172A" />
            </Pressable>
            <Pressable style={localStyles.mapControlButton} onPress={handleTrackLocation}>
              <Feather name="crosshair" size={17} color="#0F172A" />
            </Pressable>
          </View>
        ) : null}

        {!isTripScreen ? (
          <>
            <View style={localStyles.statusBarCard}>
              <Text style={localStyles.statusTitle}>{isDriverOnline ? 'Online' : 'Offline'}</Text>
              <View style={localStyles.statusActions}>
                <Pressable
                  style={localStyles.statusIconButton}
                  onPress={() => Alert.alert('Notifications', 'No notifications yet.')}
                >
                  <Feather name="bell" size={16} color="#0F172A" />
                </Pressable>

                <Pressable
                  style={[
                    localStyles.statusToggle,
                    isDriverOnline ? localStyles.statusToggleOn : localStyles.statusToggleOff,
                  ]}
                  onPress={() => {
                    if (isDriverOnline) {
                      onGoOffline();
                      return;
                    }
                    onGoOnline();
                  }}
                >
                  <View
                    style={[
                      localStyles.statusToggleThumb,
                      isDriverOnline
                        ? localStyles.statusToggleThumbOn
                        : localStyles.statusToggleThumbOff,
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            {!isDriverOnline ? (
              <View style={localStyles.offlineBanner}>
                <Feather name="cloud-off" size={14} color="#FFFFFF" />
                <Text style={localStyles.offlineBannerText}>
                  You are offline. Go online to start trips.
                </Text>
              </View>
            ) : null}

            <View style={[localStyles.dashboardSheet, { bottom: 100 + (insets.bottom || 0) }]}>
              <View style={localStyles.sheetHeaderRow}>
                <View style={localStyles.avatarChip}>
                  <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatarImage} />
                </View>
                <View style={localStyles.driverMeta}>
                  <Text style={localStyles.driverName} numberOfLines={1}>
                    {profileName}
                  </Text>
                  <Text style={localStyles.driverSub} numberOfLines={1}>
                    {profileDriverCode} {'\u2022'} {profilePlateNumber}
                  </Text>
                </View>
                <Text style={localStyles.todayText}>Today</Text>
              </View>

              <View style={localStyles.statsCard}>
                <View style={localStyles.metricRow}>
                  <View style={localStyles.metricCard}>
                    <View style={localStyles.metricPesoIconWrap}>
                      <Text style={localStyles.metricPesoIconText}>{'\u20B1'}</Text>
                    </View>
                    <Text style={localStyles.metricLabel}>Total earned</Text>
                    <Text style={localStyles.metricValue}>{formatPeso(totalEarnings)}</Text>
                  </View>
                  <View style={localStyles.metricCard}>
                    <Feather name="file-text" size={18} color="#57c7a8" />
                    <Text style={localStyles.metricLabel}>Total trips</Text>
                    <Text style={localStyles.metricValue}>{totalTrips}</Text>
                  </View>
                  <View style={localStyles.metricCard}>
                    <Feather name="map-pin" size={18} color="#57c7a8" />
                    <Text style={localStyles.metricLabel}>Total distance</Text>
                    <Text style={localStyles.metricValue}>{distanceSummaryKm} km</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : (
          <>
            <Pressable style={styles.routeBackButton} onPress={onBackToHome}>
              <Feather name="chevron-left" size={20} color="#030318" />
            </Pressable>

            <View style={[styles.routeTripPanel, { bottom: 104 + (insets.bottom || 0) }]}>
              <View style={styles.routeGeofenceStatusRow}>
                <Text style={styles.routeGeofenceStatusLabel}>Obrero Geofence</Text>
                <View
                  style={[
                    styles.routeGeofencePill,
                    isInsideGeofence ? styles.routeGeofencePillInside : styles.routeGeofencePillOutside,
                  ]}
                >
                  <Text
                    style={[
                      styles.routeGeofencePillText,
                      isInsideGeofence
                        ? styles.routeGeofencePillTextInside
                        : styles.routeGeofencePillTextOutside,
                    ]}
                  >
                    {isInsideGeofence ? 'Inside' : 'Outside'}
                  </Text>
                </View>
              </View>

              <View style={[styles.routeTripStatsRow, localStyles.tripStatsRow]}>
                <View style={[styles.routeTripStatPill, localStyles.tripStatPill]}>
                  <Text style={styles.routeTripStatValue}>{minutesText}</Text>
                  <Text style={styles.routeTripStatLabel}>mins</Text>
                </View>
                <View style={[styles.routeTripStatPill, localStyles.tripStatPill]}>
                  <Text style={styles.routeTripStatValue}>{kmText}</Text>
                  <Text style={styles.routeTripStatLabel}>km</Text>
                </View>
                <Pressable
                  style={[styles.routeTripStatPill, localStyles.tripStatPill]}
                  onPress={() => setFarePickerOpen((prev) => !prev)}
                >
                  <Text style={styles.routeTripStatValue}>{'\u20B1'}{selectedFare}</Text>
                  <Text style={styles.routeTripStatLabel}>fare</Text>
                </Pressable>
              </View>

              <View style={localStyles.navigationMetaRow}>
                <Text style={localStyles.navigationMetaText}>Speed {speedKmh.toFixed(1)} km/h</Text>
                <Text style={localStyles.navigationMetaText}>Auto-reroute on</Text>
              </View>

              {farePickerOpen ? (
                <View style={styles.routeFareList}>
                  {fareOptions.map((value) => (
                    <Pressable
                      key={value}
                      style={[
                        styles.routeFareOption,
                        value === selectedFare && styles.routeFareOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedFare(value);
                        setFarePickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.routeFareOptionText,
                          value === selectedFare && styles.routeFareOptionTextActive,
                        ]}
                      >
                        {'\u20B1'}{value}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Pressable style={styles.routeStartTripButton} onPress={handleTripButtonPress}>
                <Text style={styles.routeStartTripText}>{isTripStarted ? 'End Trip' : 'Start Trip'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <HomeNavigationCard
        activeTab="home"
        onNavigate={onNavigate}
        showCenterRoute={!isTripScreen}
        styles={styles}
      />

      <OutsideGeofenceModal
        visible={showOutsideGeofenceModal}
        onRequestClose={() => setShowOutsideGeofenceModal(false)}
        onAcknowledge={() => setShowOutsideGeofenceModal(false)}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  statusBarCard: {
    position: 'absolute',
    top: 8,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
  },
  statusTitle: {
    fontSize: 16,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  statusActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    backgroundColor: '#FFFFFF',
  },
  statusToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 3,
    justifyContent: 'center',
  },
  statusToggleOn: {
    backgroundColor: '#57c7a8',
  },
  statusToggleOff: {
    backgroundColor: '#CBD5E1',
  },
  statusToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  statusToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  statusToggleThumbOff: {
    alignSelf: 'flex-start',
  },
  offlineBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 58,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#57c7a8',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#57c7a8',
  },
  offlineBannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 15,
    fontFamily: 'CircularStdMedium500',
  },
  dashboardSheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 118,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E6ECF2',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#57c7a8',
    backgroundColor: '#FFFFFF',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  driverMeta: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },
  driverName: {
    fontSize: 15,
    lineHeight: 18,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  driverSub: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 15,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  todayText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#334155',
    fontFamily: 'CircularStdMedium500',
  },
  statsCard: {
    marginTop: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricCard: {
    alignItems: 'center',
    width: '31%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  metricPesoIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E8FBF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricPesoIconText: {
    color: '#57c7a8',
    fontSize: 14,
    lineHeight: 16,
    fontFamily: 'CircularStdMedium500',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  metricLabel: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 13,
    color: '#64748B',
    fontFamily: 'CircularStdMedium500',
    textAlign: 'center',
  },
  tripStatsRow: {
    justifyContent: 'space-between',
    gap: 8,
  },
  tripStatPill: {
    flex: 0,
    width: '31%',
    marginHorizontal: 0,
  },
  navigationMetaRow: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navigationMetaText: {
    fontSize: 11,
    lineHeight: 13,
    color: '#475569',
    fontFamily: 'CircularStdMedium500',
  },
  mapTypeToggle: {
    position: 'absolute',
    top: 58,
    right: 14,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapTypeToggleTrip: {
    top: 66,
  },
  mapTypeToggleOffline: {
    top: 108,
  },
  mapTypeToggleText: {
    fontSize: 12,
    lineHeight: 14,
    color: '#0F172A',
    fontFamily: 'CircularStdMedium500',
  },
  mapControls: {
    position: 'absolute',
    right: 14,
    top: 114,
    gap: 8,
    zIndex: 10,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  navMarkerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarRingOuter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    borderColor: '#57c7a8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  navMarkerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
});


