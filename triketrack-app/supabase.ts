import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as FileSystemLegacy from 'expo-file-system/legacy';

export type DriverRecord = {
  id: number;
  full_name: string;
  driver_id: string;
  contact_number: string;
  plate_number: string;
  avatar_url?: string | null;
};

export type DriverQrStatus = 'active' | 'inactive' | 'revoked' | 'expired';

export type DriverProfileRecord = DriverRecord & {
  qr_id?: number | null;
  qr_token?: string | null;
  qr_status?: DriverQrStatus | null;
  qr_issued_at?: string | null;
  report_path?: string | null;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const EXPECTED_SUPABASE_HOST = 'irkbdinugnasepjowhzr.supabase.co';
const passengerReportBaseUrl =
  (process.env.EXPO_PUBLIC_REPORT_BASE_URL ?? 'http://127.0.0.1:5174').trim();

const getSupabaseHost = (url: string | undefined | null) => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const configuredSupabaseHost = getSupabaseHost(supabaseUrl);
const isExpectedSupabaseProject =
  configuredSupabaseHost === null || configuredSupabaseHost === EXPECTED_SUPABASE_HOST;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey && isExpectedSupabaseProject);

const getSupabaseProjectLabel = () => {
  if (!supabaseUrl) {
    return 'unknown-project';
  }

  try {
    return new URL(supabaseUrl).host;
  } catch {
    return supabaseUrl;
  }
};

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

const isSchemaCompatibilityError = (message: string | null | undefined) =>
  /column .* does not exist|schema cache/i.test(message ?? '');

const getSupabaseConfigError = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
  }

  if (!isExpectedSupabaseProject) {
    return `Supabase is pointed at ${configuredSupabaseHost ?? supabaseUrl}, but this app is locked to ${EXPECTED_SUPABASE_HOST}. Update your env so both the app and SQL use the same project.`;
  }

  return null;
};

export const buildPassengerReportUrl = (reportPath?: string | null) => {
  if (!reportPath) {
    return null;
  }

  if (/^https?:\/\//i.test(reportPath)) {
    return reportPath;
  }

  const normalizedPath = reportPath.startsWith('/') ? reportPath : `/${reportPath}`;
  const normalizedBase = passengerReportBaseUrl.replace(/\/+$/, '');

  if (!normalizedBase) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
};

export async function authenticateDriver(driverCode: string, password: string) {
  if (!supabase) {
    return {
      driver: null as DriverRecord | null,
      error: getSupabaseConfigError() ?? 'Supabase is not configured.',
    };
  }

  const rpcAttempt = await supabase
    .rpc('authenticate_driver', { p_driver_code: driverCode, p_password: password })
    .maybeSingle();

  if (!rpcAttempt.error) {
    return {
      driver: (rpcAttempt.data as DriverRecord | null) ?? null,
      error: null as string | null,
    };
  }

  if (/avatar_url does not exist/i.test(rpcAttempt.error.message ?? '')) {
    return {
      driver: null as DriverRecord | null,
      error:
        'The Supabase drivers table is missing the `avatar_url` column expected by login. Rerun `triketrack-app/supabase/schema.sql` in the `irkbdinugnasepjowhzr.supabase.co` project, then try again.',
    };
  }

  return { driver: null as DriverRecord | null, error: rpcAttempt.error.message };
}

export async function setDriverPassword(driverCode: string, password: string) {
  if (!supabase) {
    return {
      driver: null as DriverRecord | null,
      error: getSupabaseConfigError() ?? 'Supabase is not configured.',
    };
  }

  const rpcAttempt = await supabase
    .rpc('set_driver_password', { p_driver_code: driverCode, p_password: password })
    .maybeSingle();

  if (rpcAttempt.error) {
    const message = rpcAttempt.error.message ?? 'Unable to create password.';
    const isMissingFunction =
      message.includes('Could not find the function public.set_driver_password') ||
      message.includes('schema cache');

    if (/avatar_url does not exist/i.test(message)) {
      return {
        driver: null as DriverRecord | null,
        error:
          'The Supabase drivers table is missing the `avatar_url` column expected by the auth RPCs. Rerun `triketrack-app/supabase/schema.sql` in the `irkbdinugnasepjowhzr.supabase.co` project, then try again.',
      };
    }

    if (isMissingFunction) {
      return {
        driver: null as DriverRecord | null,
        error:
          'The database password function is not available yet. Run `triketrack-app/supabase/schema.sql` in Supabase SQL Editor, then try again.',
      };
    }

    return { driver: null as DriverRecord | null, error: message };
  }

  return {
    driver: (rpcAttempt.data as DriverRecord | null) ?? null,
    error: null as string | null,
  };
}

export async function fetchDriverProfile(driverId: number) {
  if (!supabase) {
    return {
      profile: null as DriverProfileRecord | null,
      error: getSupabaseConfigError() ?? 'Supabase is not configured.',
    };
  }

  const rpcAttempt = await supabase
    .rpc('get_driver_profile', { p_driver_id: driverId })
    .maybeSingle();

  if (rpcAttempt.error) {
    const message = rpcAttempt.error.message ?? 'Unable to load driver profile.';
    const isMissingFunction =
      message.includes('Could not find the function public.get_driver_profile') ||
      message.includes('schema cache');

    if (isMissingFunction) {
      return {
        profile: null as DriverProfileRecord | null,
        error:
          'The driver profile function is not available yet. Run `triketrack-app/supabase/schema.sql` in Supabase SQL Editor, then try again.',
      };
    }

    return {
      profile: null as DriverProfileRecord | null,
      error: message,
    };
  }

  return {
    profile: (rpcAttempt.data as DriverProfileRecord | null) ?? null,
    error: null as string | null,
  };
}

export async function upsertDriverLocation(params: {
  driverId: number;
  driverCode: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  recordedAt?: string;
}) {
  if (!supabase) {
    return { error: getSupabaseConfigError() ?? 'Supabase is not configured.' };
  }

  const rpcAttempt = await supabase.rpc('upsert_driver_location', {
    p_driver_id: params.driverId,
    p_driver_code: params.driverCode,
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_speed: typeof params.speed === 'number' ? params.speed : null,
    p_heading: typeof params.heading === 'number' ? params.heading : null,
    p_accuracy: typeof params.accuracy === 'number' ? params.accuracy : null,
    p_recorded_at: params.recordedAt ?? new Date().toISOString(),
  });

  if (!rpcAttempt.error) {
    return { error: null };
  }

  const message = rpcAttempt.error.message ?? '';
  const shouldFallbackToDirectWrite =
    message.includes('Could not find the function public.upsert_driver_location') ||
    message.includes('schema cache');

  if (!shouldFallbackToDirectWrite) {
    return { error: message };
  }

  const { error } = await supabase.from('driver_locations').upsert(
    {
      driver_id: params.driverId,
      driver_code: params.driverCode.toUpperCase(),
      latitude: params.latitude,
      longitude: params.longitude,
      speed: typeof params.speed === 'number' ? params.speed : null,
      heading: typeof params.heading === 'number' ? params.heading : null,
      accuracy: typeof params.accuracy === 'number' ? params.accuracy : null,
      is_online: true,
      recorded_at: params.recordedAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_id' },
  );

  return { error: error ? error.message : null };
}

export async function setDriverLocationOffline(driverId: number) {
  if (!supabase) {
    return { error: getSupabaseConfigError() ?? 'Supabase is not configured.' };
  }

  const rpcAttempt = await supabase.rpc('set_driver_location_offline', {
    p_driver_id: driverId,
  });

  if (!rpcAttempt.error) {
    return { error: null };
  }

  const message = rpcAttempt.error.message ?? '';
  const shouldFallbackToDirectWrite =
    message.includes('Could not find the function public.set_driver_location_offline') ||
    message.includes('schema cache');

  if (!shouldFallbackToDirectWrite) {
    return { error: message };
  }

  const { error } = await supabase
    .from('driver_locations')
    .update({ is_online: false, updated_at: new Date().toISOString() })
    .eq('driver_id', driverId);

  return { error: error ? error.message : null };
}

export type TripRoutePoint = { latitude: number; longitude: number };

export type TripRouteSyncRow = {
  local_trip_id: string;
  trip_id?: number | null;
  driver_id: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
};

export type TripPointSyncRow = {
  trip_id?: number | null;
  driver_id: number;
  recorded_at: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
  provider?: string | null;
  dedup_key: string;
};

export type TripRecord = {
  id: string;
  driver_id: number;
  started_at: string;
  ended_at: string | null;
  status: 'ONGOING' | 'COMPLETED' | 'FLAGGED' | 'CANCELLED';
  fare: number;
  distance_km: number;
  duration_seconds: number;
  trip_date: string;
  route_trace_geojson?: {
    type: 'LineString';
    coordinates: number[][];
  } | null;
  trip_metrics?: Record<string, unknown> | null;
  gps_quality_summary?: Record<string, unknown> | null;
  raw_gps_point_count?: number | null;
  matched_point_count?: number | null;
  start_location_raw?: { latitude: number; longitude: number } | null;
  start_location_matched?: { latitude: number; longitude: number } | null;
  end_location_raw?: { latitude: number; longitude: number } | null;
  end_location_matched?: { latitude: number; longitude: number } | null;
  start_display_name?: string | null;
  end_display_name?: string | null;
  start_coordinate?: { latitude: number; longitude: number } | null;
  end_coordinate?: { latitude: number; longitude: number } | null;
  dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
  dashed_end_connector?: Array<{ latitude: number; longitude: number }> | null;
  sync_status?: string | null;
  raw_start_point?: { latitude: number; longitude: number } | null;
  raw_telemetry?: Array<{
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    altitude?: number | null;
    provider?: string | null;
    recordedAt: string;
  }>;
  route_points?: TripRoutePoint[];
};

export type ViolationRecord = {
  id: string;
  driver_id: number;
  trip_id: number | null;
  type: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  occurred_at: string;
  title?: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  details: string | null;
  appeals?: ViolationAppealRecord[];
  proofs?: ViolationProofRecord[];
};

export type ViolationAppealRecord = {
  id: string;
  violation_id: string;
  driver_id: number;
  reason: string;
  details: string | null;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'DENIED' | 'WITHDRAWN';
  submitted_at: string;
};

export type ViolationProofRecord = {
  id: string;
  violation_id: string;
  driver_id: number;
  file_url: string;
  file_path: string;
  file_type: string | null;
  status: 'UPLOADED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
  uploaded_at: string;
};

export async function startTrip(driverId: number, startLat?: number, startLng?: number) {
  if (!supabase) {
    return { tripId: null as string | null, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase.rpc('start_trip', {
    p_driver_id: driverId,
    p_start_lat: typeof startLat === 'number' ? startLat : null,
    p_start_lng: typeof startLng === 'number' ? startLng : null,
  });

  if (error) {
    return { tripId: null as string | null, error: error.message };
  }

  return { tripId: (data as string | null) ?? null, error: null as string | null };
}

export async function completeTrip(params: {
  tripId: string;
  endLat: number;
  endLng: number;
  distanceKm: number;
  fare: number;
  durationSeconds: number;
  routePoints: TripRoutePoint[];
  routeMatchSummary?: {
    provider: string;
    confidence: number | null;
    roadNames: string[];
    distanceMeters: number | null;
    durationSeconds: number | null;
    inputPointCount: number;
    matchedPointCount: number;
  } | null;
  gpsQualitySummary?: Record<string, unknown> | null;
  matchedPointCount?: number;
  rawGpsPointCount?: number;
  rawStartPoint?: TripRoutePoint | null;
  matchedStartPoint?: TripRoutePoint | null;
  rawEndPoint?: TripRoutePoint | null;
  matchedEndPoint?: TripRoutePoint | null;
  startDisplayName?: string | null;
  endDisplayName?: string | null;
  startCoordinate?: TripRoutePoint | null;
  endCoordinate?: TripRoutePoint | null;
  dashedStartConnector?: TripRoutePoint[] | null;
  dashedEndConnector?: TripRoutePoint[] | null;
  offlineSegmentsCount?: number | null;
  endpointSelectionSummary?: Record<string, unknown> | null;
}) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.rpc('complete_trip', {
    p_trip_id: params.tripId,
    p_end_lat: params.endLat,
    p_end_lng: params.endLng,
    p_distance_km: params.distanceKm,
    p_fare: params.fare,
    p_duration_seconds: params.durationSeconds,
    p_route_points: params.routePoints,
  });

  if (error) {
    return { error: error.message };
  }

  const routeTraceGeoJson =
    params.routePoints.length >= 2
      ? {
          type: 'LineString' as const,
          coordinates: params.routePoints.map((point) => [point.longitude, point.latitude]),
        }
      : null;
  const tripMetrics = {
    routeMatchSummary: params.routeMatchSummary ?? null,
    endpointSelection: params.endpointSelectionSummary ?? null,
  };

  const { error: updateError } = await supabase
    .from('trips')
    .update({
      start_location_raw: params.rawStartPoint ?? null,
      start_location_matched: params.matchedStartPoint ?? params.routePoints[0] ?? null,
      end_location_raw: params.rawEndPoint ?? null,
      end_location_matched: params.matchedEndPoint ?? params.routePoints.at(-1) ?? null,
      start_display_name: params.startDisplayName ?? null,
      end_display_name: params.endDisplayName ?? null,
      start_coordinate:
        params.startCoordinate ?? params.matchedStartPoint ?? params.routePoints[0] ?? null,
      end_coordinate:
        params.endCoordinate ?? params.matchedEndPoint ?? params.routePoints.at(-1) ?? null,
      dashed_start_connector: params.dashedStartConnector ?? null,
      dashed_end_connector: params.dashedEndConnector ?? null,
      route_trace_geojson: routeTraceGeoJson,
      trip_metrics: tripMetrics,
      gps_quality_summary: params.gpsQualitySummary ?? null,
      raw_gps_point_count:
        typeof params.rawGpsPointCount === 'number' ? params.rawGpsPointCount : null,
      matched_point_count:
        typeof params.matchedPointCount === 'number'
          ? params.matchedPointCount
          : params.routePoints.length,
      offline_segments_count:
        typeof params.offlineSegmentsCount === 'number' ? params.offlineSegmentsCount : null,
      sync_status: 'SYNCED',
    })
    .eq('trip_id', Number(params.tripId));

  if (!updateError) {
    return { error: null as string | null };
  }

  if (!isSchemaCompatibilityError(updateError.message)) {
    return { error: updateError.message };
  }

  const { error: legacyUpdateError } = await supabase
    .from('trips')
    .update({
      route_trace_geojson: routeTraceGeoJson,
      trip_metrics: tripMetrics,
      gps_quality_summary: params.gpsQualitySummary ?? null,
      raw_gps_point_count:
        typeof params.rawGpsPointCount === 'number' ? params.rawGpsPointCount : null,
      matched_point_count:
        typeof params.matchedPointCount === 'number'
          ? params.matchedPointCount
          : params.routePoints.length,
      sync_status: 'SYNCED',
    })
    .eq('trip_id', Number(params.tripId));

  return {
    error:
      legacyUpdateError &&
      !isSchemaCompatibilityError(legacyUpdateError.message)
        ? legacyUpdateError.message
        : null,
  };
}

export async function deleteTrip(tripId: string | number) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }

  const parsedTripId = Number(tripId);
  if (!Number.isFinite(parsedTripId)) {
    return { error: 'Invalid trip id.' };
  }

  const { error: deleteRoutesError } = await supabase
    .from('trip_routes')
    .delete()
    .eq('trip_id', parsedTripId);

  if (deleteRoutesError) {
    return { error: deleteRoutesError.message };
  }

  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('trip_id', parsedTripId);

  return { error: error ? error.message : null };
}

export async function checkTripExists(tripId: string | number) {
  if (!supabase) {
    return { exists: false, error: 'Supabase is not configured.' };
  }

  const parsedTripId = Number(tripId);
  if (!Number.isFinite(parsedTripId)) {
    return { exists: false, error: 'Invalid trip id.' };
  }

  const { data, error } = await supabase
    .from('trips')
    .select('trip_id')
    .eq('trip_id', parsedTripId)
    .maybeSingle();

  return {
    exists: Boolean(data && !error),
    error: error ? error.message : null,
  };
}

export async function insertTripRouteBatch(rows: TripRouteSyncRow[]) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }
  if (rows.length === 0) {
    return { error: null as string | null };
  }

  const { error } = await supabase.from('trip_routes').upsert(
    rows.map((row) => ({
      local_trip_id: row.local_trip_id,
      trip_id: typeof row.trip_id === 'number' ? row.trip_id : null,
      driver_id: row.driver_id,
      latitude: row.latitude,
      longitude: row.longitude,
      recorded_at: row.recorded_at,
    })),
    {
      onConflict: 'local_trip_id,driver_id,recorded_at,latitude,longitude',
      ignoreDuplicates: true,
    },
  );

  return { error: error ? error.message : null };
}

export async function replaceTripRouteFallback(params: {
  tripId: number;
  driverId: number;
  routePoints: TripRoutePoint[];
  startedAt?: string | null;
  localTripId?: string | null;
  routeMatchSummary?: {
    provider: string;
    confidence: number | null;
    roadNames: string[];
    distanceMeters: number | null;
    durationSeconds: number | null;
    inputPointCount: number;
    matchedPointCount: number;
  } | null;
  rawEndPoint?: TripRoutePoint | null;
  matchedEndPoint?: TripRoutePoint | null;
  startDisplayName?: string | null;
  startCoordinate?: TripRoutePoint | null;
  endDisplayName?: string | null;
  endCoordinate?: TripRoutePoint | null;
  dashedEndConnector?: TripRoutePoint[] | null;
  endpointSelectionSummary?: Record<string, unknown> | null;
}) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }

  const routePoints = params.routePoints.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude),
  );
  if (routePoints.length < 2) {
    return { error: null as string | null };
  }

  const { error: deleteError } = await supabase
    .from('trip_routes')
    .delete()
    .eq('trip_id', params.tripId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  const baseTimeMs = (() => {
    const parsed = new Date(params.startedAt ?? '').getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  })();
  const localTripId =
    typeof params.localTripId === 'string' && params.localTripId.trim().length > 0
      ? params.localTripId.trim()
      : `repair-trip-${params.tripId}`;

  const { error: insertError } = await supabase.from('trip_routes').insert(
    routePoints.map((point, index) => ({
      local_trip_id: localTripId,
      trip_id: params.tripId,
      driver_id: params.driverId,
      latitude: point.latitude,
      longitude: point.longitude,
      recorded_at: new Date(baseTimeMs + index * 1000).toISOString(),
    })),
  );

  if (insertError) {
    return { error: insertError.message };
  }

  const routeTraceGeoJson = {
    type: 'LineString' as const,
    coordinates: routePoints.map((point) => [point.longitude, point.latitude]),
  };
  const tripMetrics = {
    routeMatchSummary: params.routeMatchSummary ?? null,
    endpointSelection: params.endpointSelectionSummary ?? null,
  };

  const { error: updateError } = await supabase
    .from('trips')
    .update({
      start_display_name: params.startDisplayName ?? null,
      start_coordinate: params.startCoordinate ?? routePoints[0] ?? null,
      end_location_raw: params.rawEndPoint ?? null,
      end_location_matched: params.matchedEndPoint ?? routePoints[routePoints.length - 1] ?? null,
      end_display_name: params.endDisplayName ?? null,
      end_coordinate:
        params.endCoordinate ?? params.matchedEndPoint ?? routePoints[routePoints.length - 1] ?? null,
      dashed_end_connector: params.dashedEndConnector ?? null,
      route_trace_geojson: routeTraceGeoJson,
      trip_metrics: tripMetrics,
      matched_point_count: routePoints.length,
      sync_status: 'SYNCED',
    })
    .eq('trip_id', params.tripId);

  if (!updateError) {
    return { error: null as string | null };
  }

  if (!isSchemaCompatibilityError(updateError.message)) {
    return { error: updateError.message };
  }

  const { error: legacyUpdateError } = await supabase
    .from('trips')
    .update({
      route_trace_geojson: routeTraceGeoJson,
      trip_metrics: tripMetrics,
      matched_point_count: routePoints.length,
      sync_status: 'SYNCED',
    })
    .eq('trip_id', params.tripId);

  return {
    error:
      legacyUpdateError &&
      !isSchemaCompatibilityError(legacyUpdateError.message)
        ? legacyUpdateError.message
        : null,
  };
}

export async function insertTripPointBatch(rows: TripPointSyncRow[]) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }
  if (rows.length === 0) {
    return { error: null as string | null };
  }

  const buildRows = ({
    includeAltitude,
    includeProvider,
  }: {
    includeAltitude: boolean;
    includeProvider: boolean;
  }) =>
    rows.map((row) => ({
      trip_id: typeof row.trip_id === 'number' ? row.trip_id : null,
      driver_id: row.driver_id,
      recorded_at: row.recorded_at,
      lat: row.lat,
      lng: row.lng,
      speed: typeof row.speed === 'number' ? row.speed : null,
      heading: typeof row.heading === 'number' ? row.heading : null,
      accuracy: typeof row.accuracy === 'number' ? row.accuracy : null,
      ...(includeAltitude
        ? { altitude: typeof row.altitude === 'number' ? row.altitude : null }
        : {}),
      ...(includeProvider
        ? { provider: typeof row.provider === 'string' ? row.provider : null }
        : {}),
      dedup_key: row.dedup_key,
    }));

  const { error } = await supabase.from('trip_points').upsert(
    buildRows({ includeAltitude: true, includeProvider: true }),
    {
      onConflict: 'dedup_key',
      ignoreDuplicates: true,
    },
  );

  if (error && isSchemaCompatibilityError(error.message) && /altitude|provider/i.test(error.message)) {
    const { error: legacyError } = await supabase.from('trip_points').upsert(
      buildRows({ includeAltitude: false, includeProvider: false }),
      {
        onConflict: 'dedup_key',
        ignoreDuplicates: true,
      },
    );

    return { error: legacyError ? legacyError.message : null };
  }

  return { error: error ? error.message : null };
}

export async function attachTripRoutesToServerTrip(localTripId: string, tripId: number) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('trip_routes')
    .update({ trip_id: tripId })
    .eq('local_trip_id', localTripId)
    .is('trip_id', null);

  return { error: error ? error.message : null };
}

export async function listTripsByWeekBucket(driverId: number, bucket: 'THIS_WEEK' | 'LAST_WEEK' | 'OVER_30' | 'ALL') {
  if (!supabase) {
    return { trips: [] as TripRecord[], error: 'Supabase is not configured.' };
  }

  const query = supabase
    .from('trips_with_week_bucket')
    .select('id, driver_id, started_at, ended_at, status, fare, distance_km, duration_seconds, trip_date')
    .eq('driver_id', driverId)
    .order('started_at', { ascending: false });

  const { data, error } =
    bucket === 'ALL' ? await query : await query.eq('week_bucket', bucket);

  if (error) {
    return { trips: [] as TripRecord[], error: error.message };
  }

  return { trips: (data as TripRecord[]) ?? [], error: null as string | null };
}

export async function listTripsWithRoutePoints(driverId: number, limit = 100) {
  if (!supabase) {
    return {
      trips: [] as Array<TripRecord & { route_points: TripRoutePoint[] }>,
      error: 'Supabase is not configured.',
    };
  }

  const normalizeTripDate = (value: string | null | undefined) => {
    const parsed = new Date(value ?? '');
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return parsed.toISOString().slice(0, 10);
  };

  const normalizeTripStatus = (value: string | null | undefined): TripRecord['status'] => {
    const normalized = (value ?? '').trim().toUpperCase();
    if (
      normalized === 'ONGOING' ||
      normalized === 'COMPLETED' ||
      normalized === 'FLAGGED' ||
      normalized === 'CANCELLED'
    ) {
      return normalized;
    }
    return 'COMPLETED';
  };

  const { data: tripViewRows, error: tripViewError } = await supabase
    .from('trips_with_week_bucket')
    .select('id, driver_id, started_at, ended_at, status, fare, distance_km, duration_seconds, trip_date')
    .eq('driver_id', driverId)
    .order('started_at', { ascending: false })
    .limit(limit);

  let trips: TripRecord[] = [];

  if (!tripViewError) {
    trips = (tripViewRows as TripRecord[]) ?? [];
  } else {
    const { data: rawTripRows, error: rawTripError } = await supabase
      .from('trips')
      .select('trip_id, driver_id, trip_start, trip_end, trip_status, fare_amount, duration_minutes')
      .eq('driver_id', driverId)
      .order('trip_start', { ascending: false })
      .limit(limit);

    if (rawTripError) {
      return {
        trips: [] as Array<TripRecord & { route_points: TripRoutePoint[] }>,
        error: rawTripError.message,
      };
    }

    trips = ((rawTripRows as Array<{
      trip_id: string | number;
      driver_id: number;
      trip_start: string;
      trip_end: string | null;
      trip_status: string | null;
      fare_amount: number | string | null;
      duration_minutes: number | null;
    }>) ?? []).map((row) => ({
      id: String(row.trip_id),
      driver_id: row.driver_id,
      started_at: row.trip_start,
      ended_at: row.trip_end ?? null,
      status: normalizeTripStatus(row.trip_status),
      fare: Number(row.fare_amount ?? 0),
      distance_km: 0,
      duration_seconds: Math.max(0, Number(row.duration_minutes ?? 0) * 60),
      trip_date: normalizeTripDate(row.trip_start),
    }));
  }

  const tripIds = trips.map((t) => t.id).filter(Boolean);

  if (tripIds.length === 0) {
    return { trips: trips.map((t) => ({ ...t, route_points: [] })), error: null as string | null };
  }

  const { data: pointRows, error: pointError } = await supabase
    .from('trip_route_points')
    .select('trip_id, idx, latitude, longitude')
    .in('trip_id', tripIds)
    .order('trip_id', { ascending: true })
    .order('idx', { ascending: true });

  if (pointError) {
    return {
      trips: trips.map((t) => ({ ...t, route_points: [] })),
      error: pointError.message,
    };
  }

  const { data: syncedRouteRows, error: syncedRouteError } = await supabase
    .from('trip_routes')
    .select('trip_id, recorded_at, latitude, longitude')
    .in('trip_id', tripIds)
    .order('trip_id', { ascending: true })
    .order('recorded_at', { ascending: true });

  if (syncedRouteError) {
    return {
      trips: trips.map((t) => ({ ...t, route_points: [] })),
      error: syncedRouteError.message,
    };
  }

  let rawPointRows:
    | Array<{
        trip_id: string;
        recorded_at: string;
        lat: number;
        lng: number;
        speed: number | null;
        heading: number | null;
        accuracy: number | null;
        altitude?: number | null;
        provider?: string | null;
      }>
    | null = null;
  const { data: primaryRawPointRows, error: rawPointError } = await supabase
    .from('trip_points')
    .select('trip_id, recorded_at, lat, lng, speed, heading, accuracy, altitude, provider')
    .in('trip_id', tripIds)
    .order('trip_id', { ascending: true })
    .order('recorded_at', { ascending: true });

  if (rawPointError) {
    if (!isSchemaCompatibilityError(rawPointError.message) || !/altitude|provider/i.test(rawPointError.message)) {
      return {
        trips: trips.map((t) => ({ ...t, route_points: [] })),
        error: rawPointError.message,
      };
    }

    const { data: legacyRawPointRows, error: legacyRawPointError } = await supabase
      .from('trip_points')
      .select('trip_id, recorded_at, lat, lng, speed, heading, accuracy')
      .in('trip_id', tripIds)
      .order('trip_id', { ascending: true })
      .order('recorded_at', { ascending: true });

    if (legacyRawPointError) {
      return {
        trips: trips.map((t) => ({ ...t, route_points: [] })),
        error: legacyRawPointError.message,
      };
    }

    rawPointRows =
      (legacyRawPointRows as Array<{
        trip_id: string;
        recorded_at: string;
        lat: number;
        lng: number;
        speed: number | null;
        heading: number | null;
        accuracy: number | null;
      }> | null)?.map((row) => ({ ...row, altitude: null, provider: null })) ?? [];
  } else {
    rawPointRows =
      (primaryRawPointRows as Array<{
        trip_id: string;
        recorded_at: string;
        lat: number;
        lng: number;
        speed: number | null;
        heading: number | null;
        accuracy: number | null;
        altitude: number | null;
        provider: string | null;
      }> | null) ?? [];
  }

  let tripMetaRows:
    | Array<{
        trip_id: string;
        route_trace_geojson?: { type: 'LineString'; coordinates: number[][] } | null;
        trip_metrics?: Record<string, unknown> | null;
        gps_quality_summary?: Record<string, unknown> | null;
        raw_gps_point_count?: number | null;
        matched_point_count?: number | null;
        start_location_raw?: { latitude: number; longitude: number } | null;
        start_location_matched?: { latitude: number; longitude: number } | null;
        end_location_raw?: { latitude: number; longitude: number } | null;
        end_location_matched?: { latitude: number; longitude: number } | null;
        start_display_name?: string | null;
        end_display_name?: string | null;
        start_coordinate?: { latitude: number; longitude: number } | null;
        end_coordinate?: { latitude: number; longitude: number } | null;
        dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
        dashed_end_connector?: Array<{ latitude: number; longitude: number }> | null;
        sync_status?: string | null;
      }>
    | null = null;
  const tripMetaSelect =
    'trip_id, route_trace_geojson, trip_metrics, gps_quality_summary, raw_gps_point_count, matched_point_count, start_location_raw, start_location_matched, end_location_raw, end_location_matched, start_display_name, end_display_name, start_coordinate, end_coordinate, dashed_start_connector, dashed_end_connector, sync_status';
  const legacyTripMetaSelect =
    'trip_id, route_trace_geojson, trip_metrics, gps_quality_summary, raw_gps_point_count, matched_point_count, start_location_raw, start_location_matched, end_location_raw, end_location_matched, dashed_start_connector, sync_status';
  const { data: primaryTripMetaRows, error: primaryTripMetaError } = await supabase
    .from('trips')
    .select(tripMetaSelect)
    .in('trip_id', tripIds);

  if (primaryTripMetaError && !isSchemaCompatibilityError(primaryTripMetaError.message)) {
    return {
      trips: trips.map((t) => ({ ...t, route_points: [] })),
      error: primaryTripMetaError.message,
    };
  }

  if (!primaryTripMetaError) {
    tripMetaRows =
      (primaryTripMetaRows as Array<{
        trip_id: string;
        route_trace_geojson?: { type: 'LineString'; coordinates: number[][] } | null;
        trip_metrics?: Record<string, unknown> | null;
        gps_quality_summary?: Record<string, unknown> | null;
        raw_gps_point_count?: number | null;
        matched_point_count?: number | null;
        start_location_raw?: { latitude: number; longitude: number } | null;
        start_location_matched?: { latitude: number; longitude: number } | null;
        end_location_raw?: { latitude: number; longitude: number } | null;
        end_location_matched?: { latitude: number; longitude: number } | null;
        start_display_name?: string | null;
        end_display_name?: string | null;
        start_coordinate?: { latitude: number; longitude: number } | null;
        end_coordinate?: { latitude: number; longitude: number } | null;
        dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
        dashed_end_connector?: Array<{ latitude: number; longitude: number }> | null;
        sync_status?: string | null;
      }>) ?? [];
  } else {
    const { data: legacyTripMetaRows, error: legacyTripMetaError } = await supabase
      .from('trips')
      .select(legacyTripMetaSelect)
      .in('trip_id', tripIds);

    if (legacyTripMetaError) {
      return {
        trips: trips.map((t) => ({ ...t, route_points: [] })),
        error: legacyTripMetaError.message,
      };
    }

    tripMetaRows =
      ((legacyTripMetaRows as Array<{
        trip_id: string;
        route_trace_geojson?: { type: 'LineString'; coordinates: number[][] } | null;
        trip_metrics?: Record<string, unknown> | null;
        gps_quality_summary?: Record<string, unknown> | null;
        raw_gps_point_count?: number | null;
        matched_point_count?: number | null;
        start_location_raw?: { latitude: number; longitude: number } | null;
        start_location_matched?: { latitude: number; longitude: number } | null;
        end_location_raw?: { latitude: number; longitude: number } | null;
        end_location_matched?: { latitude: number; longitude: number } | null;
        dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
        sync_status?: string | null;
      }>) ?? []).map((row) => ({
        ...row,
        start_display_name: null,
        end_display_name: null,
        start_coordinate: null,
        end_coordinate: null,
        dashed_end_connector: null,
      }));
  }

  const points = (pointRows as Array<{
    trip_id: string;
    idx: number;
    latitude: number;
    longitude: number;
  }>) ?? [];
  const syncedRoutePoints = (syncedRouteRows as Array<{
    trip_id: string;
    recorded_at: string;
    latitude: number;
    longitude: number;
  }>) ?? [];
  const rawStartPoints = (rawPointRows as Array<{
    trip_id: string;
    recorded_at: string;
    lat: number;
    lng: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    altitude: number | null;
    provider?: string | null;
  }>) ?? [];

  const rawTelemetryByTrip = new Map<string, NonNullable<TripRecord['raw_telemetry']>>();
  for (const row of rawStartPoints) {
    if (!row.trip_id || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
      continue;
    }
    const list = rawTelemetryByTrip.get(row.trip_id) ?? [];
    list.push({
      latitude: row.lat,
      longitude: row.lng,
      speed: typeof row.speed === 'number' && Number.isFinite(row.speed) ? row.speed : null,
      heading: typeof row.heading === 'number' && Number.isFinite(row.heading) ? row.heading : null,
      accuracy:
        typeof row.accuracy === 'number' && Number.isFinite(row.accuracy) ? row.accuracy : null,
      altitude:
        typeof row.altitude === 'number' && Number.isFinite(row.altitude) ? row.altitude : null,
      provider: typeof row.provider === 'string' ? row.provider : null,
      recordedAt: row.recorded_at,
    });
    rawTelemetryByTrip.set(row.trip_id, list);
  }
  const tripMetas = (tripMetaRows ?? []) as Array<{
    trip_id: string;
    route_trace_geojson?: { type: 'LineString'; coordinates: number[][] } | null;
    trip_metrics?: Record<string, unknown> | null;
    gps_quality_summary?: Record<string, unknown> | null;
    raw_gps_point_count?: number | null;
    matched_point_count?: number | null;
    start_location_raw?: { latitude: number; longitude: number } | null;
    start_location_matched?: { latitude: number; longitude: number } | null;
    end_location_raw?: { latitude: number; longitude: number } | null;
    end_location_matched?: { latitude: number; longitude: number } | null;
    start_display_name?: string | null;
    end_display_name?: string | null;
    start_coordinate?: { latitude: number; longitude: number } | null;
    end_coordinate?: { latitude: number; longitude: number } | null;
    dashed_start_connector?: Array<{ latitude: number; longitude: number }> | null;
    dashed_end_connector?: Array<{ latitude: number; longitude: number }> | null;
    sync_status?: string | null;
  }>;

  const pointsByTrip = new Map<string, TripRoutePoint[]>();
  for (const row of points) {
    const list = pointsByTrip.get(row.trip_id) ?? [];
    list.push({ latitude: row.latitude, longitude: row.longitude });
    pointsByTrip.set(row.trip_id, list);
  }

  const syncedPointsByTrip = new Map<string, TripRoutePoint[]>();
  for (const row of syncedRoutePoints) {
    if (!row.trip_id) {
      continue;
    }
    const list = syncedPointsByTrip.get(row.trip_id) ?? [];
    const previous = list[list.length - 1];
    if (
      previous &&
      previous.latitude === row.latitude &&
      previous.longitude === row.longitude
    ) {
      continue;
    }
    list.push({ latitude: row.latitude, longitude: row.longitude });
    syncedPointsByTrip.set(row.trip_id, list);
  }

  const rawStartPointByTrip = new Map<string, TripRoutePoint>();
  for (const row of rawStartPoints) {
    if (!row.trip_id || rawStartPointByTrip.has(row.trip_id)) {
      continue;
    }
    rawStartPointByTrip.set(row.trip_id, {
      latitude: row.lat,
      longitude: row.lng,
    });
  }

  const tripMetaByTrip = new Map<string, (typeof tripMetas)[number]>();
  for (const row of tripMetas) {
    tripMetaByTrip.set(row.trip_id, row);
  }

  return {
    trips: trips.map((t) => {
      const routePoints = pointsByTrip.get(t.id) ?? [];
      const syncedFallbackPoints = syncedPointsByTrip.get(t.id) ?? [];
      const tripMeta = tripMetaByTrip.get(t.id);
      return {
        ...t,
        raw_start_point: rawStartPointByTrip.get(t.id) ?? null,
        raw_telemetry: rawTelemetryByTrip.get(t.id) ?? [],
        route_trace_geojson: tripMeta?.route_trace_geojson ?? null,
        trip_metrics: tripMeta?.trip_metrics ?? null,
        gps_quality_summary: tripMeta?.gps_quality_summary ?? null,
        raw_gps_point_count: tripMeta?.raw_gps_point_count ?? null,
        matched_point_count: tripMeta?.matched_point_count ?? null,
        start_location_raw: tripMeta?.start_location_raw ?? null,
        start_location_matched: tripMeta?.start_location_matched ?? null,
        end_location_raw: tripMeta?.end_location_raw ?? null,
        end_location_matched: tripMeta?.end_location_matched ?? null,
        start_display_name: tripMeta?.start_display_name ?? null,
        end_display_name: tripMeta?.end_display_name ?? null,
        start_coordinate: tripMeta?.start_coordinate ?? null,
        end_coordinate: tripMeta?.end_coordinate ?? null,
        dashed_start_connector: tripMeta?.dashed_start_connector ?? null,
        dashed_end_connector: tripMeta?.dashed_end_connector ?? null,
        sync_status: tripMeta?.sync_status ?? null,
        route_points:
          syncedFallbackPoints.length > routePoints.length
            ? syncedFallbackPoints
            : routePoints,
      };
    }),
    error: null as string | null,
  };
}

export async function listViolations(driverId: number) {
  if (!supabase) {
    return { violations: [] as ViolationRecord[], error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('mobile_violations')
    .select('id, driver_id, trip_id, type, status, priority, occurred_at, title, latitude, longitude, location_label, details')
    .eq('driver_id', driverId)
    .order('occurred_at', { ascending: false });

  if (error) {
    return { violations: [] as ViolationRecord[], error: error.message };
  }

  const violations = ((data as ViolationRecord[]) ?? []).map((violation) => ({
    ...violation,
    appeals: [] as ViolationAppealRecord[],
    proofs: [] as ViolationProofRecord[],
  }));
  const violationIds = violations.map((violation) => violation.id);
  if (violationIds.length === 0) {
    return { violations, error: null as string | null };
  }

  const { data: appealRows, error: appealError } = await supabase
    .from('violation_appeals')
    .select('id, violation_id, driver_id, reason, details, status, submitted_at')
    .eq('driver_id', driverId)
    .in('violation_id', violationIds)
    .order('submitted_at', { ascending: false });

  if (appealError) {
    return { violations: [] as ViolationRecord[], error: appealError.message };
  }

  const appealsByViolation = new Map<string, ViolationAppealRecord[]>();
  for (const row of (appealRows as ViolationAppealRecord[] | null) ?? []) {
    const list = appealsByViolation.get(row.violation_id) ?? [];
    list.push(row);
    appealsByViolation.set(row.violation_id, list);
  }

  const { data: proofRows, error: proofError } = await supabase
    .from('violation_proofs')
    .select('id, violation_id, driver_id, file_url, file_path, file_type, status, uploaded_at')
    .eq('driver_id', driverId)
    .in('violation_id', violationIds)
    .order('uploaded_at', { ascending: false });

  if (proofError && !isSchemaCompatibilityError(proofError.message)) {
    return { violations: [] as ViolationRecord[], error: proofError.message };
  }

  const proofsByViolation = new Map<string, ViolationProofRecord[]>();
  if (!proofError) {
    for (const row of (proofRows as ViolationProofRecord[] | null) ?? []) {
      const list = proofsByViolation.get(row.violation_id) ?? [];
      list.push(row);
      proofsByViolation.set(row.violation_id, list);
    }
  }

  return {
    violations: violations.map((violation) => ({
      ...violation,
      appeals: appealsByViolation.get(violation.id) ?? [],
      proofs: proofsByViolation.get(violation.id) ?? [],
    })),
    error: null as string | null,
  };
}

export async function createViolation(params: {
  driverId: number;
  tripId?: string | number | null;
  type: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  occurredAt?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  details?: string;
}) {
  if (!supabase) {
    return { violation: null as ViolationRecord | null, error: 'Supabase is not configured.' };
  }

  const parsedTripId =
    params.tripId === null || typeof params.tripId === 'undefined'
      ? null
      : Number(params.tripId);

  const insertPayload: Record<string, unknown> = {
    driver_id: params.driverId,
    trip_id: Number.isFinite(parsedTripId) ? parsedTripId : null,
    type: params.type,
    status: 'OPEN',
    priority: params.priority ?? 'HIGH',
    latitude: typeof params.latitude === 'number' ? params.latitude : null,
    longitude: typeof params.longitude === 'number' ? params.longitude : null,
    location_label: params.locationLabel ?? null,
    details: params.details ?? null,
  };

  if (params.occurredAt) {
    insertPayload.occurred_at = params.occurredAt;
  }

  const { data, error } = await supabase
    .from('mobile_violations')
    .insert(insertPayload)
    .select('id, driver_id, trip_id, type, status, priority, occurred_at, title, latitude, longitude, location_label, details')
    .maybeSingle();

  if (error) {
    return { violation: null as ViolationRecord | null, error: error.message };
  }

  return { violation: (data as ViolationRecord | null) ?? null, error: null as string | null };
}

export async function submitViolationAppeal(params: {
  violationId: string;
  driverId: number;
  reason: string;
  details?: string;
}) {
  if (!supabase) {
    return { appeal: null as ViolationAppealRecord | null, error: 'Supabase is not configured.' };
  }

  const { data: existingAppeal, error: existingAppealError } = await supabase
    .from('violation_appeals')
    .select('id, violation_id, driver_id, reason, details, status, submitted_at')
    .eq('violation_id', params.violationId)
    .eq('driver_id', params.driverId)
    .in('status', ['SUBMITTED', 'UNDER_REVIEW'])
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingAppealError) {
    return { appeal: null as ViolationAppealRecord | null, error: existingAppealError.message };
  }

  if (existingAppeal) {
    return {
      appeal: existingAppeal as ViolationAppealRecord,
      error: 'An active appeal is already submitted for this violation.',
    };
  }

  const { data, error } = await supabase
    .from('violation_appeals')
    .insert({
      violation_id: params.violationId,
      driver_id: params.driverId,
      reason: params.reason,
      details: params.details ?? null,
      status: 'SUBMITTED',
    })
    .select('id, violation_id, driver_id, reason, details, status, submitted_at')
    .maybeSingle();

  if (error) {
    return { appeal: null as ViolationAppealRecord | null, error: error.message };
  }

  return { appeal: (data as ViolationAppealRecord | null) ?? null, error: null as string | null };
}

export async function uploadViolationProof(params: {
  violationId: string;
  driverId: number;
  localUri: string;
  contentType?: string;
  ext?: string;
}) {
  if (!supabase) {
    return {
      proof: null as ViolationProofRecord | null,
      error: getSupabaseConfigError() ?? 'Supabase is not configured.',
    };
  }

  try {
    const extension =
      params.ext ??
      params.localUri.split('.').pop()?.split('?')[0]?.toLowerCase() ??
      'jpg';
    const normalizedExt = extension === 'jpeg' ? 'jpg' : extension;
    const filePath = `driver-${params.driverId}/${params.violationId}/${Date.now()}.${normalizedExt}`;
    const base64Payload = await FileSystemLegacy.readAsStringAsync(params.localUri, {
      encoding: 'base64',
    });
    const fileBytes = Uint8Array.from(atob(base64Payload), (char) => char.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('violation-proofs')
      .upload(filePath, fileBytes, {
        upsert: false,
        contentType: params.contentType ?? `image/${normalizedExt}`,
      });

    if (uploadError) {
      return { proof: null as ViolationProofRecord | null, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('violation-proofs').getPublicUrl(filePath);

    const { data, error } = await supabase
      .from('violation_proofs')
      .insert({
        violation_id: params.violationId,
        driver_id: params.driverId,
        file_url: publicUrl,
        file_path: filePath,
        file_type: params.contentType ?? `image/${normalizedExt}`,
        status: 'UPLOADED',
      })
      .select('id, violation_id, driver_id, file_url, file_path, file_type, status, uploaded_at')
      .maybeSingle();

    if (error) {
      return { proof: null as ViolationProofRecord | null, error: error.message };
    }

    return { proof: (data as ViolationProofRecord | null) ?? null, error: null as string | null };
  } catch (error) {
    return {
      proof: null as ViolationProofRecord | null,
      error: error instanceof Error ? error.message : 'Unable to upload violation proof.',
    };
  }
}

export async function uploadDriverAvatar(_params: {
  driverId: number;
  localUri: string;
  contentType?: string;
  ext?: string;
}) {
  if (!supabase) {
    return {
      publicUrl: null as string | null,
      error: getSupabaseConfigError() ?? 'Supabase is not configured.',
      warning: null as string | null,
    };
  }

  try {
    const extension =
      _params.ext ??
      _params.localUri.split('.').pop()?.split('?')[0]?.toLowerCase() ??
      'jpg';
    const normalizedExt = extension === 'jpeg' ? 'jpg' : extension;
    const filePath = `driver-${_params.driverId}/avatar.${normalizedExt}`;
    const base64Payload = await FileSystemLegacy.readAsStringAsync(_params.localUri, {
      encoding: 'base64',
    });
    const fileBytes = Uint8Array.from(atob(base64Payload), (char) => char.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from('driver-avatars')
      .upload(filePath, fileBytes, {
        upsert: true,
        contentType: _params.contentType ?? `image/${normalizedExt}`,
      });

    if (uploadError) {
      const message = uploadError.message ?? 'Unable to upload avatar.';
      if (/bucket not found/i.test(message)) {
        return {
          publicUrl: null as string | null,
          error: null as string | null,
          warning:
            `Avatar upload is not fully configured yet. The \`driver-avatars\` bucket was not found in ${getSupabaseProjectLabel()}, so the photo is saved only on this device for now. Run \`triketrack-app/supabase/storage_bucket.sql\` in that same Supabase project to sync avatars across devices.`,
        };
      }
      return { publicUrl: null as string | null, error: message, warning: null as string | null };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('driver-avatars').getPublicUrl(filePath);

    const rpcAttempt = await supabase.rpc('set_driver_avatar', {
      p_driver_id: _params.driverId,
      p_avatar_url: publicUrl,
    });

    if (rpcAttempt.error) {
      const { error: updateError } = await supabase
        .from('drivers')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('driver_id', _params.driverId);

      if (updateError) {
        return {
          publicUrl: null as string | null,
          error: updateError.message,
          warning: null as string | null,
        };
      }
    }

    return { publicUrl, error: null as string | null, warning: null as string | null };
  } catch (error) {
    return {
      publicUrl: null as string | null,
      error: error instanceof Error ? error.message : 'Unable to upload avatar.',
      warning: null as string | null,
    };
  }
}
