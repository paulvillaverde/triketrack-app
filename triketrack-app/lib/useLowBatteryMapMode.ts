import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Battery from 'expo-battery';

const LOW_BATTERY_MAP_THRESHOLD = 0.15;
const LOW_BATTERY_MAP_THRESHOLD_TOLERANCE = 0.01;
const BATTERY_LEVEL_POLL_INTERVAL_MS = 30_000;

const isLowBatteryLevel = (batteryLevel: number | null | undefined) =>
  typeof batteryLevel === 'number' &&
  Number.isFinite(batteryLevel) &&
  batteryLevel >= 0 &&
  batteryLevel <= LOW_BATTERY_MAP_THRESHOLD + LOW_BATTERY_MAP_THRESHOLD_TOLERANCE;

export const useLowBatteryMapMode = () => {
  const [isLowBatteryMapMode, setIsLowBatteryMapMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove: () => void } | undefined;
    let appStateSubscription: { remove: () => void } | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const updateBatteryLevel = (batteryLevel: number | null | undefined) => {
      if (!isMounted) {
        return;
      }

      setIsLowBatteryMapMode(isLowBatteryLevel(batteryLevel));
    };

    const refreshBatteryLevel = async () => {
      try {
        const isAvailable = await Battery.isAvailableAsync();
        if (!isAvailable) {
          return;
        }

        updateBatteryLevel(await Battery.getBatteryLevelAsync());
      } catch (error) {
        console.warn('[Battery] Failed to read battery level.', error);
      }
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshBatteryLevel();
      }
    };

    void (async () => {
      const isAvailable = await Battery.isAvailableAsync();
      if (!isAvailable || !isMounted) {
        return;
      }

      await refreshBatteryLevel();
      if (!isMounted) {
        return;
      }

      subscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        updateBatteryLevel(batteryLevel);
      });
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
      pollTimer = setInterval(() => {
        if (AppState.currentState === 'active') {
          void refreshBatteryLevel();
        }
      }, BATTERY_LEVEL_POLL_INTERVAL_MS);
    })().catch((error) => {
      console.warn('[Battery] Failed to initialize battery monitoring.', error);
    });

    return () => {
      isMounted = false;
      subscription?.remove();
      appStateSubscription?.remove();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, []);

  return isLowBatteryMapMode;
};
