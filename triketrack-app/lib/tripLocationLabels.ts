import * as Location from 'expo-location';
import type { TripCoordinate } from './tripTransactions';

export type TripEndpointRole = 'pickup' | 'destination';

export type TripDisplayLocationLabels = {
  startDisplayName: string;
  endDisplayName: string;
  startCoordinate: TripCoordinate | null;
  endCoordinate: TripCoordinate | null;
};

const geocodeCache = new Map<string, string>();
const ENDPOINT_PLACE_API_BASE_URL =
  process.env.EXPO_PUBLIC_BUILDING_POLYGON_API_BASE_URL?.trim() ??
  'https://overpass-api.de/api/interpreter';
const ENDPOINT_PLACE_SEARCH_RADIUS_METERS = 85;
const ENDPOINT_PLACE_QUERY_TIMEOUT_SECONDS = 8;
const ENDPOINT_PLACE_FETCH_TIMEOUT_MS = 4200;
const METERS_PER_LAT_DEGREE = 111320;

type NearbyEndpointPlace = {
  label: string;
  distanceMeters: number;
  rank: number;
};

const isValidCoordinate = (value: unknown): value is TripCoordinate =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { latitude?: unknown }).latitude === 'number' &&
  Number.isFinite((value as { latitude: number }).latitude) &&
  typeof (value as { longitude?: unknown }).longitude === 'number' &&
  Number.isFinite((value as { longitude: number }).longitude);

const cacheKeyForCoordinate = (role: TripEndpointRole, point: TripCoordinate) =>
  `${role}:${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

const appendOverpassQueryData = (baseUrl: string, query: string) => {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}data=${encodeURIComponent(query)}`;
};

const distanceMetersBetween = (from: TripCoordinate, to: TripCoordinate) => {
  const lonScale = METERS_PER_LAT_DEGREE * Math.cos((from.latitude * Math.PI) / 180);
  return Math.hypot(
    (to.latitude - from.latitude) * METERS_PER_LAT_DEGREE,
    (to.longitude - from.longitude) * Math.max(lonScale, 0.000001),
  );
};

const fetchWithTimeout = async (url: string) => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('endpoint-place-timeout')), ENDPOINT_PLACE_FETCH_TIMEOUT_MS);
  });
  return Promise.race([fetch(url), timeoutPromise]);
};

export const getUnknownTripEndpointLabel = (role: TripEndpointRole) =>
  role === 'pickup' ? 'Unknown pickup point' : 'Unknown destination';

const formatCoordinateFallbackLabel = (point: TripCoordinate, role: TripEndpointRole) => {
  const label = role === 'pickup' ? 'Pickup' : 'Destination';
  return `${label} ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
};

export const chooseBestTripEndpointCoordinate = ({
  matchedPoint,
  routePoint,
  filteredPoint,
}: {
  matchedPoint?: TripCoordinate | null;
  routePoint?: TripCoordinate | null;
  filteredPoint?: TripCoordinate | null;
}) => {
  if (isValidCoordinate(matchedPoint)) {
    return matchedPoint;
  }
  if (isValidCoordinate(routePoint)) {
    return routePoint;
  }
  return isValidCoordinate(filteredPoint) ? filteredPoint : null;
};

const normalizeLabelPart = (value?: string | null) => value?.trim() ?? '';

const joinDistinctLabelParts = (parts: Array<string | null | undefined>) => {
  const cleanParts = parts
    .map(normalizeLabelPart)
    .filter((part) => part.length > 0)
    .filter((part, index, source) => source.indexOf(part) === index);
  return cleanParts.join(', ');
};

const formatEndpointPlaceLabel = (tags: Record<string, string>) => {
  const name = normalizeLabelPart(tags.name);
  const houseNumber = normalizeLabelPart(tags['addr:housenumber']);
  const street = normalizeLabelPart(tags['addr:street']);
  const amenity = normalizeLabelPart(tags.amenity);
  const shop = normalizeLabelPart(tags.shop);
  const office = normalizeLabelPart(tags.office);
  const tourism = normalizeLabelPart(tags.tourism);
  const building = normalizeLabelPart(tags.building);

  if (name && street) {
    return joinDistinctLabelParts([name, street]);
  }
  if (name) {
    return name;
  }
  if (houseNumber && street) {
    return `${houseNumber} ${street}`;
  }
  if (street && building && building !== 'yes') {
    return joinDistinctLabelParts([`${building} building`, street]);
  }
  if (street) {
    return street;
  }
  if (amenity) {
    return `${amenity.replace(/_/g, ' ')} nearby`;
  }
  if (shop) {
    return `${shop.replace(/_/g, ' ')} nearby`;
  }
  if (office) {
    return `${office.replace(/_/g, ' ')} nearby`;
  }
  if (tourism) {
    return `${tourism.replace(/_/g, ' ')} nearby`;
  }
  if (building === 'house' || building === 'residential' || building === 'apartments') {
    return 'Nearby home';
  }
  if (building) {
    return 'Nearby building';
  }
  return '';
};

const rankEndpointPlace = (tags: Record<string, string>) => {
  if (normalizeLabelPart(tags['addr:housenumber']) && normalizeLabelPart(tags['addr:street'])) {
    return 0;
  }
  const building = normalizeLabelPart(tags.building);
  if (building === 'house' || building === 'residential' || building === 'apartments') {
    return 1;
  }
  if (building) {
    return 2;
  }
  if (normalizeLabelPart(tags.name)) {
    return 3;
  }
  if (
    normalizeLabelPart(tags.amenity) ||
    normalizeLabelPart(tags.shop) ||
    normalizeLabelPart(tags.office) ||
    normalizeLabelPart(tags.tourism)
  ) {
    return 4;
  }
  return 9;
};

const fetchNearestEndpointPlaceLabel = async (point: TripCoordinate) => {
  if (!ENDPOINT_PLACE_API_BASE_URL) {
    return null;
  }

  const query = `
[out:json][timeout:${ENDPOINT_PLACE_QUERY_TIMEOUT_SECONDS}];
(
  nwr["addr:housenumber"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
  nwr["building"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
  nwr["amenity"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
  nwr["shop"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
  nwr["office"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
  nwr["tourism"](around:${ENDPOINT_PLACE_SEARCH_RADIUS_METERS},${point.latitude},${point.longitude});
);
out center tags;
`;

  try {
    const response = await fetchWithTimeout(appendOverpassQueryData(ENDPOINT_PLACE_API_BASE_URL, query));
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: Record<string, string>;
      }>;
    };

    const candidates: NearbyEndpointPlace[] = (json.elements ?? [])
      .map((element) => {
        const latitude = element.lat ?? element.center?.lat;
        const longitude = element.lon ?? element.center?.lon;
        const tags = element.tags ?? {};
        if (
          typeof latitude !== 'number' ||
          !Number.isFinite(latitude) ||
          typeof longitude !== 'number' ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        const label = formatEndpointPlaceLabel(tags);
        if (!label) {
          return null;
        }

        return {
          label,
          distanceMeters: distanceMetersBetween(point, { latitude, longitude }),
          rank: rankEndpointPlace(tags),
        };
      })
      .filter((candidate): candidate is NearbyEndpointPlace => candidate !== null)
      .sort((left, right) => left.rank - right.rank || left.distanceMeters - right.distanceMeters);

    return candidates[0]?.label ?? null;
  } catch {
    return null;
  }
};

const formatReverseGeocodeAddress = (
  address: Location.LocationGeocodedAddress | null | undefined,
  role: TripEndpointRole,
) => {
  if (!address) {
    return getUnknownTripEndpointLabel(role);
  }

  const streetNumber = normalizeLabelPart(address.streetNumber);
  const street = normalizeLabelPart(address.street);
  const name = normalizeLabelPart(address.name);
  const district = normalizeLabelPart(address.district);
  const city = normalizeLabelPart(address.city);
  const subregion = normalizeLabelPart(address.subregion);

  if (streetNumber && street) {
    return joinDistinctLabelParts([`${streetNumber} ${street}`, city || district || subregion]);
  }

  if (street) {
    return joinDistinctLabelParts([street, city || district || subregion]);
  }

  const namedPlace =
    name && name !== street && name !== streetNumber && !name.match(/^[+-]?\d+(\.\d+)?$/)
      ? name
      : '';
  if (namedPlace && street) {
    return joinDistinctLabelParts([namedPlace, street]);
  }
  if (namedPlace) {
    return joinDistinctLabelParts([namedPlace, city || district || subregion]);
  }
  const fallbackArea = joinDistinctLabelParts([district, city, subregion]);
  return fallbackArea || getUnknownTripEndpointLabel(role);
};

export const reverseGeocodeTripEndpointLabel = async (
  point: TripCoordinate | null,
  role: TripEndpointRole,
) => {
  if (!point) {
    return getUnknownTripEndpointLabel(role);
  }

  const cacheKey = cacheKeyForCoordinate(role, point);
  const cachedLabel = geocodeCache.get(cacheKey);
  if (cachedLabel) {
    return cachedLabel;
  }

  try {
    const nearbyPlaceLabel = await fetchNearestEndpointPlaceLabel(point);
    if (nearbyPlaceLabel) {
      geocodeCache.set(cacheKey, nearbyPlaceLabel);
      return nearbyPlaceLabel;
    }

    const addresses = await Location.reverseGeocodeAsync(point);
    const label = formatReverseGeocodeAddress(addresses[0] ?? null, role);
    const resolvedLabel = label === getUnknownTripEndpointLabel(role)
      ? formatCoordinateFallbackLabel(point, role)
      : label;
    geocodeCache.set(cacheKey, resolvedLabel);
    return resolvedLabel;
  } catch {
    const fallbackLabel = formatCoordinateFallbackLabel(point, role);
    geocodeCache.set(cacheKey, fallbackLabel);
    return fallbackLabel;
  }
};

export const resolveTripDisplayLocationLabels = async ({
  matchedStartPoint,
  matchedEndPoint,
  routePath = [],
  filteredStartPoint = null,
  filteredEndPoint = null,
}: {
  matchedStartPoint?: TripCoordinate | null;
  matchedEndPoint?: TripCoordinate | null;
  routePath?: TripCoordinate[];
  filteredStartPoint?: TripCoordinate | null;
  filteredEndPoint?: TripCoordinate | null;
}): Promise<TripDisplayLocationLabels> => {
  const startCoordinate = chooseBestTripEndpointCoordinate({
    matchedPoint: matchedStartPoint,
    routePoint: routePath[0] ?? null,
    filteredPoint: filteredStartPoint,
  });
  const endCoordinate = chooseBestTripEndpointCoordinate({
    matchedPoint: matchedEndPoint,
    routePoint: routePath.at(-1) ?? null,
    filteredPoint: filteredEndPoint,
  });

  const [startDisplayName, endDisplayName] = await Promise.all([
    reverseGeocodeTripEndpointLabel(startCoordinate, 'pickup'),
    reverseGeocodeTripEndpointLabel(endCoordinate, 'destination'),
  ]);

  return {
    startDisplayName,
    endDisplayName,
    startCoordinate,
    endCoordinate,
  };
};
