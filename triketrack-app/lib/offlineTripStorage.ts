import * as SQLite from 'expo-sqlite';

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
  recorded_at: string;
  synced: 0 | 1;
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
const SESSIONS_TABLE_NAME = 'offline_trip_sessions';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbPromise;
};

export async function initOfflineTripStorage() {
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
      recorded_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_${POINTS_TABLE_NAME}_synced_recorded_at
      ON ${POINTS_TABLE_NAME} (synced, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_${POINTS_TABLE_NAME}_local_trip_id
      ON ${POINTS_TABLE_NAME} (local_trip_id);

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
  `);

  for (const statement of [
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN speed REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN heading REAL`,
    `ALTER TABLE ${POINTS_TABLE_NAME} ADD COLUMN accuracy REAL`,
  ]) {
    try {
      await db.execAsync(statement);
    } catch {
      // Column already exists on upgraded devices.
    }
  }
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
  recordedAt: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO ${POINTS_TABLE_NAME} (
      local_trip_id,
      server_trip_id,
      driver_id,
      latitude,
      longitude,
      speed,
      heading,
      accuracy,
      recorded_at,
      synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    params.localTripId,
    params.serverTripId ?? null,
    params.driverId,
    params.latitude,
    params.longitude,
    params.speed ?? null,
    params.heading ?? null,
    params.accuracy ?? null,
    params.recordedAt,
  );
}

export async function attachServerTripIdToOfflineTrip(localTripId: string, serverTripId: number) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${POINTS_TABLE_NAME}
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
  const db = await getDb();
  const rows = await db.getAllAsync<OfflineTripPoint>(
    `SELECT id, local_trip_id, server_trip_id, driver_id, latitude, longitude, speed, heading, accuracy, recorded_at, synced
     FROM ${POINTS_TABLE_NAME}
     WHERE synced = 0
     ORDER BY recorded_at ASC, id ASC
     LIMIT ?`,
    limit,
  );
  return rows;
}

export async function markOfflineTripPointsSynced(ids: number[]) {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE ${POINTS_TABLE_NAME}
     SET synced = 1
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

export async function getOfflineTripPointsByLocalTripId(localTripId: string) {
  const db = await getDb();
  return db.getAllAsync<OfflineTripPoint>(
    `SELECT id, local_trip_id, server_trip_id, driver_id, latitude, longitude, speed, heading, accuracy, recorded_at, synced
     FROM ${POINTS_TABLE_NAME}
     WHERE local_trip_id = ?
     ORDER BY recorded_at ASC, id ASC`,
    localTripId,
  );
}

export async function getPendingOfflineTripSessions(limit = 100) {
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
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${SESSIONS_TABLE_NAME}
     SET completed_synced = 1
     WHERE local_trip_id = ?`,
    localTripId,
  );
}
