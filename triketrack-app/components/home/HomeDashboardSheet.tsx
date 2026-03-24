import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '../ui';

type HomeDashboardSheetProps = {
  isDriverOnline: boolean;
  onGoOnline: () => void;
  onGoOffline: () => void;
  isResolvingAccurateLocation: boolean;
  tripOpenPending: boolean;
  firstFixDurationMs: number | null;
  displayAccuracyMeters: number | null;
  locationFreshnessSeconds: number;
  gpsDebugText: string;
  profileName: string;
  profileDriverCode: string;
  profilePlateNumber: string;
  profileImageUri: string | null;
  totalEarnings: number;
  totalTrips: number;
  distanceSummaryKm: string;
  formatPeso: (amount: number) => string;
  localStyles: Record<string, any>;
  insetsBottom: number;
};

export function HomeDashboardSheet({
  isDriverOnline,
  onGoOnline,
  onGoOffline,
  isResolvingAccurateLocation,
  tripOpenPending,
  firstFixDurationMs,
  displayAccuracyMeters,
  locationFreshnessSeconds,
  gpsDebugText,
  profileName,
  profileDriverCode,
  profilePlateNumber,
  profileImageUri,
  totalEarnings,
  totalTrips,
  distanceSummaryKm,
  formatPeso,
  localStyles,
  insetsBottom,
}: HomeDashboardSheetProps) {
  return (
    <>
      <View style={localStyles.statusBarCard}>
        <Text style={localStyles.statusTitle}>{isDriverOnline ? 'Online' : 'Offline'}</Text>
        <View style={localStyles.statusActions}>
          <Pressable
            style={localStyles.statusIconButton}
            onPress={() => Alert.alert('Notifications', 'No notifications yet.')}
          >
            <Feather name="bell" size={16} color="#0F172A" />
          </Pressable>
          <Pressable
            style={[
              localStyles.statusToggle,
              isDriverOnline ? localStyles.statusToggleOn : localStyles.statusToggleOff,
            ]}
            onPress={() => {
              if (isDriverOnline) {
                onGoOffline();
                return;
              }
              onGoOnline();
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
        <View style={localStyles.offlineBanner}>
          <Feather name="cloud-off" size={14} color="#FFFFFF" />
          <Text style={localStyles.offlineBannerText}>
            You are offline. Go online to start trips.
          </Text>
        </View>
      ) : null}
      {isDriverOnline && isResolvingAccurateLocation ? (
        <View style={localStyles.locationWarmupBanner}>
          <Feather name="crosshair" size={14} color="#FFFFFF" />
          <Text style={localStyles.locationWarmupBannerText}>
            Getting a stable GPS fix...
          </Text>
        </View>
      ) : null}
      {isDriverOnline && tripOpenPending ? (
        <View style={localStyles.tripGateBanner}>
          <Feather name="navigation" size={14} color="#FFFFFF" />
          <Text style={localStyles.tripGateBannerText}>
            Waiting for GPS before opening trip...
          </Text>
        </View>
      ) : null}
      {isDriverOnline &&
      (firstFixDurationMs !== null || displayAccuracyMeters !== null || locationFreshnessSeconds > 0) ? (
        <View style={localStyles.gpsDebugBadge}>
          <Feather name="crosshair" size={12} color="#0F172A" />
          <Text style={localStyles.gpsDebugText}>{gpsDebugText}</Text>
        </View>
      ) : null}

      <View style={[localStyles.dashboardSheet, { bottom: 100 + (insetsBottom || 0) }]}>
        <View style={localStyles.sheetHeaderRow}>
          <View style={localStyles.avatarChip}>
            <Avatar name={profileName} imageUri={profileImageUri} style={localStyles.avatarImage} />
          </View>
          <View style={localStyles.driverMeta}>
            <Text style={localStyles.driverName} numberOfLines={1}>
              {profileName}
            </Text>
            <Text style={localStyles.driverSub} numberOfLines={1}>
              {profileDriverCode} {'\u2022'} {profilePlateNumber}
            </Text>
          </View>
          <Text style={localStyles.todayText}>Today</Text>
        </View>

        <View style={localStyles.statsCard}>
          <View style={localStyles.metricRow}>
            <View style={localStyles.metricCard}>
              <View style={localStyles.metricPesoIconWrap}>
                <Text style={localStyles.metricPesoIconText}>{'\u20B1'}</Text>
              </View>
              <Text style={localStyles.metricLabel}>Total earned</Text>
              <Text style={localStyles.metricValue}>{formatPeso(totalEarnings)}</Text>
            </View>
            <View style={localStyles.metricCard}>
              <Feather name="file-text" size={18} color="#57c7a8" />
              <Text style={localStyles.metricLabel}>Total trips</Text>
              <Text style={localStyles.metricValue}>{totalTrips}</Text>
            </View>
            <View style={localStyles.metricCard}>
              <Feather name="map-pin" size={18} color="#57c7a8" />
              <Text style={localStyles.metricLabel}>Total distance</Text>
              <Text style={localStyles.metricValue}>{distanceSummaryKm} km</Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
