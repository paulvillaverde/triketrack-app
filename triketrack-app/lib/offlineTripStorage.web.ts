export type OfflineTripCaptureStatus = 'online' | 'offline';
export type OfflineTripPointSyncState = 'pending' | 'synced';
export type OfflineMatchedPointSource =
  | 'service'
  | 'local-fallback'
  | 'local-heuristic'
  | 'reconstructed';
export type OfflineTripStatusEventType =
  | 'trip_started'
  | 'movement_confirmed'
  | 'trip_completed'
  | 'connectivity_offline'
  | 'connectivity_online'
  | 'app_recovered';

export type OfflineTripPoint = {
  id: number;
  local_trip_id: string;
  server_trip_id: number | null;
  driver_id: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  altitude: number | null;
  provider: string | null;
  recorded_at: string;
  capture_status: OfflineTripCaptureStatus;
  sync_state: OfflineTripPointSyncState;
  synced: 0 | 1;
  idempotency_key: string;
};

export type OfflineMatchedTripPoint = {
  id: number;
  local_trip_id: string;
  server_trip_id: number | null;
  driver_id: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
  match_source: OfflineMatchedPointSource;
  sync_state: OfflineTripPointSyncState;
  synced: 0 | 1;
  idempotency_key: string;
};

export type OfflineTripStatusEvent = {
  id: number;
  local_trip_id: string;
  server_trip_id: number | null;
  driver_id: number;
  status: OfflineTripStatusEventType;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  payload_json: string | null;
  sync_state: OfflineTripPointSyncState;
  synced: 0 | 1;
  idempotency_key: string;
};

export type OfflineTripSessionStatus = 'ongoing' | 'completed';

export type OfflineTripSession = {
  local_trip_id: string;
  server_trip_id: number | null;
  driver_id: number;
  started_at: string;
  start_latitude: number | null;
  start_longitude: number | null;
  ended_at: string | null;
  end_latitude: number | null;
  end_longitude: number | null;
  fare: number | null;
  distance_km: number | null;
  duration_seconds: number | null;
  status: OfflineTripSessionStatus;
  start_synced: 0 | 1;
  completed_synced: 0 | 1;
};

type OfflineTripStorageState = {
  nextPointId: number;
  nextMatchedPointId: number;
  nextStatusEventId: number;
  points: OfflineTripPoint[];
  matchedPoints: OfflineMatchedTripPoint[];
  statusEvents: OfflineTripStatusEvent[];
  sessions: OfflineTripSession[];
};

const STORAGE_KEY = 'triketrack-offline-web-v1';

let inMemoryState: OfflineTripStorageState | null = null;

const createEmptyState = (): OfflineTripStorageState => ({
  nextPointId: 1,
  nextMatchedPointId: 1,
  nextStatusEventId: 1,
  points: [],
  matchedPoints: [],
  statusEvents: [],
  sessions: [],
});

const getStorage = () => {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

const loadState = (): OfflineTripStorageState => {
  if (inMemoryState) {
    return inMemoryState;
  }

  const storage = getStorage();
  if (!storage) {
    inMemoryState = createEmptyState();
    return inMemoryState;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      inMemoryState = createEmptyState();
      return inMemoryState;
    }

    const parsed = JSON.parse(raw) as Partial<OfflineTripStorageState>;
    inMemoryState = {
      nextPointId: Number(parsed.nextPointId ?? 1),
      nextMatchedPointId: Number(parsed.nextMatchedPointId ?? 1),
      nextStatusEventId: Number(parsed.nextStatusEventId ?? 1),
      points: Array.isArray(parsed.points) ? (parsed.points as OfflineTripPoint[]) : [],
      matchedPoints: Array.isArray(parsed.matchedPoints)
        ? (parsed.matchedPoints as OfflineMatchedTripPoint[])
        : [],
      statusEvents: Array.isArray(parsed.statusEvents)
        ? (parsed.statusEvents as OfflineTripStatusEvent[])
        : [],
      sessions: Array.isArray(parsed.sessions) ? (parsed.sessions as OfflineTripSession[]) : [],
    };
    return inMemoryState;
  } catch {
    inMemoryState = createEmptyState();
    return inMemoryState;
  }
};

const saveState = (state: OfflineTripStorageState) => {
  inMemoryState = state;
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or serialization errors on web fallback storage.
  }
};

const mutateState = async (
  mutator: (state: OfflineTripStorageState) => void,
) => {
  const state = loadState();
  mutator(state);
  saveState(state);
};

const buildIdempotencyKey = ({
  localTripId,
  recordedAt,
  latitude,
  longitude,
  kind,
}: {
  localTripId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  kind: 'raw' | 'matched' | 'status';
}) => `${kind}:${localTripId}:${recordedAt}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`;

const buildStatusEventIdempotencyKey = ({
  localTripId,
  recordedAt,
  status,
  latitude,
  longitude,
}: {
  localTripId: string;
  recordedAt: string;
  status: OfflineTripStatusEventType;
  latitude?: number | null;
  longitude?: number | null;
}) =>
  `status:${localTripId}:${status}:${recordedAt}:${(latitude ?? 0).toFixed(6)}:${(longitude ?? 0).toFixed(6)}`;

const sortByRecordedAtAsc = <T extends { recorded_at: string; id: number }>(rows: T[]) =>
  [...rows].sort((left, right) => {
    const timeDiff =
      new Date(left.recorded_at).getTime() - new Date(right.recorded_at).getTime();
    return timeDiff !== 0 ? timeDiff : left.id - right.id;
  });

const sortSessionsByStartedAtAsc = (rows: OfflineTripSession[]) =>
  [...rows].sort(
    (left, right) =>
      new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
  );

export async function initOfflineTripStorage() {
  loadState();
}

export async function insertOfflineTripPoint(params: {
  localTripId: string;
  serverTripId?: number | null;
  driverId: number;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
  provider?: string | null;
  recordedAt: string;
  captureStatus?: OfflineTripCaptureStatus;
}) {
  const idempotencyKey = buildIdempotencyKey({
    localTripId: params.localTripId,
    recordedAt: params.recordedAt,
    latitude: params.latitude,
    longitude: params.longitude,
    kind: 'raw',
  });

  await mutateState((state) => {
    if (state.points.some((point) => point.idempotency_key === idempotencyKey)) {
      return;
    }

    state.points.push({
      id: state.nextPointId++,
      local_trip_id: params.localTripId,
      server_trip_id: params.serverTripId ?? null,
      driver_id: params.driverId,
      latitude: params.latitude,
      longitude: params.longitude,
      speed: params.speed ?? null,
      heading: params.heading ?? null,
      accuracy: params.accuracy ?? null,
      altitude: params.altitude ?? null,
      provider: params.provider ?? null,
      recorded_at: params.recordedAt,
      capture_status: params.captureStatus ?? 'online',
      sync_state: 'pending',
      synced: 0,
      idempotency_key: idempotencyKey,
    });
  });
}

export async function insertOfflineMatchedTripPoints(
  points: Array<{
    localTripId: string;
    serverTripId?: number | null;
    driverId: number;
    latitude: number;
    longitude: number;
    recordedAt: string;
    matchSource: OfflineMatchedPointSource;
  }>,
) {
  if (points.length === 0) {
    return;
  }

  await mutateState((state) => {
    for (const point of points) {
      const idempotencyKey = buildIdempotencyKey({
        localTripId: point.localTripId,
        recordedAt: point.recordedAt,
        latitude: point.latitude,
        longitude: point.longitude,
        kind: 'matched',
      });

      if (state.matchedPoints.some((row) => row.idempotency_key === idempotencyKey)) {
        continue;
      }

      state.matchedPoints.push({
        id: state.nextMatchedPointId++,
        local_trip_id: point.localTripId,
        server_trip_id: point.serverTripId ?? null,
        driver_id: point.driverId,
        latitude: point.latitude,
        longitude: point.longitude,
        recorded_at: point.recordedAt,
        match_source: point.matchSource,
        sync_state: 'pending',
        synced: 0,
        idempotency_key: idempotencyKey,
      });
    }
  });
}

export async function insertOfflineTripStatusEvent(params: {
  localTripId: string;
  serverTripId?: number | null;
  driverId: number;
  status: OfflineTripStatusEventType;
  recordedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  payload?: Record<string, unknown> | null;
}) {
  const idempotencyKey = buildStatusEventIdempotencyKey({
    localTripId: params.localTripId,
    recordedAt: params.recordedAt,
    status: params.status,
    latitude: params.latitude,
    longitude: params.longitude,
  });

  await mutateState((state) => {
    if (state.statusEvents.some((event) => event.idempotency_key === idempotencyKey)) {
      return;
    }

    state.statusEvents.push({
      id: state.nextStatusEventId++,
      local_trip_id: params.localTripId,
      server_trip_id: params.serverTripId ?? null,
      driver_id: params.driverId,
      status: params.status,
      recorded_at: params.recordedAt,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      payload_json: params.payload ? JSON.stringify(params.payload) : null,
      sync_state: 'pending',
      synced: 0,
      idempotency_key: idempotencyKey,
    });
  });
}

export async function attachServerTripIdToOfflineTrip(localTripId: string, serverTripId: number) {
  await mutateState((state) => {
    state.points = state.points.map((point) =>
      point.local_trip_id === localTripId ? { ...point, server_trip_id: serverTripId } : point,
    );
    state.matchedPoints = state.matchedPoints.map((point) =>
      point.local_trip_id === localTripId ? { ...point, server_trip_id: serverTripId } : point,
    );
    state.statusEvents = state.statusEvents.map((event) =>
      event.local_trip_id === localTripId ? { ...event, server_trip_id: serverTripId } : event,
    );
    state.sessions = state.sessions.map((session) =>
      session.local_trip_id === localTripId
        ? { ...session, server_trip_id: serverTripId, start_synced: 1 }
        : session,
    );
  });
}

export async function getUnsyncedOfflineTripPoints(limit = 500) {
  return sortByRecordedAtAsc(loadState().points.filter((point) => point.synced === 0)).slice(0, limit);
}

export async function getUnsyncedOfflineMatchedTripPoints(limit = 500) {
  return sortByRecordedAtAsc(
    loadState().matchedPoints.filter((point) => point.synced === 0),
  ).slice(0, limit);
}

export async function markOfflineTripPointsSynced(ids: number[]) {
  if (ids.length === 0) {
    return;
  }

  const idSet = new Set(ids);
  await mutateState((state) => {
    state.points = state.points.map((point) =>
      idSet.has(point.id) ? { ...point, synced: 1, sync_state: 'synced' } : point,
    );
  });
}

export async function markOfflineMatchedTripPointsSynced(ids: number[]) {
  if (ids.length === 0) {
    return;
  }

  const idSet = new Set(ids);
  await mutateState((state) => {
    state.matchedPoints = state.matchedPoints.map((point) =>
      idSet.has(point.id) ? { ...point, synced: 1, sync_state: 'synced' } : point,
    );
  });
}

export async function insertOfflineTripSession(params: {
  localTripId: string;
  serverTripId?: number | null;
  driverId: number;
  startedAt: string;
  startLatitude?: number | null;
  startLongitude?: number | null;
}) {
  await mutateState((state) => {
    const existingIndex = state.sessions.findIndex(
      (session) => session.local_trip_id === params.localTripId,
    );
    const existing = existingIndex >= 0 ? state.sessions[existingIndex] : null;
    const nextSession: OfflineTripSession = {
      local_trip_id: params.localTripId,
      server_trip_id: params.serverTripId ?? existing?.server_trip_id ?? null,
      driver_id: params.driverId,
      started_at: params.startedAt,
      start_latitude: params.startLatitude ?? null,
      start_longitude: params.startLongitude ?? null,
      ended_at: existing?.ended_at ?? null,
      end_latitude: existing?.end_latitude ?? null,
      end_longitude: existing?.end_longitude ?? null,
      fare: existing?.fare ?? null,
      distance_km: existing?.distance_km ?? null,
      duration_seconds: existing?.duration_seconds ?? null,
      status: existing?.status ?? 'ongoing',
      start_synced: params.serverTripId == null ? existing?.start_synced ?? 0 : 1,
      completed_synced: existing?.completed_synced ?? 0,
    };

    if (existingIndex >= 0) {
      state.sessions[existingIndex] = nextSession;
    } else {
      state.sessions.push(nextSession);
    }
  });
}

export async function completeOfflineTripSession(params: {
  localTripId: string;
  endLatitude?: number | null;
  endLongitude?: number | null;
  endedAt: string;
  fare: number;
  distanceKm: number;
  durationSeconds: number;
}) {
  await mutateState((state) => {
    state.sessions = state.sessions.map((session) =>
      session.local_trip_id === params.localTripId
        ? {
            ...session,
            ended_at: params.endedAt,
            end_latitude: params.endLatitude ?? null,
            end_longitude: params.endLongitude ?? null,
            fare: params.fare,
            distance_km: params.distanceKm,
            duration_seconds: params.durationSeconds,
            status: 'completed',
            completed_synced: 0,
          }
        : session,
    );
  });
}

export async function getOfflineTripSession(localTripId: string) {
  return loadState().sessions.find((session) => session.local_trip_id === localTripId);
}

export async function getOfflineTripSessionByServerTripId(serverTripId: number) {
  return [...loadState().sessions]
    .filter((session) => session.server_trip_id === serverTripId)
    .sort(
      (left, right) =>
        new Date(right.started_at).getTime() - new Date(left.started_at).getTime(),
    )[0];
}

export async function getLatestOngoingOfflineTripSession(driverId: number) {
  return [...loadState().sessions]
    .filter((session) => session.driver_id === driverId && session.status === 'ongoing')
    .sort(
      (left, right) =>
        new Date(right.started_at).getTime() - new Date(left.started_at).getTime(),
    )[0];
}

export async function getOfflineTripPointsByLocalTripId(localTripId: string) {
  return sortByRecordedAtAsc(
    loadState().points.filter((point) => point.local_trip_id === localTripId),
  );
}

export async function getOfflineMatchedTripPointsByLocalTripId(localTripId: string) {
  return sortByRecordedAtAsc(
    loadState().matchedPoints.filter((point) => point.local_trip_id === localTripId),
  );
}

export async function getOfflineTripStatusEventsByLocalTripId(localTripId: string) {
  return sortByRecordedAtAsc(
    loadState().statusEvents.filter((event) => event.local_trip_id === localTripId),
  );
}

export async function deleteOfflineTrip(localTripId: string) {
  await mutateState((state) => {
    state.points = state.points.filter((point) => point.local_trip_id !== localTripId);
    state.matchedPoints = state.matchedPoints.filter((point) => point.local_trip_id !== localTripId);
    state.statusEvents = state.statusEvents.filter((event) => event.local_trip_id !== localTripId);
    state.sessions = state.sessions.filter((session) => session.local_trip_id !== localTripId);
  });
}

export async function getPendingOfflineTripSessions(limit = 100) {
  return sortSessionsByStartedAtAsc(
    loadState().sessions.filter(
      (session) =>
        session.start_synced === 0 ||
        (session.status === 'completed' && session.completed_synced === 0),
    ),
  ).slice(0, limit);
}

export async function markOfflineTripSessionStartedSynced(localTripId: string, serverTripId: number) {
  await mutateState((state) => {
    state.sessions = state.sessions.map((session) =>
      session.local_trip_id === localTripId
        ? { ...session, server_trip_id: serverTripId, start_synced: 1 }
        : session,
    );
  });
}

export async function markOfflineTripSessionCompletedSynced(localTripId: string) {
  await mutateState((state) => {
    state.sessions = state.sessions.map((session) =>
      session.local_trip_id === localTripId
        ? { ...session, completed_synced: 1 }
        : session,
    );
  });
}
