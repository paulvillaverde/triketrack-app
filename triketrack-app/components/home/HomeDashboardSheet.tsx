import { Pressable, Text, View } from 'react-native';
import { Avatar, AppIcon } from '../ui';
import {
  MAXIM_UI_BORDER_DARK,
  MAXIM_UI_GREEN_BORDER_DARK,
  MAXIM_UI_GREEN_SOFT_DARK,
  MAXIM_UI_MUTED_DARK,
  MAXIM_UI_SUBTLE_DARK,
  MAXIM_UI_SURFACE_ALT_DARK,
  MAXIM_UI_SURFACE_ELEVATED_DARK,
  MAXIM_UI_TEXT_DARK,
} from '../../screens/homeScreenShared';

type HomeStatsFilter = 'TODAY' | 'YESTERDAY' | 'LAST_WEEK' | 'LAST_30_DAYS';

type HomeDashboardSheetProps = {
  isDriverOnline: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onOpenNotifications: () => void;
  unreadNotificationCount: number;
  tripOpenPending: boolean;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  totalEarnings: number;
  totalTrips: number;
  distanceSummaryKm: string;
  statsFilter: HomeStatsFilter;
  onChangeStatsFilter: (value: HomeStatsFilter) => void;
  formatPeso: (amount: number) => string;
  localStyles: Record<string, any>;
  insetsTop: number;
  insetsBottom: number;
  isLowBatteryMapMode?: boolean;
};

export function HomeDashboardSheet({
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  onOpenNotifications,
  unreadNotificationCount,
  tripOpenPending,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  totalEarnings,
  totalTrips,
  distanceSummaryKm,
  statsFilter,
  onChangeStatsFilter,
  formatPeso,
  localStyles,
  insetsTop,
  insetsBottom,
  isLowBatteryMapMode = false,
}: HomeDashboardSheetProps) {
  const filterLabel =
    statsFilter === 'TODAY'
      ? 'Today'
      : statsFilter === 'YESTERDAY'
        ? 'Yesterday'
        : statsFilter === 'LAST_WEEK'
          ? 'Last Week'
          : 'Last 30 Days';

  return (
    <>
      <View
        style={[
          localStyles.statusBarCard,
          isLowBatteryMapMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
              }
            : null,
          { top: 8 + (insetsTop || 0) },
        ]}
      >
        <Text
          style={[
            localStyles.statusTitle,
            isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
          ]}
        >
          {isDriverOnline ? 'Online' : 'Offline'}
        </Text>
        <View style={localStyles.statusActions}>
          <Pressable
            style={[
              localStyles.statusIconButton,
              isLowBatteryMapMode
                ? {
                    backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                    borderColor: MAXIM_UI_BORDER_DARK,
                  }
                : null,
            ]}
            onPress={onOpenNotifications}
          >
            <AppIcon
              name="bell"
              size={16}
              color={isLowBatteryMapMode ? MAXIM_UI_TEXT_DARK : '#0F172A'}
            />
            {unreadNotificationCount > 0 ? (
              <View style={localStyles.notificationBadge}>
                <Text style={localStyles.notificationBadgeText}>
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={[
              localStyles.statusToggle,
              isDriverOnline ? localStyles.statusToggleOn : localStyles.statusToggleOff,
              !isDriverOnline && localStyles.statusToggleLocked,
            ]}
            hitSlop={10}
            disabled={!isDriverOnline}
            onPress={() => {
              if (isDriverOnline) {
                onGoOffline();
              }
            }}
          >
            <View
              style={[
                localStyles.statusToggleThumb,
                isDriverOnline
                  ? localStyles.statusToggleThumbOn
                  : localStyles.statusToggleThumbOff,
              ]}
            />
          </Pressable>
        </View>
      </View>

      {!isDriverOnline ? (
        <View style={[localStyles.offlineBanner, { top: 58 + (insetsTop || 0) }]}>
          <AppIcon name="cloud-off" size={14} color="#FFFFFF" />
          <Text style={localStyles.offlineBannerText}>
            You are offline. Use the route action to go online and start trips.
          </Text>
        </View>
      ) : null}
      {isDriverOnline && tripOpenPending ? (
        <View style={[localStyles.tripGateBanner, { top: 162 + (insetsTop || 0) }]}>
          <AppIcon name="navigation" size={14} color="#FFFFFF" />
          <Text style={localStyles.tripGateBannerText}>
            Waiting for GPS before opening trip...
          </Text>
        </View>
      ) : null}
      <View
        style={[
          localStyles.dashboardSheet,
          isLowBatteryMapMode
            ? {
                backgroundColor: MAXIM_UI_SURFACE_ELEVATED_DARK,
                borderColor: MAXIM_UI_BORDER_DARK,
              }
            : null,
          { bottom: 100 + (insetsBottom || 0) },
        ]}
      >
        <View style={localStyles.sheetHeaderRow}>
          <View style={localStyles.avatarChip}>
            <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatarImage} />
          </View>
          <View style={localStyles.driverMeta}>
            <Text
              style={[
                localStyles.driverName,
                isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
              ]}
              numberOfLines={1}
            >
              {profileName}
            </Text>
            <Text
              style={[
                localStyles.driverSub,
                isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
              ]}
              numberOfLines={1}
            >
              {profileDriverCode} {'\u2022'} {profilePlateNumber}
            </Text>
          </View>
          <View style={localStyles.statsFilterWrap}>
            <Pressable
              style={[
                localStyles.statsFilterButton,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
              onPress={() => {
              const order: HomeStatsFilter[] = ['TODAY', 'YESTERDAY', 'LAST_WEEK', 'LAST_30_DAYS'];
              const currentIndex = order.indexOf(statsFilter);
              const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % order.length : 0;
              onChangeStatsFilter(order[nextIndex] ?? 'TODAY');
            }}>
              <Text
                style={[
                  localStyles.todayText,
                  isLowBatteryMapMode ? { color: MAXIM_UI_MUTED_DARK } : null,
                ]}
              >
                {filterLabel}
              </Text>
              <AppIcon
                name="chevron-right"
                size={14}
                color={isLowBatteryMapMode ? MAXIM_UI_MUTED_DARK : '#334155'}
                style={{ transform: [{ rotate: '90deg' }] }}
              />
            </Pressable>
          </View>
        </View>

        <View style={localStyles.statsCard}>
          <View style={localStyles.metricRow}>
            <View
              style={[
                localStyles.metricCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <View
                style={[
                  localStyles.metricPesoIconWrap,
                  isLowBatteryMapMode
                    ? {
                        backgroundColor: MAXIM_UI_GREEN_SOFT_DARK,
                        borderWidth: 1,
                        borderColor: MAXIM_UI_GREEN_BORDER_DARK,
                      }
                    : null,
                ]}
              >
                <AppIcon name="dollar-sign" size={15} color="#57c7a8" />
              </View>
              <Text
                style={[
                  localStyles.metricLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                ]}
              >
                Total earned
              </Text>
              <Text
                style={[
                  localStyles.metricValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {formatPeso(totalEarnings)}
              </Text>
            </View>
            <View
              style={[
                localStyles.metricCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <AppIcon name="map" size={18} color="#57c7a8" />
              <Text
                style={[
                  localStyles.metricLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                ]}
              >
                Total trips
              </Text>
              <Text
                style={[
                  localStyles.metricValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {totalTrips}
              </Text>
            </View>
            <View
              style={[
                localStyles.metricCard,
                isLowBatteryMapMode
                  ? {
                      backgroundColor: MAXIM_UI_SURFACE_ALT_DARK,
                      borderColor: MAXIM_UI_BORDER_DARK,
                    }
                  : null,
              ]}
            >
              <AppIcon name="map-pin" size={18} color="#57c7a8" />
              <Text
                style={[
                  localStyles.metricLabel,
                  isLowBatteryMapMode ? { color: MAXIM_UI_SUBTLE_DARK } : null,
                ]}
              >
                Total distance
              </Text>
              <Text
                style={[
                  localStyles.metricValue,
                  isLowBatteryMapMode ? { color: MAXIM_UI_TEXT_DARK } : null,
                ]}
              >
                {distanceSummaryKm} km
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
