import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync';
import dismissNotificationAsync from 'expo-notifications/build/dismissNotificationAsync';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { IosAuthorizationStatus } from 'expo-notifications/build/NotificationPermissions.types';
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';

const GPS_WARMUP_NOTIFICATION_ID = 'triketrack-gps-warmup';
const GPS_WARMUP_CHANNEL_ID = 'trip-gps';

let hasConfiguredNotificationHandler = false;
let hasConfiguredAndroidChannel = false;

const configureNotificationHandler = () => {
  if (hasConfiguredNotificationHandler) {
    return;
  }

  hasConfiguredNotificationHandler = true;
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
};

const ensureGpsNotificationReady = async () => {
  configureNotificationHandler();

  const existingPermission = await getPermissionsAsync();
  const permission =
    existingPermission.granted || existingPermission.ios?.status === IosAuthorizationStatus.PROVISIONAL
      ? existingPermission
      : await requestPermissionsAsync();

  if (!permission.granted && permission.ios?.status !== IosAuthorizationStatus.PROVISIONAL) {
    return false;
  }

  if (Platform.OS === 'android' && !hasConfiguredAndroidChannel) {
    hasConfiguredAndroidChannel = true;
    await setNotificationChannelAsync(GPS_WARMUP_CHANNEL_ID, {
      name: 'Trip GPS',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0],
      sound: null,
    });
  }

  return true;
};

const showGpsWarmupNotification = async (body: string) => {
  const isReady = await ensureGpsNotificationReady();
  if (!isReady) {
    return false;
  }

  await dismissNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await cancelScheduledNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await scheduleNotificationAsync({
    identifier: GPS_WARMUP_NOTIFICATION_ID,
    content: {
      title: 'Getting stable GPS',
      body,
      data: { kind: 'gps-warmup' },
      sound: false,
    },
    trigger: Platform.OS === 'android' ? { channelId: GPS_WARMUP_CHANNEL_ID } : null,
  });

  return true;
};

const dismissGpsWarmupNotification = async () => {
  await cancelScheduledNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await dismissNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
};

export const useGpsWarmupNotification = (active: boolean, body: string) => {
  const isShowingRef = useRef(false);
  const bodyRef = useRef(body);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    let cancelled = false;

    if (active && !isShowingRef.current) {
      void showGpsWarmupNotification(bodyRef.current).then((shown) => {
        if (!cancelled && shown) {
          isShowingRef.current = true;
        }
      });
    }

    if (!active && isShowingRef.current) {
      isShowingRef.current = false;
      void dismissGpsWarmupNotification();
    }

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    return () => {
      if (isShowingRef.current) {
        isShowingRef.current = false;
        void dismissGpsWarmupNotification();
      }
    };
  }, []);
};
