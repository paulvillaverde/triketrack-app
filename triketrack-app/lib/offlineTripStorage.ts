import * as SQLite from 'expo-sqlite';

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

const DATABASE_NAME = 'triketrack-offline.db';
const POINTS_TABLE_NAME = 'offline_trip_points';
const MATCHED_POINTS_TABLE_NAME = 'offline_trip_matched_points';
const STATUS_EVENTS_TABLE_NAME = 'offline_trip_status_events';
const SESSIONS_TABLE_NAME = 'offline_trip_sessions';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbPromise;
};

const runBestEffortStatement = async (statement: string) => {
  const db = await getDb();
  try {
    await db.execAsync(statement);
  } catch {
    // Ignore upgrade statements that already ran on a prior app launch.
  }
};

const ensureTableColumn = async (
  tableName: string,
  columnName: string,
  columnDefinition: string,
) => {
  const db = await getDb();
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
};

const ensureOfflineTripStorageInitialized = async () => {
  await initOfflineTripStorage();
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

export async function initOfflineTripStorage() {
  if (!initPromise) {
    initPromise = initOfflineTripStorageInternal().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  await initPromise;
}

async function initOfflineTripStorageInternal() {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${POINTS_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_trip_id TEXT NOT NULL,
      server_trip_id INTEGER,
      driver_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      speed REAL,
      heading REAL,
      accuracy REAL,
      altitude REAL,
      provider TEXT,
      recorded_at TEXT NOT NULL,
      capture_status TEXT NOT NULL DEFAULT 'online',
      sync_state TEXT NOT NULL DEFAULT 'pending',
      synced INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL,
      CHECK (capture_status IN ('online', 'offline')),
      CHECK (sync_state IN ('pending', 'synced'))
    );
    CREATE INDEX IF NOT EXISTS idx_${POINTS_TABLE_NAME}_synced_recorded_at
      ON ${POINTS_TABLE_NAME} (synced, recorded_at, id ASC);
    CREATE INDEX IF NOT EXISTS idx_${POINTS_TABLE_NAME}_local_trip_id
      ON ${POINTS_TABLE_NAME} (local_trip_id, recorded_at, id ASC);

    CREATE TABLE IF NOT EXISTS ${MATCHED_POINTS_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_trip_id TEXT NOT NULL,
      server_trip_id INTEGER,
      driver_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      match_source TEXT NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'pending',
      synced INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL,
      CHECK (match_source IN ('service', 'local-fallback', 'local-heuristic', 'reconstructed')),
      CHECK (sync_state IN ('pending', 'synced'))
    );
    CREATE INDEX IF NOT EXISTS idx_${MATCHED_POINTS_TABLE_NAME}_synced_recorded_at
      ON ${MATCHED_POINTS_TABLE_NAME} (synced, recorded_at, id ASC);
    CREATE INDEX IF NOT EXISTS idx_${MATCHED_POINTS_TABLE_NAME}_local_trip_id
      ON ${MATCHED_POINTS_TABLE_NAME} (local_trip_id, recorded_at, id ASC);

    CREATE TABLE IF NOT EXISTS ${STATUS_EVENTS_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_trip_id TEXT NOT NULL,
      server_trip_id INTEGER,
      driver_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      payload_json TEXT,
      sync_state TEXT NOT NULL DEFAULT 'pending',
      synced INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL,
      CHECK (status IN ('trip_started', 'movement_confirmed', 'trip_completed', 'connectivity_offline', 'connectivity_online', 'app_recovered')),
      CHECK (sync_state IN ('pending', 'synced'))
    );
    CREATE INDEX IF NOT EXISTS idx_${STATUS_EVENTS_TABLE_NAME}_local_trip_id
      ON ${STATUS_EVENTS_TABLE_NAME} (local_trip_id, recorded_at, id ASC);

    CREATE TABLE IF NOT EXISTS ${SESSIONS_TABLE_NAME} (
      local_trip_id TEXT PRIMARY KEY NOT NULL,
      server_trip_id INTEGER,
      driver_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      start_latitude REAL,
      start_longitude REAL,
      ended_at TEXT,
      end_latitude REAL,
      end_longitude REAL,
      fare REAL,
      distance_km REAL,
      duration_seconds INTEGER,
      status TEXT NOT NULL,
      start_synced INTEGER NOT NULL DEFAULT 0,
      completed_synced INTEGER NOT NULL DEFAULT 0,
      CHECK (status IN ('ongoing', 'completed'))
    );
    CREATE INDEX IF NOT EXISTS idx_${SESSIONS_TABLE_NAME}_start_sync
      ON ${SESSIONS_TABLE_NAME} (start_synced, started_at);
    CREATE INDEX IF NOT EXISTS idx_${SESSIONS_TABLE_NAME}_complete_sync
      ON ${SESSIONS_TABLE_NAME} (completed_synced, status, started_at);
    CREATE INDEX IF NOT EXISTS idx_${SESSIONS_TABLE_NAME}_driver_status
      ON ${SESSIONS_TABLE_NAME} (driver_id, status, started_at DESC);
  `);

  for (const statement of [
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN speed REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN heading REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN accuracy REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN altitude REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN provider TEXT`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN capture_status TEXT NOT NULL DEFAULT 'online'`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN idempotency_key TEXT`,
  ]) {
    await runBestEffortStatement(statement);
  }

  await ensureTableColumn(POINTS_TABLE_NAME, 'speed', 'REAL');
  await ensureTableColumn(POINTS_TABLE_NAME, 'heading', 'REAL');
  await ensureTableColumn(POINTS_TABLE_NAME, 'accuracy', 'REAL');
  await ensureTableColumn(POINTS_TABLE_NAME, 'altitude', 'REAL');
  await ensureTableColumn(POINTS_TABLE_NAME, 'provider', 'TEXT');
  await ensureTableColumn(POINTS_TABLE_NAME, 'capture_status', "TEXT NOT NULL DEFAULT 'online'");
  await ensureTableColumn(POINTS_TABLE_NAME, 'sync_state', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureTableColumn(POINTS_TABLE_NAME, 'idempotency_key', 'TEXT');
  await ensureTableColumn(MATCHED_POINTS_TABLE_NAME, 'sync_state', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureTableColumn(MATCHED_POINTS_TABLE_NAME, 'idempotency_key', 'TEXT');
  await ensureTableColumn(STATUS_EVENTS_TABLE_NAME, 'payload_json', 'TEXT');
  await ensureTableColumn(STATUS_EVENTS_TABLE_NAME, 'sync_state', "TEXT NOT NULL DEFAULT 'pending'");
  await ensureTableColumn(STATUS_EVENTS_TABLE_NAME, 'idempotency_key', 'TEXT');

  await runBestEffortStatement(
    `UPDATE ${POINTS_TABLE_NAME}
     SET sync_state = CASE WHEN synced = 1 THEN 'synced' ELSE 'pending' END
     WHERE sync_state IS NULL OR sync_state = ''`,
  );
  await runBestEffortStatement(
    `UPDATE ${POINTS_TABLE_NAME}
     SET idempotency_key =
       'raw:' || local_trip_id || ':' || recorded_at || ':' ||
       printf('%.6f', latitude) || ':' || printf('%.6f', longitude)
     WHERE idempotency_key IS NULL OR idempotency_key = ''`,
  );
  await runBestEffortStatement(
    `UPDATE ${MATCHED_POINTS_TABLE_NAME}
     SET sync_state = CASE WHEN synced = 1 THEN 'synced' ELSE 'pending' END
     WHERE sync_state IS NULL OR sync_state = ''`,
  );
  await runBestEffortStatement(
    `UPDATE ${MATCHED_POINTS_TABLE_NAME}
     SET idempotency_key =
       'matched:' || local_trip_id || ':' || recorded_at || ':' ||
       printf('%.6f', latitude) || ':' || printf('%.6f', longitude)
     WHERE idempotency_key IS NULL OR idempotency_key = ''`,
  );
  await runBestEffortStatement(
    `UPDATE ${STATUS_EVENTS_TABLE_NAME}
     SET sync_state = CASE WHEN synced = 1 THEN 'synced' ELSE 'pending' END
     WHERE sync_state IS NULL OR sync_state = ''`,
  );
  await runBestEffortStatement(
    `UPDATE ${STATUS_EVENTS_TABLE_NAME}
     SET idempotency_key =
       'status:' || local_trip_id || ':' || status || ':' || recorded_at || ':' ||
       printf('%.6f', COALESCE(latitude, 0)) || ':' || printf('%.6f', COALESCE(longitude, 0))
     WHERE idempotency_key IS NULL OR idempotency_key = ''`,
  );
  await runBestEffortStatement(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${POINTS_TABLE_NAME}_idempotency
     ON ${POINTS_TABLE_NAME} (idempotency_key)`,
  );
  await runBestEffortStatement(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${MATCHED_POINTS_TABLE_NAME}_idempotency
     ON ${MATCHED_POINTS_TABLE_NAME} (idempotency_key)`,
  );
  await runBestEffortStatement(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${STATUS_EVENTS_TABLE_NAME}_idempotency
     ON ${STATUS_EVENTS_TABLE_NAME} (idempotency_key)`,
  );
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
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  const idempotencyKey = buildIdempotencyKey({
    localTripId: params.localTripId,
    recordedAt: params.recordedAt,
    latitude: params.latitude,
    longitude: params.longitude,
    kind: 'raw',
  });
  await db.runAsync(
    `INSERT OR IGNORE INTO ${POINTS_TABLE_NAME} (
      local_trip_id,
      server_trip_id,
      driver_id,
      latitude,
      longitude,
      speed,
      heading,
      accuracy,
      altitude,
      provider,
      recorded_at,
      capture_status,
      sync_state,
      synced,
      idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    params.localTripId,
    params.serverTripId ?? null,
    params.driverId,
    params.latitude,
    params.longitude,
    params.speed ?? null,
    params.heading ?? null,
    params.accuracy ?? null,
    params.altitude ?? null,
    params.provider ?? null,
    params.recordedAt,
    params.captureStatus ?? 'online',
    idempotencyKey,
  );
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

  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  for (const point of points) {
    const idempotencyKey = buildIdempotencyKey({
      localTripId: point.localTripId,
      recordedAt: point.recordedAt,
      latitude: point.latitude,
      longitude: point.longitude,
      kind: 'matched',
    });

    await db.runAsync(
      `INSERT OR IGNORE INTO ${MATCHED_POINTS_TABLE_NAME} (
        local_trip_id,
        server_trip_id,
        driver_id,
        latitude,
        longitude,
        recorded_at,
        match_source,
        sync_state,
        synced,
        idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      point.localTripId,
      point.serverTripId ?? null,
      point.driverId,
      point.latitude,
      point.longitude,
      point.recordedAt,
      point.matchSource,
      idempotencyKey,
    );
  }
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
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  const idempotencyKey = buildStatusEventIdempotencyKey({
    localTripId: params.localTripId,
    recordedAt: params.recordedAt,
    status: params.status,
    latitude: params.latitude,
    longitude: params.longitude,
  });

  await db.runAsync(
    `INSERT OR IGNORE INTO ${STATUS_EVENTS_TABLE_NAME} (
      local_trip_id,
      server_trip_id,
      driver_id,
      status,
      recorded_at,
      latitude,
      longitude,
      payload_json,
      sync_state,
      synced,
      idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    params.localTripId,
    params.serverTripId ?? null,
    params.driverId,
    params.status,
    params.recordedAt,
    params.latitude ?? null,
    params.longitude ?? null,
    params.payload ? JSON.stringify(params.payload) : null,
    idempotencyKey,
  );
}

export async function attachServerTripIdToOfflineTrip(localTripId: string, serverTripId: number) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${POINTS_TABLE_NAME}
     SET server_trip_id = ?
     WHERE local_trip_id = ?`,
    serverTripId,
    localTripId,
  );

  await db.runAsync(
    `UPDATE ${MATCHED_POINTS_TABLE_NAME}
     SET server_trip_id = ?
     WHERE local_trip_id = ?`,
    serverTripId,
    localTripId,
  );

  await db.runAsync(
    `UPDATE ${STATUS_EVENTS_TABLE_NAME}
     SET server_trip_id = ?
     WHERE local_trip_id = ?`,
    serverTripId,
    localTripId,
  );

  await db.runAsync(
    `UPDATE ${SESSIONS_TABLE_NAME}
     SET server_trip_id = ?, start_synced = 1
     WHERE local_trip_id = ?`,
    serverTripId,
    localTripId,
  );
}

export async function getUnsyncedOfflineTripPoints(limit = 500) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineTripPoint>(
    `SELECT
       id,
       local_trip_id,
       server_trip_id,
       driver_id,
       latitude,
       longitude,
       speed,
       heading,
       accuracy,
       altitude,
       provider,
       recorded_at,
       capture_status,
       sync_state,
       synced,
       idempotency_key
     FROM ${POINTS_TABLE_NAME}
     WHERE synced = 0
     ORDER BY recorded_at ASC, id ASC
     LIMIT ?`,
    limit,
  );
}

export async function getUnsyncedOfflineMatchedTripPoints(limit = 500) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineMatchedTripPoint>(
    `SELECT
       id,
       local_trip_id,
       server_trip_id,
       driver_id,
       latitude,
       longitude,
       recorded_at,
       match_source,
       sync_state,
       synced,
       idempotency_key
     FROM ${MATCHED_POINTS_TABLE_NAME}
     WHERE synced = 0
     ORDER BY recorded_at ASC, id ASC
     LIMIT ?`,
    limit,
  );
}

export async function markOfflineTripPointsSynced(ids: number[]) {
  if (ids.length === 0) {
    return;
  }
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE ${POINTS_TABLE_NAME}
     SET synced = 1, sync_state = 'synced'
     WHERE id IN (${placeholders})`,
    ...ids,
  );
}

export async function markOfflineMatchedTripPointsSynced(ids: number[]) {
  if (ids.length === 0) {
    return;
  }
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE ${MATCHED_POINTS_TABLE_NAME}
     SET synced = 1, sync_state = 'synced'
     WHERE id IN (${placeholders})`,
    ...ids,
  );
}

export async function insertOfflineTripSession(params: {
  localTripId: string;
  serverTripId?: number | null;
  driverId: number;
  startedAt: string;
  startLatitude?: number | null;
  startLongitude?: number | null;
}) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${SESSIONS_TABLE_NAME} (
      local_trip_id,
      server_trip_id,
      driver_id,
      started_at,
      start_latitude,
      start_longitude,
      ended_at,
      end_latitude,
      end_longitude,
      fare,
      distance_km,
      duration_seconds,
      status,
      start_synced,
      completed_synced
    ) VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      COALESCE((SELECT ended_at FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT end_latitude FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT end_longitude FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT fare FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT distance_km FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT duration_seconds FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), NULL),
      COALESCE((SELECT status FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), 'ongoing'),
      CASE WHEN ? IS NULL THEN COALESCE((SELECT start_synced FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), 0) ELSE 1 END,
      COALESCE((SELECT completed_synced FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?), 0)
    )`,
    params.localTripId,
    params.serverTripId ?? null,
    params.driverId,
    params.startedAt,
    params.startLatitude ?? null,
    params.startLongitude ?? null,
    params.localTripId,
    params.localTripId,
    params.localTripId,
    params.localTripId,
    params.localTripId,
    params.localTripId,
    params.localTripId,
    params.serverTripId ?? null,
    params.localTripId,
    params.localTripId,
  );
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
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SESSIONS_TABLE_NAME}
     SET
       ended_at = ?,
       end_latitude = ?,
       end_longitude = ?,
       fare = ?,
       distance_km = ?,
       duration_seconds = ?,
       status = 'completed',
       completed_synced = 0
     WHERE local_trip_id = ?`,
    params.endedAt,
    params.endLatitude ?? null,
    params.endLongitude ?? null,
    params.fare,
    params.distanceKm,
    params.durationSeconds,
    params.localTripId,
  );
}

export async function getOfflineTripSession(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getFirstAsync<OfflineTripSession>(
    `SELECT
       local_trip_id,
       server_trip_id,
       driver_id,
       started_at,
       start_latitude,
       start_longitude,
       ended_at,
       end_latitude,
       end_longitude,
       fare,
       distance_km,
       duration_seconds,
       status,
       start_synced,
       completed_synced
     FROM ${SESSIONS_TABLE_NAME}
     WHERE local_trip_id = ?`,
    localTripId,
  );
}

export async function getOfflineTripSessionByServerTripId(serverTripId: number) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getFirstAsync<OfflineTripSession>(
    `SELECT
       local_trip_id,
       server_trip_id,
       driver_id,
       started_at,
       start_latitude,
       start_longitude,
       ended_at,
       end_latitude,
       end_longitude,
       fare,
       distance_km,
       duration_seconds,
       status,
       start_synced,
       completed_synced
     FROM ${SESSIONS_TABLE_NAME}
     WHERE server_trip_id = ?
     ORDER BY started_at DESC
     LIMIT 1`,
    serverTripId,
  );
}

export async function getLatestOngoingOfflineTripSession(driverId: number) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getFirstAsync<OfflineTripSession>(
    `SELECT
       local_trip_id,
       server_trip_id,
       driver_id,
       started_at,
       start_latitude,
       start_longitude,
       ended_at,
       end_latitude,
       end_longitude,
       fare,
       distance_km,
       duration_seconds,
       status,
       start_synced,
       completed_synced
     FROM ${SESSIONS_TABLE_NAME}
     WHERE driver_id = ? AND status = 'ongoing'
     ORDER BY started_at DESC
     LIMIT 1`,
    driverId,
  );
}

export async function getOfflineTripPointsByLocalTripId(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineTripPoint>(
    `SELECT
       id,
       local_trip_id,
       server_trip_id,
       driver_id,
       latitude,
       longitude,
       speed,
       heading,
       accuracy,
       altitude,
       provider,
       recorded_at,
       capture_status,
       sync_state,
       synced,
       idempotency_key
     FROM ${POINTS_TABLE_NAME}
     WHERE local_trip_id = ?
     ORDER BY recorded_at ASC, id ASC`,
    localTripId,
  );
}

export async function getOfflineMatchedTripPointsByLocalTripId(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineMatchedTripPoint>(
    `SELECT
       id,
       local_trip_id,
       server_trip_id,
       driver_id,
       latitude,
       longitude,
       recorded_at,
       match_source,
       sync_state,
       synced,
       idempotency_key
     FROM ${MATCHED_POINTS_TABLE_NAME}
     WHERE local_trip_id = ?
     ORDER BY recorded_at ASC, id ASC`,
    localTripId,
  );
}

export async function getOfflineTripStatusEventsByLocalTripId(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineTripStatusEvent>(
    `SELECT
       id,
       local_trip_id,
       server_trip_id,
       driver_id,
       status,
       recorded_at,
       latitude,
       longitude,
       payload_json,
       sync_state,
       synced,
       idempotency_key
     FROM ${STATUS_EVENTS_TABLE_NAME}
     WHERE local_trip_id = ?
     ORDER BY recorded_at ASC, id ASC`,
    localTripId,
  );
}

export async function deleteOfflineTrip(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${POINTS_TABLE_NAME} WHERE local_trip_id = ?`, localTripId);
  await db.runAsync(`DELETE FROM ${MATCHED_POINTS_TABLE_NAME} WHERE local_trip_id = ?`, localTripId);
  await db.runAsync(`DELETE FROM ${STATUS_EVENTS_TABLE_NAME} WHERE local_trip_id = ?`, localTripId);
  await db.runAsync(`DELETE FROM ${SESSIONS_TABLE_NAME} WHERE local_trip_id = ?`, localTripId);
}

export async function getPendingOfflineTripSessions(limit = 100) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  return db.getAllAsync<OfflineTripSession>(
    `SELECT
       local_trip_id,
       server_trip_id,
       driver_id,
       started_at,
       start_latitude,
       start_longitude,
       ended_at,
       end_latitude,
       end_longitude,
       fare,
       distance_km,
       duration_seconds,
       status,
       start_synced,
       completed_synced
     FROM ${SESSIONS_TABLE_NAME}
     WHERE start_synced = 0
        OR (status = 'completed' AND completed_synced = 0)
     ORDER BY started_at ASC
     LIMIT ?`,
    limit,
  );
}

export async function markOfflineTripSessionStartedSynced(localTripId: string, serverTripId: number) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SESSIONS_TABLE_NAME}
     SET server_trip_id = ?, start_synced = 1
     WHERE local_trip_id = ?`,
    serverTripId,
    localTripId,
  );
}

export async function markOfflineTripSessionCompletedSynced(localTripId: string) {
  await ensureOfflineTripStorageInitialized();
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SESSIONS_TABLE_NAME}
     SET completed_synced = 1
     WHERE local_trip_id = ?`,
    localTripId,
  );
}
