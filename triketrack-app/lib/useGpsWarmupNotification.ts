import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const GPS_WARMUP_NOTIFICATION_ID = 'triketrack-gps-warmup';
const GPS_WARMUP_CHANNEL_ID = 'trip-gps';

let hasConfiguredNotificationHandler = false;
let hasConfiguredAndroidChannel = false;

const configureNotificationHandler = () => {
  if (hasConfiguredNotificationHandler) {
    return;
  }

  hasConfiguredNotificationHandler = true;
  Notifications.setNotificationHandler({
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

  const existingPermission = await Notifications.getPermissionsAsync();
  const permission =
    existingPermission.granted ||
    existingPermission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? existingPermission
      : await Notifications.requestPermissionsAsync();

  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return false;
  }

  if (Platform.OS === 'android' && !hasConfiguredAndroidChannel) {
    hasConfiguredAndroidChannel = true;
    await Notifications.setNotificationChannelAsync(GPS_WARMUP_CHANNEL_ID, {
      name: 'Trip GPS',
      importance: Notifications.AndroidImportance.DEFAULT,
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

  await Notifications.dismissNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
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
  await Notifications.cancelScheduledNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
  await Notifications.dismissNotificationAsync(GPS_WARMUP_NOTIFICATION_ID).catch(() => undefined);
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
