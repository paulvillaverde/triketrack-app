import * as Location from 'expo-location';

export type LiveGpsSample = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  altitude?: number | null;
  provider?: string | null;
  timestampMs: number;
};

type StartLiveGpsTrackerParams = {
  onSeed: (sample: LiveGpsSample) => void;
  onUpdate: (sample: LiveGpsSample) => void;
  onError?: (error: unknown) => void;
  initialTimeoutMs?: number;
  watchIntervalMs?: number;
  distanceIntervalMeters?: number;
  minimumPointDistanceMeters?: number;
  staleSampleThresholdMs?: number;
  accuracy?: Location.Accuracy;
};

const toRad = (value: number) => (value * Math.PI) / 180;

const distanceBetweenMeters = (
  from: Pick<LiveGpsSample, 'latitude' | 'longitude'>,
  to: Pick<LiveGpsSample, 'latitude' | 'longitude'>,
) => {
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
  heading:
    typeof location.coords.heading === 'number' && Number.isFinite(location.coords.heading)
      ? location.coords.heading
      : null,
  speed:
    typeof location.coords.speed === 'number' && Number.isFinite(location.coords.speed)
      ? location.coords.speed
      : null,
  altitude:
    typeof location.coords.altitude === 'number' && Number.isFinite(location.coords.altitude)
      ? location.coords.altitude
      : null,
  provider: 'expo-location',
  timestampMs: location.timestamp,
});

export async function startLiveGpsTracker(params: StartLiveGpsTrackerParams) {
  const {
    onSeed,
    onUpdate,
    onError,
    initialTimeoutMs = 4000,
    watchIntervalMs = 1000,
    distanceIntervalMeters = 1,
    minimumPointDistanceMeters = 0,
    staleSampleThresholdMs = 4000,
    accuracy = Location.Accuracy.BestForNavigation,
  } = params;

  let cancelled = false;
  let subscription: Location.LocationSubscription | null = null;
  let firstFreshSampleEmitted = false;
  let latestSampleTimestampMs = 0;
  let lastDeliveredSample: LiveGpsSample | null = null;

  const isFreshEnough = (sample: LiveGpsSample) =>
    sample.timestampMs > 0 && Date.now() - sample.timestampMs <= staleSampleThresholdMs;

  const emitIfFresh = (sample: LiveGpsSample, mode: 'seed' | 'update') => {
    if (!isFreshEnough(sample)) {
      return;
    }

    if (sample.timestampMs < latestSampleTimestampMs) {
      return;
    }

    latestSampleTimestampMs = sample.timestampMs;

    if (
      mode === 'update' &&
      lastDeliveredSample &&
      minimumPointDistanceMeters > 0 &&
      distanceBetweenMeters(lastDeliveredSample, sample) < minimumPointDistanceMeters
    ) {
      return;
    }

    if (!firstFreshSampleEmitted || mode === 'seed') {
      firstFreshSampleEmitted = true;
      lastDeliveredSample = sample;
      onSeed(sample);
      return;
    }

    lastDeliveredSample = sample;
    onUpdate(sample);
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

    const initialLocationPromise = Location.getCurrentPositionAsync({
      accuracy,
      mayShowUserSettingsDialog: true,
    }).catch((error) => {
      onError?.(error);
      return null;
    });

    subscription = await Location.watchPositionAsync(
      {
        accuracy,
        timeInterval: watchIntervalMs,
        distanceInterval: distanceIntervalMeters,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        if (cancelled) {
          return;
        }

        emitIfFresh(toLiveGpsSample(location), 'update');
      },
    );

    const firstCurrentLocation = await Promise.race<Location.LocationObject | null>([
      initialLocationPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), initialTimeoutMs)),
    ]);

    if (firstCurrentLocation && !cancelled) {
      const sample = toLiveGpsSample(firstCurrentLocation);
      emitIfFresh(sample, 'seed');
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
