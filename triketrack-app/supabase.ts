import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

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

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

export async function authenticateDriver(driverCode: string, password: string) {
  if (!supabase) {
    return {
      driver: null as DriverRecord | null,
      error:
        'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
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

  return { driver: null as DriverRecord | null, error: rpcAttempt.error.message };
}

export async function setDriverPassword(driverCode: string, password: string) {
  if (!supabase) {
    return {
      driver: null as DriverRecord | null,
      error: 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
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
    return { error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.rpc('upsert_driver_location', {
    p_driver_id: params.driverId,
    p_driver_code: params.driverCode,
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_speed: typeof params.speed === 'number' ? params.speed : null,
    p_heading: typeof params.heading === 'number' ? params.heading : null,
    p_accuracy: typeof params.accuracy === 'number' ? params.accuracy : null,
    p_recorded_at: params.recordedAt ?? new Date().toISOString(),
  });

  return { error: error ? error.message : null };
}

export async function setDriverLocationOffline(driverId: number) {
  if (!supabase) {
    return { error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.rpc('set_driver_location_offline', {
    p_driver_id: driverId,
  });

  return { error: error ? error.message : null };
}

export type TripRoutePoint = { latitude: number; longitude: number };

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

  const points = (pointRows as Array<{
    trip_id: string;
    idx: number;
    latitude: number;
    longitude: number;
  }>) ?? [];

  const pointsByTrip = new Map<string, TripRoutePoint[]>();
  for (const row of points) {
    const list = pointsByTrip.get(row.trip_id) ?? [];
    list.push({ latitude: row.latitude, longitude: row.longitude });
    pointsByTrip.set(row.trip_id, list);
  }

  return {
    trips: trips.map((t) => ({ ...t, route_points: pointsByTrip.get(t.id) ?? [] })),
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
  return {
    publicUrl: null as string | null,
    error: 'Avatar upload is not linked to the current drivers table schema.',
  };
}
