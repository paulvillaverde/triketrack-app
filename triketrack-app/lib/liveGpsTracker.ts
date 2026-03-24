import * as Location from 'expo-location';

export type LiveGpsSample = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestampMs: number;
};

type StartLiveGpsTrackerParams = {
  onSeed: (sample: LiveGpsSample) => void;
  onUpdate: (sample: LiveGpsSample) => void;
  onError?: (error: unknown) => void;
  minMoveMeters?: number;
  initialTimeoutMs?: number;
  watchIntervalMs?: number;
  lastKnownMaxAgeMs?: number;
  lastKnownRequiredAccuracyMeters?: number;
};

const distanceMetersBetween = (from: LiveGpsSample, to: LiveGpsSample) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const toLiveGpsSample = (location: Location.LocationObject): LiveGpsSample => ({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy,
  heading: location.coords.heading,
  speed: location.coords.speed,
  timestampMs: location.timestamp,
});

export async function startLiveGpsTracker(params: StartLiveGpsTrackerParams) {
  const {
    onSeed,
    onUpdate,
    onError,
    minMoveMeters = 4,
    initialTimeoutMs = 4000,
    watchIntervalMs = 1000,
    lastKnownMaxAgeMs = 15000,
    lastKnownRequiredAccuracyMeters = 250,
  } = params;

  let cancelled = false;
  let subscription: Location.LocationSubscription | null = null;
  let lastMovementSample: LiveGpsSample | null = null;

  const emitMovementIfNeeded = (sample: LiveGpsSample) => {
    if (!lastMovementSample) {
      lastMovementSample = sample;
      return;
    }

    if (distanceMetersBetween(lastMovementSample, sample) >= minMoveMeters) {
      lastMovementSample = sample;
      onUpdate(sample);
    }
  };

  try {
    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission =
      existingPermission.status === 'granted'
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();

    if (cancelled || permission.status !== 'granted') {
      return {
        stop: () => {
          cancelled = true;
          subscription?.remove();
        },
      };
    }

    try {
      const lastKnownLocation = await Location.getLastKnownPositionAsync({
        maxAge: lastKnownMaxAgeMs,
        requiredAccuracy: lastKnownRequiredAccuracyMeters,
      });

      if (lastKnownLocation && !cancelled) {
        const sample = toLiveGpsSample(lastKnownLocation as Location.LocationObject);
        onSeed(sample);
        lastMovementSample = sample;
      }
    } catch (error) {
      onError?.(error);
    }

    const initialLocationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      mayShowUserSettingsDialog: true,
    }).catch((error) => {
      onError?.(error);
      return null;
    });

    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: watchIntervalMs,
        distanceInterval: 1,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        if (cancelled) {
          return;
        }

        emitMovementIfNeeded(toLiveGpsSample(location));
      },
    );

    const firstCurrentLocation = await Promise.race<Location.LocationObject | null>([
      initialLocationPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), initialTimeoutMs)),
    ]);

    if (firstCurrentLocation && !cancelled) {
      const sample = toLiveGpsSample(firstCurrentLocation);
      onSeed(sample);
      if (!lastMovementSample) {
        lastMovementSample = sample;
      }
    }
  } catch (error) {
    onError?.(error);
  }

  return {
    stop: () => {
      cancelled = true;
      subscription?.remove();
    },
  };
}
