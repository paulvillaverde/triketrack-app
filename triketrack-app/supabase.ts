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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const EXPECTED_SUPABASE_HOST = 'irkbdinugnasepjowhzr.supabase.co';

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

const getSupabaseConfigError = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
  }

  if (!isExpectedSupabaseProject) {
    return `Supabase is pointed at ${configuredSupabaseHost ?? supabaseUrl}, but this app is locked to ${EXPECTED_SUPABASE_HOST}. Update your env so both the app and SQL use the same project.`;
  }

  return null;
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
};

export type ViolationRecord = {
  id: string;
  driver_id: number;
  trip_id: string | null;
  type: 'GEOFENCE_BOUNDARY' | 'ROUTE_DEVIATION' | 'UNAUTHORIZED_STOP';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  occurred_at: string;
  title?: string | null;
  location_label: string | null;
  details: string | null;
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

  return { error: error ? error.message : null };
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

  const { data: tripRows, error: tripError } = await supabase
    .from('trips')
    .select('id, driver_id, started_at, ended_at, status, fare, distance_km, duration_seconds, trip_date')
    .eq('driver_id', driverId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (tripError) {
    return {
      trips: [] as Array<TripRecord & { route_points: TripRoutePoint[] }>,
      error: tripError.message,
    };
  }

  const trips = (tripRows as TripRecord[]) ?? [];
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

  return {
    trips: trips.map((t) => {
      const routePoints = pointsByTrip.get(t.id) ?? [];
      const syncedFallbackPoints = syncedPointsByTrip.get(t.id) ?? [];
      return {
        ...t,
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
    .from('violations')
    .select('id, driver_id, trip_id:trip_uuid, type, status, priority, occurred_at, title, location_label, details')
    .eq('driver_id', driverId)
    .order('occurred_at', { ascending: false });

  if (error) {
    return { violations: [] as ViolationRecord[], error: error.message };
  }

  return { violations: (data as ViolationRecord[]) ?? [], error: null as string | null };
}

export async function createViolation(params: {
  driverId: number;
  tripId?: string | null;
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

  const insertPayload: Record<string, unknown> = {
    driver_id: params.driverId,
    trip_uuid: params.tripId ?? null,
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
    .from('violations')
    .insert(insertPayload)
    .select('id, driver_id, trip_id:trip_uuid, type, status, priority, occurred_at, location_label, details')
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
