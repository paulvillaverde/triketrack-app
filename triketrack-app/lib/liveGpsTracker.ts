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
  initialTimeoutMs?: number;
  watchIntervalMs?: number;
  distanceIntervalMeters?: number;
  staleSampleThresholdMs?: number;
  accuracy?: Location.Accuracy;
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
    staleSampleThresholdMs = 4000,
    accuracy = Location.Accuracy.BestForNavigation,
  } = params;

  let cancelled = false;
  let subscription: Location.LocationSubscription | null = null;
  let firstFreshSampleEmitted = false;
  let latestSampleTimestampMs = 0;

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

    if (!firstFreshSampleEmitted || mode === 'seed') {
      firstFreshSampleEmitted = true;
      onSeed(sample);
      return;
    }

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
